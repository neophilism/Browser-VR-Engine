"""One local, credential-filtered VRSpace release evaluation; no hosted acceptance claim."""
import argparse
from contextlib import ExitStack
from datetime import datetime, timezone
import fcntl
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import time
import zlib

ROOT = Path(__file__).resolve().parent
CHECKS = (
    'two-independent-real-service-sessions', 'same-frozen-f03-venue-in-both-canvases',
    'mutual-presence-from-server-add-events', 'alpha-keyboard-pose-visible-to-beta',
    'beta-keyboard-pose-visible-to-alpha', 'disconnect-removes-remote-guest',
    'same-browser-rejoin-restores-pose-flow',
    'upstream-sdk-automatic-reconnect-after-controlled-close', 'wire-evidence-and-no-browser-errors',
)
SERVICE_FILES = {
    'frontend.mjs', 'network.js', 'browser-checks.mjs', 'run-clean.py', 'environment.py',
    'setup.py', 'server-run.py', 'server.properties', 'stop-server.py', 'observe-server.py',
    'process_control.py', 'source-pins.json', 'source-files.json', 'vendor/vrspace/client.js', 'package.json', 'package-lock.json',
}
METADATA = ('world.json', 'catalog.json', 'scenario.json', 'thresholds.json', 'workloads.json',
            'devices.json', 'schema-set.json', 'comparison.json')
ARTIFACTS = ('browser-checks.json', 'alpha-courtyard.png', 'beta-courtyard.png')


def now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def contained(root, name):
    require(isinstance(name, str) and re.fullmatch(r'[A-Za-z0-9._/-]+', name)
            and not any(part in ('', '.', '..') for part in name.split('/'))
            and not name.startswith('/'), 'Unsafe evaluation path')
    path = (root / name).resolve(strict=True)
    require(path.is_relative_to(root.resolve()) and path.is_file(), 'Evaluation file escaped its package')
    return path


def read_bytes(root, name, limit=16 * 1024 * 1024):
    path = contained(root, name)
    require(path.stat().st_size <= limit, 'Oversized evaluation artifact: ' + name)
    return path.read_bytes()


def read_json(root, name):
    return json.loads(read_bytes(root, name))


def fingerprint(root, name):
    path = contained(root, name)
    with path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'bytes': path.stat().st_size, 'sha256': digest}


def source_snapshot(root):
    suffixes = {'.py', '.mjs', '.js', '.json', '.html', '.properties'}
    paths = {path.name for path in root.iterdir() if path.is_file() and path.suffix in suffixes}
    for directory in ('src', 'vendor', 'test', 'tests'):
        base = root / directory
        if base.exists():
            paths.update(path.relative_to(root).as_posix() for path in base.rglob('*')
                         if path.is_file() and (path.suffix in suffixes or path.name.startswith('LICENSE')))
    return {name: fingerprint(root, name) for name in sorted(paths)}


def checked_inputs(root, f05_root, fixture_root):
    service = source_snapshot(root)
    require(SERVICE_FILES.issubset(service), 'Corrected service runtime files are missing')
    declared = read_json(root, 'source-files.json')
    require(isinstance(declared, list) and all(isinstance(item, str) for item in declared)
            and len(set(declared)) == len(declared) and SERVICE_FILES.issubset(declared)
            and set(declared).issubset(service), 'Invalid declared service source inventory')
    pins = read_json(root, 'source-pins.json')
    require(service['vendor/vrspace/client.js']['sha256'] == pins['client']['sha256'], 'Client pin mismatch')
    require(service['server.properties']['sha256'] == pins['profile']['sha256'], 'Profile pin mismatch')
    require(fingerprint(root, 'vendor/vrspace/LICENSE')['sha256'] == pins['license']['sha256'], 'License pin mismatch')
    build = read_json(f05_root, 'dist/build.json')
    require(build.get('schemaVersion') == 1, 'Unsupported sibling build manifest')
    for category in ('inputs', 'outputs'):
        items = build.get(category)
        require(isinstance(items, dict) and items, 'Missing sibling build ' + category)
        for name, expected in items.items():
            if category == 'outputs':
                require(name.startswith('dist/'), 'Sibling build output is outside dist')
            require(fingerprint(f05_root, name) == expected, 'Changed sibling build file: ' + name)
    require('dist/main.js' in build['outputs'], 'Sibling renderer output is missing')
    fixture_pins = read_json(f05_root, 'fixture-pins.json')
    require(set(fixture_pins['files']) == set(METADATA), 'Unexpected fixture metadata contract')
    metadata = {}
    for name in METADATA:
        value = fingerprint(fixture_root, name)
        require(value == fixture_pins['files'][name], 'Changed frozen fixture: ' + name)
        metadata[name.removesuffix('.json')] = value['sha256']
    require(build.get('fixtureDigests') == metadata, 'Sibling build uses different fixtures')
    comparison = read_json(fixture_root, 'comparison.json')
    require(comparison['fixtureSetId'] == fixture_pins['fixtureSetId'], 'Fixture comparison set mismatch')
    resources = {}
    for item in read_json(fixture_root, 'catalog.json')['resources']:
        require(item['path'] not in resources, 'Duplicate fixture resource')
        value = fingerprint(fixture_root, item['path'])
        require(value == {'bytes': item['sizeBytes'], 'sha256': item['sha256']}, 'Changed fixture resource: ' + item['path'])
        resources[item['path']] = value
    return {'service': service, 'serviceBrowserSources': declared, 'sourcePins': pins, 'siblingSource': source_snapshot(f05_root),
            'build': build, 'buildFingerprint': fingerprint(f05_root, 'dist/build.json'),
            'fixtureDigests': metadata, 'resources': resources, 'comparison': comparison}


def ensure_directory(root, name):
    path = root
    for part in name.split('/'):
        require(part not in ('', '.', '..'), 'Unsafe output directory')
        path = path / part
        require(not path.is_symlink(), 'Output directory must not be a symlink')
        path.mkdir(exist_ok=True)
        require(path.is_dir(), 'Output path must be a directory')
    return path


def load_helper(root, name):
    path = contained(root, name + '.py')
    spec = importlib.util.spec_from_file_location('bve_service_' + name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def finish_supervisor(proc, timeout):
    """Give the owned supervisor time for its bounded descendant cleanup."""
    result = {'terminateSent': False, 'killSent': False}
    if proc.poll() is None:
        result['terminateSent'] = True
        proc.terminate()
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            result['killSent'] = True
            proc.kill()
            proc.wait(timeout=2)
    return result


def run_command(argv, *, root, environment, log_path, timeout, cancelled=lambda: False,
                terminate_timeout=5, kill_timeout=5):
    result = {'argv': argv, 'cwd': str(root), 'startedAt': now(), 'outcome': 'failed', 'exitCode': None}
    started = time.monotonic()
    errors = []
    proc = None
    evidence = None
    try:
        require(not cancelled(), 'Automation was interrupted before command start')
        supervisor = Path(__file__).resolve().with_name('command-supervisor.py')
        require(supervisor.is_file(), 'Stage supervisor source is missing')
        with tempfile.NamedTemporaryFile(prefix=log_path.stem + '-', suffix='.process.json',
                                         dir=log_path.parent, delete=False) as evidence, log_path.open('wb') as log:
            result['processEvidence'] = Path(evidence.name).name
            # Only this dedicated child adopts descendants. A concurrent Java
            # launcher is a sibling and cannot be mistaken for a stage process.
            command = [sys.executable, '-B', '-O', str(supervisor), '--report-fd', str(evidence.fileno()),
                       '--term-seconds', str(terminate_timeout), '--kill-seconds', str(kill_timeout), '--', *argv]
            proc = subprocess.Popen(command, cwd=root, env=environment, stdin=subprocess.DEVNULL,
                                    stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
                                    pass_fds=(evidence.fileno(),))
            try:
                while proc.poll() is None:
                    require(not cancelled(), 'Automation was interrupted')
                    require(time.monotonic() - started < timeout, 'Command deadline exceeded')
                    require(log_path.stat().st_size <= 16 * 1024 * 1024, 'Command log exceeded artifact limit')
                    time.sleep(.1)
            finally:
                result['supervisorShutdown'] = finish_supervisor(proc, terminate_timeout + kill_timeout + 2)
                result['supervisorExitCode'] = proc.returncode
    except BaseException as error:
        errors.append(type(error).__name__ + ': ' + str(error))
    if evidence is not None:
        try:
            raw = read_bytes(log_path.parent, Path(evidence.name).name, 64 * 1024)
            report = json.loads(raw)
            require(report.get('schemaVersion') == 1 and report.get('argv') == argv
                    and proc is not None and report.get('supervisorPid') == proc.pid,
                    'Stage process evidence is missing or belongs to another command')
            result['supervision'] = report
            result['exitCode'] = report.get('exitCode')
            require(report.get('shutdown', {}).get('stopped') is True,
                    'Stage descendant shutdown was not verified')
            require(result.get('supervisorShutdown', {}).get('killSent') is False,
                    'Stage supervisor required forced termination')
            require(report.get('outcome') == 'passed' and report.get('exitCode') == 0
                    and report.get('requestedSignal') is None and 'error' not in report
                    and report['shutdown'].get('needed') is False
                    and proc.returncode == 0, 'Stage failed or required descendant cleanup')
            if not errors:
                result['outcome'] = 'passed'
        except Exception as error:
            errors.append(type(error).__name__ + ': ' + str(error))
    if errors:
        result['error'] = '; '.join(errors)
    if log_path.exists() and log_path.stat().st_size > 16 * 1024 * 1024:
        with log_path.open('r+b') as log:
            log.truncate(16 * 1024 * 1024)
        result.update({'outcome': 'failed', 'error': 'Command log exceeded artifact limit', 'logTruncated': True})
    result.update({'finishedAt': now(), 'durationMs': round((time.monotonic() - started) * 1000)})
    return result


def validate_audit(value, exit_code):
    require(exit_code == 0 and isinstance(value, dict) and not value.get('error'), 'Service toolkit audit did not pass')
    counts = value.get('metadata', {}).get('vulnerabilities', {})
    entries = value.get('vulnerabilities')
    levels = ('info', 'low', 'moderate', 'high', 'critical')
    require(isinstance(entries, dict) and all(type(counts.get(key)) is int and counts[key] >= 0
            for key in (*levels, 'total')), 'Invalid service toolkit audit result')
    require(all(isinstance(item, dict) and item.get('severity') in levels for item in entries.values()), 'Invalid audit entries')
    require(all(sum(item['severity'] == level for item in entries.values()) == counts[level] for level in levels)
            and len(entries) == counts['total'], 'Audit entries contradict counts')
    require(counts['high'] + counts['critical'] == 0, 'High or critical service toolkit advisories')


def validate_png(data):
    require(data[:8] == b'\x89PNG\r\n\x1a\n' and len(data) <= 16 * 1024 * 1024, 'Invalid screenshot PNG')
    offset, header, ended, compressed = 8, None, False, []
    while offset < len(data):
        require(offset + 12 <= len(data), 'Truncated screenshot chunk')
        size = struct.unpack('>I', data[offset:offset + 4])[0]
        end = offset + 12 + size
        require(end <= len(data), 'Truncated screenshot data')
        kind, payload = data[offset + 4:offset + 8], data[offset + 8:end - 4]
        require(zlib.crc32(data[offset + 4:end - 4]) == struct.unpack('>I', data[end - 4:end])[0], 'Screenshot checksum mismatch')
        if header is None:
            require(kind == b'IHDR' and size == 13, 'Screenshot header missing')
            header = struct.unpack('>IIBBBBB', payload)
            require(header[:3] == (1280, 800, 8) and header[3] in (2, 6) and header[4:] == (0, 0, 0), 'Unexpected screenshot dimensions')
        elif kind == b'IHDR':
            raise RuntimeError('Duplicate screenshot header')
        elif kind == b'IDAT':
            compressed.append(payload)
        elif kind == b'IEND':
            require(size == 0 and end == len(data), 'Invalid screenshot ending')
            ended = True
        offset = end
    require(ended and compressed, 'Incomplete screenshot')
    row_size = 1280 * (4 if header[3] == 6 else 3) + 1
    decoder = zlib.decompressobj()
    pixels = decoder.decompress(b''.join(compressed), row_size * 800 + 1)
    require(decoder.eof and len(pixels) == row_size * 800 and not decoder.unused_data, 'Incomplete or oversized screenshot pixels')
    require(all(pixels[row * row_size] <= 4 for row in range(800)), 'Invalid screenshot row filter')


def timestamp(value):
    require(isinstance(value, str), 'Invalid evidence timestamp')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(parsed.tzinfo is not None, 'Evidence timestamp must include a timezone')
    return parsed.timestamp()


def validate_browser(report, inputs, owned, stage, run_path, log):
    require(report.get('runStatus') == 'passed' and report.get('qualificationStatus') == 'incomplete', 'Service browser subset did not pass')
    require(report.get('counts') == {'passed': 9, 'failed': 0, 'checks': 9}, 'Incomplete service check counts')
    checks = report.get('checks')
    require(isinstance(checks, list) and all(isinstance(item, dict) for item in checks)
            and [item.get('id') for item in checks] == list(CHECKS)
            and all(item.get('status') == 'passed' and item.get('method') == 'two-real-browser-pages-and-release-server'
                    for item in checks), 'Required service browser checks changed or failed')
    require(report.get('requests') == [] and isinstance(report.get('logs'), list)
            and all(isinstance(item, dict) and item.get('type') in ('warning', 'warn') for item in report['logs']), 'Service browser errors or failed requests')
    observed = report.get('observed', {})
    require(isinstance(observed, dict), 'Malformed browser observations')
    require(observed.get('fatal') is None, 'Service browser fatal error or malformed fatal field')
    require(observed.get('cleanupErrors', []) == [], 'Service browser cleanup failed or malformed cleanup errors')
    final_states = observed.get('final')
    require(isinstance(final_states, list) and len(final_states) == 2
            and all(isinstance(state, dict) and state.get('errors') == [] for state in final_states),
            'Missing final client observations or remaining client errors')
    require(report.get('finalization') == {
        'evaluatedAfterCleanupSettled': True, 'browserErrors': 0, 'probeErrors': 0,
        'failedOrBlockedRequests': 0, 'cleanupErrors': 0,
    }, 'Browser report was not cleanly finalized after resource closure')
    require(observed.get('serverRun') == owned, 'Browser evidence uses a different server run')
    require(observed.get('health') == {'status': 200, 'body': {'status': 'UP'}}, 'Service health was not UP')
    require(report.get('sourcePins') == inputs['sourcePins'], 'Service source pins changed')
    source = report.get('sourceDigests')
    require(isinstance(source, dict) and set(source) == set(inputs['serviceBrowserSources']), 'Service runtime fingerprint coverage is incomplete')
    for name, digest in source.items():
        require(name in inputs['service'] and digest == inputs['service'][name]['sha256'], 'Changed browser source fingerprint: ' + name)
    require(report.get('baseBuild') == inputs['build'] and report.get('fixtureDigests') == inputs['fixtureDigests'], 'Browser source/build/fixture identity mismatch')
    times = [stage['startedAt'], report.get('startedAt'), report.get('finishedAt'), stage['finishedAt']]
    require(all(timestamp(a) <= timestamp(b) for a, b in zip(times, times[1:])), 'Stale browser evidence outside its command')
    require(stage['outcome'] == 'passed' and stage['exitCode'] == 0, 'Browser command failed')
    decoded = []
    for match in re.finditer(r'^\{\s*"runStatus"\s*:', log, re.MULTILINE):
        decoded.append(json.JSONDecoder().raw_decode(log[match.start():])[0])
    require(decoded == [{'runStatus': 'passed', 'counts': report['counts'], 'output': run_path}], 'Browser command output does not bind the fresh run')
    require(isinstance(report.get('missingEvidence'), list) and report['missingEvidence'], 'Qualification limitations missing')
    env = observed.get('environment', {})
    require(all(env.get(key) is False for key in ('physicalGPU', 'physicalHeadset', 'physicalAudio')),
            'Local software run cannot claim physical device evidence')


def run_directories(root, relative):
    path = root / relative
    if not path.exists():
        return set()
    require(not path.is_symlink(), 'Run directory must not be a symlink')
    values = set()
    for item in path.iterdir():
        if item.name.startswith('run-') or item.name.startswith('server-'):
            require(item.is_dir() and not item.is_symlink(), 'Run entry must be a real directory')
            values.add(item.name)
    return values


def wait_owned_server(root, launcher, before, control, cancelled, stack):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        require(not cancelled() and launcher.poll() is None, 'Server launcher exited or automation interrupted before ownership was recorded')
        try:
            record, directory, _config = control.read_record(root)
            if directory.name not in before:
                owned = stack.enter_context(control.recorded_process(root))
                require(owned[0] == record, 'Server ownership changed during acquisition')
                parent = next(line for line in owned[2].joinpath('status').read_text().splitlines() if line.startswith('PPid:'))
                require(int(parent.split()[1]) == launcher.pid, 'Recorded JVM is not this launcher child')
                return owned
        except FileNotFoundError:
            pass
        time.sleep(.1)
    raise RuntimeError('Server did not publish fresh owned process metadata')


def wait_health(launcher, pidfd, control, cancelled):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        require(not cancelled() and launcher.poll() is None and not control.exited(pidfd), 'Owned service exited before health readiness')
        connection = http.client.HTTPConnection('127.0.0.1', 18180, timeout=2)
        try:
            connection.request('GET', '/actuator/health')
            response = connection.getresponse()
            body = response.read(4097)
            require(len(body) <= 4096, 'Oversized service health response')
            if response.status == 200 and json.loads(body) == {'status': 'UP'}:
                return {'status': 200, 'body': {'status': 'UP'}, 'observedAt': now()}
        except (OSError, http.client.HTTPException, json.JSONDecodeError):
            pass
        finally:
            connection.close()
        time.sleep(.2)
    raise RuntimeError('Owned service did not reach HTTP 200 / UP within the health deadline')


def automate(root=ROOT):
    root = root.resolve(strict=True)
    require(sys.version_info >= (3, 11), 'Python 3.11 or newer is required')
    control = load_helper(root, 'process_control')
    control.require_linux_process_api()
    for name in ('artifacts', 'artifacts/automation-runs', 'artifacts/tmp', 'artifacts/tool-config',
                 'artifacts/npm-cache', 'downloads', 'content', 'content/rpm-anim'):
        ensure_directory(root, name)
    for name in ('.npmrc', '.yarnrc', '.yarnrc.yml'):
        require(not (root / name).exists(), 'Unexpected package configuration: ' + name)
    require(not (root / 'node_modules').is_symlink(), 'node_modules must not be a symlink')
    environment = load_helper(root, 'environment').clean_environment()
    def input_path(name, default):
        path = Path(environment.get(name, default))
        return (path if path.is_absolute() else root / path).resolve(strict=True)
    fixture_root = input_path('F03_FIXTURE_ROOT', '../../packages/qualification-fixtures/fixtures')
    f05_root = input_path('F05_EVALUATION_ROOT', '../babylon-vrspace')
    environment.update({'F03_FIXTURE_ROOT': str(fixture_root), 'F05_EVALUATION_ROOT': str(f05_root)})
    if 'PLAYWRIGHT_BROWSERS_PATH' in os.environ:
        browser_cache = Path(os.environ['PLAYWRIGHT_BROWSERS_PATH'])
        browser_cache = (browser_cache if browser_cache.is_absolute() else root / browser_cache).resolve(strict=True)
        require(browser_cache.is_dir(), 'PLAYWRIGHT_BROWSERS_PATH must name an installed browser cache')
        environment['PLAYWRIGHT_BROWSERS_PATH'] = str(browser_cache)
    # The package-level lock prevents two automation runs from sharing mutable service metadata.
    lock = os.fdopen(os.open(root / 'artifacts/automation.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600), 'a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        lock.close()
        raise RuntimeError('Another service automation run owns this package')
    output = Path(tempfile.mkdtemp(prefix='run-', dir=root / 'artifacts/automation-runs'))
    for name in ('logs', 'reports', 'browser', 'server'):
        (output / name).mkdir()
    record = {'schemaVersion': 1, 'kind': 'vrspace-release-local-automation', 'mode': 'local',
              'ciAcceptance': False, 'qualificationStatus': 'incomplete', 'runStatus': 'failed',
              'startedAt': now(), 'commands': [], 'failures': [], 'files': [],
              'scope': 'Local released service presence/pose subset. No authenticated, authoritative, media, physical-XR, capacity, or hosted-CI acceptance.'}
    cancelled = {'signal': None}
    def request_stop(number, _frame):
        if cancelled['signal'] is None:
            cancelled['signal'] = number
    previous = {number: signal.signal(number, request_stop) for number in (signal.SIGTERM, signal.SIGINT)}
    def write():
        control.write_json(output / 'manifest.json', record)
    def stage(name, argv, timeout, must_pass=True):
        path = output / 'logs' / (name + '.txt')
        result = run_command(argv, root=root, environment=environment, log_path=path,
                             timeout=timeout, cancelled=lambda: cancelled['signal'] is not None)
        result['id'] = name
        record['commands'].append(result)
        write()
        if must_pass:
            require(result['outcome'] == 'passed', 'Stage failed: ' + name)
        return result
    launcher = None
    owned = None
    log_handle = None
    inputs = None
    stack = ExitStack()
    write()
    try:
        inputs = checked_inputs(root, f05_root, fixture_root)
        record['inputs'] = inputs
        for port in (18180, 17687, 4176):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
                probe.bind(('127.0.0.1', port))
        stage('node-version', ['node', '--version'], 10)
        record['nodeVersion'] = read_bytes(output, 'logs/node-version.txt').decode().strip()
        require(re.fullmatch(r'v24\.\d+\.\d+', record['nodeVersion']), 'Node 24 is required')
        npm_options = ['--registry=https://registry.npmjs.org', '--fetch-timeout=15000', '--fetch-retries=0',
                       '--userconfig=' + environment['npm_config_userconfig'], '--globalconfig=' + environment['npm_config_globalconfig']]
        stage('toolkit-install', ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund', *npm_options], 180)
        audit = stage('toolkit-audit', ['npm', 'audit', '--json', '--audit-level=high', *npm_options], 45, must_pass=False)
        audit_bytes = read_bytes(output, 'logs/toolkit-audit.txt')
        (output / 'reports/dependency-audit.json').write_bytes(audit_bytes)
        require(audit['outcome'] == 'passed', 'Stage failed: toolkit-audit')
        validate_audit(json.loads(audit_bytes), audit['exitCode'])
        stage('release-download-verify', [sys.executable, 'setup.py'], 210)
        before_server = run_directories(root, 'artifacts')
        log_handle = (output / 'logs/server-launcher.txt').open('wb')
        launcher = subprocess.Popen([sys.executable, 'server-run.py'], cwd=root, env=environment,
                                    stdin=subprocess.DEVNULL, stdout=log_handle, stderr=subprocess.STDOUT,
                                    start_new_session=True)
        record['launcher'] = {'argv': [sys.executable, 'server-run.py'], 'cwd': str(root),
                              'pid': launcher.pid, 'startedAt': now(), 'outcome': 'running'}
        owned = wait_owned_server(root, launcher, before_server, control,
                                  lambda: cancelled['signal'] is not None, stack)
        record['server'] = owned[0]
        record['health'] = wait_health(launcher, owned[3], control, lambda: cancelled['signal'] is not None)
        write()
        before_browser = run_directories(root, 'artifacts/browser-runs')
        browser_stage = stage('service-browser', ['node', 'browser-checks.mjs'], 240, must_pass=False)
        added = run_directories(root, 'artifacts/browser-runs') - before_browser
        require(len(added) == 1, 'Browser command did not create exactly one new run')
        run_path = 'artifacts/browser-runs/' + added.pop()
        browser_dir = root / run_path
        for name in (*ARTIFACTS, 'failure-0.png', 'failure-1.png'):
            try:
                data = read_bytes(browser_dir, name)
                (output / 'browser' / name).write_bytes(data)
            except FileNotFoundError:
                pass
        record['browserRun'] = run_path
        stage('owned-network-snapshot', [sys.executable, 'observe-server.py'], 15)
        snapshot = read_json(output, 'logs/owned-network-snapshot.txt')
        (output / 'server/process-snapshot.json').write_text(json.dumps(snapshot, indent=2) + '\n')
        require(snapshot['process']['Pid'] == str(owned[0]['pid'])
                and snapshot['processStartTicks'] == owned[0]['processStartTicks'], 'Snapshot process ownership mismatch')
        control.ensure_loopback_sockets(snapshot['sockets'])
        require(snapshot['allOwnedListenersLoopback'] is True
                and snapshot['allObservedEstablishedConnectionsLoopback'] is True, 'Invalid network snapshot outcome')
        report = read_json(browser_dir, 'browser-checks.json')
        record['counts'] = report.get('counts')
        latest = read_json(root, 'artifacts/latest-browser-run.json')
        require(latest == {'directory': str(browser_dir), 'runStatus': report['runStatus'], 'counts': report['counts']}, 'Latest browser pointer is stale or inconsistent')
        validate_browser(report, inputs, owned[0], browser_stage, run_path,
                         read_bytes(output, 'logs/service-browser.txt').decode())
        for name in ARTIFACTS[1:]:
            validate_png(read_bytes(output, 'browser/' + name))
    except BaseException as error:
        record['failures'].append(type(error).__name__ + ': ' + str(error))
    finally:
        if launcher is not None:
            shutdown = {'startedAt': now()}
            try:
                # The corrected launcher owns Java cleanup; allow its TERM20/KILL5 deadlines plus metadata time.
                parent_error = None
                try:
                    control.terminate_child(launcher, shutdown, terminate_timeout=30, kill_timeout=5)
                except BaseException as error:
                    parent_error = error
                require(owned is not None, 'Launcher never established verified Java ownership')
                if not control.exited(owned[3], 1):
                    # Kernel handle was pinned only after verifying this launcher's child identity.
                    shutdown['javaFallbackTerminate'] = True
                    signal.pidfd_send_signal(owned[3], signal.SIGTERM)
                    if not control.exited(owned[3], control.TERMINATE_TIMEOUT):
                        shutdown['javaFallbackKill'] = True
                        signal.pidfd_send_signal(owned[3], signal.SIGKILL)
                        require(control.exited(owned[3], control.KILL_TIMEOUT), 'Owned Java survived shutdown deadlines')
                    raise RuntimeError('Java required fallback cleanup after its launcher exited')
                for name in ('run.json', 'server.log'):
                    (output / 'server' / name).write_bytes(read_bytes(owned[1], name))
                if parent_error is not None:
                    raise parent_error
                final = read_json(output, 'server/run.json')
                require(final.get('pid') == owned[0]['pid'] and final.get('processStartTicks') == owned[0]['processStartTicks'], 'Final server ownership metadata differs')
                require(not final.get('failure') and final.get('shutdown', {}).get('killSent') is False
                        and final.get('exitCode') in (0, 143, -signal.SIGTERM), 'Server shutdown was not clean')
                require(not shutdown['killSent'] and launcher.returncode == 143, 'Server launcher shutdown failed')
                shutdown['stopped'] = True
            except BaseException as error:
                shutdown['error'] = type(error).__name__ + ': ' + str(error)
                record['failures'].append('Shutdown: ' + shutdown['error'])
            shutdown['finishedAt'] = now()
            record['shutdown'] = shutdown
            record['launcher'].update({'exitCode': launcher.returncode, 'finishedAt': shutdown['finishedAt'],
                                       'outcome': 'stopped' if shutdown.get('stopped') is True else 'failed'})
        stack.close()
        if log_handle:
            log_handle.close()
        try:
            if inputs is not None:
                require(checked_inputs(root, f05_root, fixture_root) == inputs, 'Source/build/fixtures changed during automation')
        except Exception as error:
            record['failures'].append('Inputs: ' + str(error))
        if cancelled['signal'] is not None:
            record['failures'].append('Interrupted by signal ' + str(cancelled['signal']))
        record['finishedAt'] = now()
        record['runStatus'] = 'passed' if not record['failures'] and record.get('shutdown', {}).get('stopped') is True else 'failed'
        for path in sorted(output.rglob('*')):
            if path.is_file() and path.name != 'manifest.json':
                name = path.relative_to(output).as_posix()
                require(path.stat().st_size <= 16 * 1024 * 1024, 'Oversized retained artifact')
                record['files'].append({'path': name, **fingerprint(output, name)})
        write()
        for number, handler in previous.items():
            signal.signal(number, handler)
        lock.close()
    print(json.dumps({'runStatus': record['runStatus'], 'qualificationStatus': 'incomplete', 'ciAcceptance': False,
                      'counts': record.get('counts'), 'output': str(output), 'failures': record['failures']}, indent=2))
    return 0 if record['runStatus'] == 'passed' else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    try:
        raise SystemExit(automate())
    except Exception as error:
        print(type(error).__name__ + ': ' + str(error), file=sys.stderr)
        raise SystemExit(1)
