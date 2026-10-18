"""Pinned Hubs service diagnostic. No deployment or complete F04 qualification claim."""
import argparse
from datetime import datetime, timezone
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
import ssl
import sys
import time
from urllib.parse import urlsplit
from config import (BUNDLE, ROOT, REPOSITORY, CHECKS, LABEL, SERVICES, audit_allows_runtime,
                    audit_verdict, contained, fingerprint, make_compose, overall_status,
                    pins, require, verified_fixtures)
from prepare import prepare_contexts, verify_source
from cleanup import cleanup_owned, validate_containers as validate_owned_containers


def now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def read_json(path):
    path = Path(path)
    require(path.is_file() and path.stat().st_size <= 16 * 1024 * 1024, 'Missing or oversized JSON evidence')
    return json.loads(path.read_text())


def runtime_sources():
    files = [path for path in ROOT.rglob('*') if path.is_file() and not {'__pycache__', 'evidence', 'artifacts'}.intersection(path.relative_to(ROOT).parts)
             and (path.suffix in ('.py', '.mjs', '.json', '.exs', '.Dockerfile') or path.name == 'git-config')]
    return {path.relative_to(ROOT).as_posix(): fingerprint(path) for path in sorted(files)}


def verified_shared(pin_value, directory=None):
    directory = directory or REPOSITORY / 'evaluations/vrspace-service'
    require(set(pin_value['sharedSupervisor']) == {'automate.py', 'command-supervisor.py'},
            'Unexpected shared process helper inventory')
    files = {}
    for name, expected in pin_value['sharedSupervisor'].items():
        files[name] = fingerprint(contained(directory, name))
        require(files[name]['sha256'] == expected['sha256'],
                'Reviewed shared process helper changed; review and rebind it explicitly')
    return files


def load_shared(pin_value, snapshot=None):
    directory = REPOSITORY / 'evaluations/vrspace-service'
    verified_shared(pin_value, directory)
    if snapshot is not None:
        # run_command resolves its supervisor relative to its own __file__.
        # Execute only this new, verified copy throughout work and cleanup.
        snapshot.mkdir(mode=0o700)
        for name in pin_value['sharedSupervisor']:
            target = snapshot / name
            target.write_bytes(contained(directory, name).read_bytes())
            target.chmod(0o400)
        verified_shared(pin_value, snapshot)
        directory = snapshot
    spec = importlib.util.spec_from_file_location('f04_reviewed_process_owner', directory / 'automate.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def reject_project_configuration(directory):
    directory = Path(directory).resolve(strict=True)
    # npm can discover a workspace root above its CWD. Explicit user/global
    # config paths do not disable project config, including broken symlinks.
    for parent in (directory, *directory.parents):
        for name in ('.npmrc', '.yarnrc', '.yarnrc.yml'):
            path = parent / name
            require(not path.exists() and not path.is_symlink(), 'Unexpected package configuration: ' + name)
    require(not (directory / 'node_modules').is_symlink(), 'node_modules must not be a symlink')


def safe_proxy(value):
    require(isinstance(value, str) and not any(ord(c) < 33 or ord(c) == 127 for c in value),
            'Malformed proxy setting')
    parsed = urlsplit(value)
    require(parsed.scheme in ('http', 'https') and parsed.hostname and parsed.username is None
            and parsed.password is None and not parsed.query and not parsed.fragment,
            'Proxy settings must not contain credentials or unsupported components')
    return value


def environment(run_dir):
    config = run_dir / 'work/tool-config'
    config.mkdir(parents=True)
    for name in ('npm-user', 'npm-global', 'git-config'):
        (config / name).write_bytes(b'')
    for name in ('tmp', 'npm-cache', 'docker-config'):
        (config / name).mkdir()
    env = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
           'TZ': 'UTC', 'NODE_USE_SYSTEM_CA': '1', 'TMPDIR': str(config / 'tmp'), 'TMP': str(config / 'tmp'),
           'TEMP': str(config / 'tmp'), 'npm_config_userconfig': str(config / 'npm-user'),
           'npm_config_globalconfig': str(config / 'npm-global'), 'npm_config_cache': str(config / 'npm-cache'),
           'npm_config_registry': 'https://registry.npmjs.org', 'npm_config_fetch_retries': '0',
           'npm_config_fetch_timeout': '15000', 'npm_config_audit': 'false', 'npm_config_fund': 'false',
           'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': str(config / 'git-config'), 'GIT_TERMINAL_PROMPT': '0',
           'DOCKER_CONFIG': str(config / 'docker-config'), 'PYTHONDONTWRITEBYTECODE': '1',
           'PLAYWRIGHT_BROWSERS_PATH': str(BUNDLE / 'artifacts/browsers')}
    for name in ('HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy',
                 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'CURL_CA_BUNDLE'):
        if name in os.environ:
            env[name] = safe_proxy(os.environ[name]) if name.lower() in ('https_proxy', 'http_proxy') else os.environ[name]
    if os.environ.get('CHROME_EXECUTABLE'):
        env['CHROME_EXECUTABLE'] = str(Path(os.environ['CHROME_EXECUTABLE']).resolve(strict=True))
    return env


def prerequisites():
    tools = {name: shutil.which(name) for name in ('docker', 'git', 'node', 'npm', 'openssl')}
    missing = [name for name, value in tools.items() if value is None]
    namespace = False
    try:
        namespace = Path('/proc/self/stat').read_text().split(' ', 1)[0] == str(os.getpid())
        children = (Path('/proc') / str(os.getpid()) / 'task' / str(os.getpid()) / 'children').is_file()
    except OSError:
        children = False
    if not sys.platform.startswith('linux') or os.uname().machine != 'x86_64':
        missing.append('Linux x86_64 host')
    if not namespace or not children or not hasattr(os, 'pidfd_open') or not hasattr(signal, 'pidfd_send_signal'):
        missing.append('same-namespace procfs task/children and pidfd supervision')
    if not Path('/var/run/docker.sock').exists():
        missing.append('local Docker daemon socket /var/run/docker.sock')
    return {'tools': tools, 'samePidNamespace': namespace, 'procfsChildren': children,
            'missing': missing, 'passed': not missing}


def bounded_timeout(overall_deadline, requested, current=None):
    remaining = overall_deadline - (time.monotonic() if current is None else current)
    require(remaining > 0, 'Overall 45 minute runtime deadline exceeded')
    return min(requested, remaining)


class LocalTLS(http.client.HTTPSConnection):
    def connect(self):
        raw = socket.create_connection(('127.0.0.1', self.port), timeout=self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname='hubs.local')
        except BaseException:
            raw.close()
            raise


def local_get(port, path, cert):
    require(port in (4000, 8080) and path.startswith('/') and '\r' not in path and '\n' not in path,
            'Readiness may request only declared local HTTPS paths')
    connection = LocalTLS('hubs.local', port, timeout=2, context=ssl.create_default_context(cafile=str(cert)))
    try:
        connection.request('GET', path, headers={'Host': 'hubs.local:' + str(port)})
        response = connection.getresponse()
        data = response.read(2 * 1024 * 1024 + 1)
        require(response.status == 200 and len(data) <= 2 * 1024 * 1024, 'Local readiness response was not bounded HTTP 200')
        return data
    finally:
        connection.close()


def validate_browser(report, expected):
    require(isinstance(report, dict) and report.get('schemaVersion') == 1
            and report.get('runId') == expected['runId'] and report.get('input') == expected,
            'Browser report is stale or uses different inputs')
    checks = report.get('checks')
    require(isinstance(checks, list) and [item.get('id') for item in checks if isinstance(item, dict)] == list(CHECKS)
            and len(checks) == len(CHECKS) and all(item.get('status') == 'passed' for item in checks),
            'The nine actual Hubs checks did not all pass')
    require(report.get('runStatus') == 'passed' and report.get('counts') == {'passed': len(CHECKS), 'failed': 0},
            'Contradictory browser status')
    require(report.get('errors') == [] and report.get('failedRequests') == [] and report.get('blockedRequests') == []
            and report.get('cleanupErrors') == [] and report.get('fatal') is None
            and report.get('cleanupSettled') is True, 'Browser errors, forbidden egress or cleanup failure')
    require(isinstance(report.get('screenshots'), dict) and set(report['screenshots']) == {'alpha.png', 'beta.png'},
            'Browser screenshot identities are missing')


def collect_artifacts(evidence):
    allowed = re.compile(r'(?:logs/[a-z0-9][a-z0-9_-]*\.(?:txt|process\.json)|'
                         r'audits/(?:toolkit|hubs|dialog)\.(?:stdout\.json|stderr\.txt|receipt\.json)|'
                         r'browser/(?:input\.json|browser-checks\.json|alpha\.png|beta\.png)|'
                         r'(?:compose|adaptations|containers-running|containers-before-shutdown)\.json)')
    files, failures, total = {}, [], 0
    for path in sorted(evidence.rglob('*')):
        if not path.is_file() or path.name in ('manifest.json', 'progress.json'):
            continue
        name = path.relative_to(evidence).as_posix()
        try:
            require(allowed.fullmatch(name) is not None and not path.is_symlink(), 'Unlisted artifact')
            require(path.stat().st_size <= 16 * 1024 * 1024, 'Oversized artifact')
            data = path.read_bytes()
            if path.suffix != '.png':
                require(not re.search(rb'-----BEGIN [A-Z ]*PRIVATE KEY-----', data), 'Private key material in artifact')
                require(not re.search(rb'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', data), 'Ephemeral grant in artifact')
            total += len(data)
            require(total <= 64 * 1024 * 1024, 'Artifact collection exceeds 64 MiB')
            files[name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        except (OSError, RuntimeError) as error:
            failures.append(name + ': ' + str(error))
    return files, failures


def main(mode, run_id=None):
    overall_deadline = time.monotonic() + 45 * 60
    run_id = run_id or 'f04-' + secrets.token_hex(8)
    require(re.fullmatch(r'f04-[0-9a-f]{16}', run_id), 'Invalid runtime run identity')
    run_dir = BUNDLE / 'artifacts/runtime-runs' / run_id
    run_dir.mkdir(parents=True, mode=0o700)
    evidence = run_dir / 'evidence'
    work, private = run_dir / 'work', run_dir / 'private'
    for directory in (evidence, work, private):
        directory.mkdir(mode=0o700)
    (evidence / 'logs').mkdir()
    (evidence / 'audits').mkdir()
    cancelled = {'signal': None}
    def cancel(number, _frame):
        cancelled['signal'] = number
    for number in (signal.SIGTERM, signal.SIGINT):
        signal.signal(number, cancel)
    result = {'schemaVersion': 1, 'runId': run_id, 'mode': mode, 'startedAt': now(), 'overallStatus': 'failed',
              'qualification': 'incomplete', 'commands': [], 'audits': {}, 'failures': [], 'browserPassed': False,
              'shutdownPassed': False, 'prerequisites': prerequisites(), 'runtimeExecuted': False,
              'runtimeStartAttempted': False,
              'limits': ['No physical headset, native GPU, WAN/TURN, event-scale or production security qualification.',
                         'Retained native Spoke export; no fresh editor/publication flow in this runtime command.',
                         'Npm audits do not cover Hex/Python/OS/native source advisories.']}
    touched = False
    helper = None
    helper_snapshot = work / 'process-owner'
    env = None
    compose = None
    pin_value = None
    docker = ['docker', '--host', 'unix:///var/run/docker.sock']
    def stage(name, argv, cwd=work, timeout=120, allow_audit_failure=False, cleanup=False):
        require(re.fullmatch(r'[a-z0-9-]+', name), 'Invalid stage identifier')
        print(json.dumps({'stage': name, 'runId': run_id}), flush=True)
        log = evidence / 'logs' / (name + '.txt')
        require(not log.exists(), 'Stage log would overwrite prior evidence')
        if not cleanup:
            timeout = bounded_timeout(overall_deadline, timeout)
        command = helper.run_command(argv, root=Path(cwd), environment=env, log_path=log, timeout=timeout,
                                     cancelled=(lambda: False) if cleanup else (lambda: cancelled['signal'] is not None))
        result['commands'].append({'id': name, **command, 'log': 'logs/' + log.name})
        write_json(evidence / 'progress.json', result)
        if not allow_audit_failure:
            require(command['outcome'] == 'passed', name + ' failed; see its retained command/ownership evidence')
        return command, log.read_text()
    def resource_ids(kind, label, cleanup=False):
        n = len(result['commands'])
        argv = docker + (['ps', '-aq'] if kind == 'container' else [kind, 'ls', '-q'])
        _, output = stage(f'{kind}-list-{n}', argv + ['--filter', 'label=' + label], cleanup=cleanup, timeout=20)
        ids = output.strip().splitlines()
        require(len(ids) <= 12 and all(re.fullmatch(r'[a-zA-Z0-9_.-]+', item) for item in ids), 'Malformed Docker resource identifiers')
        return ids
    def inspect_containers(cleanup=False):
        ids = resource_ids('container', 'com.docker.compose.project=' + run_id, cleanup)
        if not ids:
            return []
        _, output = stage(f'container-inspect-{len(result["commands"])}', docker + ['inspect', *ids], cleanup=cleanup, timeout=20)
        records = json.loads(output)
        validate_owned_containers(records, run_id)
        return records
    try:
        pin_value = pins()
        result['sources'] = runtime_sources()
        result['pins'] = pin_value
        helper = load_shared(pin_value, helper_snapshot)
        result['sharedSupervisor'] = {'files': verified_shared(pin_value, helper_snapshot), 'executedFromVerifiedCopy': True}
        require(result['prerequisites']['passed'], 'Missing prerequisites: ' + ', '.join(result['prerequisites']['missing']))
        env = environment(run_dir)
        if mode == 'preflight':
            stage('docker-info', docker + ['info', '--format', '{{json .ServerVersion}}'], timeout=20)
            stage('compose-version', docker + ['compose', 'version', '--short'], timeout=20)
            result['preflightPassed'] = True
            return result
        stage('docker-info', docker + ['info', '--format', '{{json .ServerVersion}}'], timeout=20)
        stage('compose-version', docker + ['compose', 'version', '--short'], timeout=20)
        _, node_version = stage('node-version', ['node', '--version'])
        require(re.fullmatch(r'v24\.[0-9]+\.[0-9]+', node_version.strip()), 'Runtime toolkit requires Node 24')
        stage('npm-version', ['npm', '--version'])
        _, head = stage('repository-head', ['git', 'rev-parse', 'HEAD'], REPOSITORY)
        _, tree = stage('repository-tree', ['git', 'rev-parse', 'HEAD^{tree}'], REPOSITORY)
        _, dirty = stage('repository-status', ['git', 'status', '--porcelain=v1', '--untracked-files=all'], REPOSITORY)
        result['repository'] = {'head': head.strip(), 'tree': tree.strip(), 'dirty': bool(dirty.strip())}
        require(mode == 'diagnose' or not result['repository']['dirty'], 'Acceptance evaluation requires a clean reviewed source tree')
        require(mode == 'diagnose' or not env.get('CHROME_EXECUTABLE'), 'Acceptance evaluation requires pinned Playwright Chromium; custom paths are diagnostic-only')
        fixture_root = Path(os.environ.get('F03_FIXTURE_ROOT', REPOSITORY / 'packages/qualification-fixtures/fixtures'))
        fixture_identity = verified_fixtures(fixture_root, pin_value)
        result['fixtures'] = fixture_identity
        (work / 'sources').mkdir()
        trees = {}
        for name, item in pin_value['sources'].items():
            directory = work / 'sources' / name
            stage(name + '-init', ['git', 'init', '--quiet', str(directory)])
            stage(name + '-fetch', ['git', '-C', str(directory), 'fetch', '--no-tags', '--depth=1', item['repository'], item['commit']], timeout=300)
            stage(name + '-checkout', ['git', '-C', str(directory), '-c', 'advice.detachedHead=false', 'checkout', '--detach', item['commit']], timeout=120)
            _, actual = stage(name + '-head', ['git', '-C', str(directory), 'rev-parse', 'HEAD'])
            require(actual.strip() == item['commit'], 'Wrong upstream source commit')
            verify_source(directory, item)
            _, tree = stage(name + '-tree', ['git', '-C', str(directory), 'rev-parse', 'HEAD^{tree}'])
            trees[name] = tree.strip()
            stage(name + '-archive', ['git', '-C', str(directory), 'archive', '--format=tar', '--output=' + str(work / (name + '.tar')), item['commit']])
        result['upstreamTrees'] = trees
        for name, directory in (('toolkit', BUNDLE), ('hubs', work / 'sources/hubs'), ('dialog', work / 'sources/dialog')):
            reject_project_configuration(directory)
            command, _ = stage(name + '-audit', ['node', str(ROOT / 'audit.mjs'), str(directory), str(evidence / 'audits'), name],
                               timeout=140, allow_audit_failure=True)
            receipt = read_json(evidence / 'audits' / (name + '.receipt.json'))
            owned = command.get('supervision', {})
            expected_inputs = {filename: fingerprint(contained(directory, filename))['sha256']
                               for filename in ('package.json', 'package-lock.json')}
            require(receipt.get('name') == name and receipt.get('cwd') == str(directory.resolve())
                    and receipt.get('inputs') == expected_inputs, 'Audit report belongs to different source files')
            require(receipt.get('sourceUnchanged') is True and receipt.get('errorCode') is None and receipt.get('signal') is None
                    and command.get('exitCode') == receipt.get('exitCode') and owned.get('exitCode') == receipt.get('exitCode')
                    and owned.get('requestedSignal') is None and 'error' not in owned
                    and owned.get('shutdown', {}).get('stopped') is True and owned['shutdown'].get('needed') is False
                    and command.get('supervisorShutdown') == {'terminateSent': False, 'killSent': False},
                    'Audit failed beyond a normal vulnerability result')
            result['audits'][name] = audit_verdict(read_json(evidence / 'audits' / (name + '.stdout.json')), receipt['exitCode'])
        require(audit_allows_runtime(mode, result['audits']), 'Required audit failed; acceptance stops before building/running services')
        reject_project_configuration(BUNDLE)
        stage('toolkit-install', ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], BUNDLE, timeout=180)
        bootstrap = work / 'bootstrap'
        bootstrap.mkdir()
        for name in (*pin_value['bootstrap'], *pin_value['wheels']):
            # Network I/O is a supervised child stage: its whole transfer,
            # cancellation and descendants share the original overall budget.
            stage('download-' + name, [sys.executable, '-B', '-O', str(ROOT / 'download.py'),
                                      name, str(bootstrap)], timeout=60)
        contexts = prepare_contexts(run_dir, run_id, pin_value, fixture_root, fixture_identity, trees)
        result['contexts'] = contexts
        write_json(evidence / 'adaptations.json', contexts)
        stage('local-tls', ['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '1',
                           '-keyout', str(private / 'key.pem'), '-out', str(private / 'cert.pem'), '-subj', '/CN=hubs.local',
                           '-addext', 'subjectAltName=DNS:hubs.local,DNS:hubs-client,DNS:hubs-assets.local,DNS:hubs-proxy.local,IP:127.0.0.1'])
        stage('local-perms-key', ['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', str(private / 'perms-private.pem')])
        stage('local-perms-public', ['openssl', 'pkey', '-in', str(private / 'perms-private.pem'), '-pubout', '-out', str(private / 'perms-public.pem')])
        for name in ('secret-base', 'guardian-secret'):
            (private / name).write_text(secrets.token_hex(64))
        for path in private.iterdir():
            path.chmod(0o600)
        compose_value = make_compose(run_dir, run_id, pin_value)
        write_json(work / 'compose.json', compose_value)
        write_json(evidence / 'compose.json', compose_value)
        compose = docker + ['compose', '--project-name', run_id, '--file', str(work / 'compose.json')]
        require(not inspect_containers(), 'Fresh project already has containers')
        for kind in ('network', 'volume'):
            require(not resource_ids(kind, 'com.docker.compose.project=' + run_id), 'Fresh project already has Docker resources')
        require(not resource_ids('image', LABEL + '=' + run_id), 'Fresh project already has derived images')
        touched = True
        for name, image in pin_value['images']['images'].items():
            stage(name + '-image-pull', docker + ['pull', '--platform=linux/amd64', image['image']], timeout=300)
        stage('compose-build', compose + ['build'], timeout=1500)
        # A failed up/health command can still have started some containers.
        # Until it confirms success, preserve that uncertainty rather than false.
        result['runtimeStartAttempted'] = True
        result['runtimeExecuted'] = None
        stage('start-base', compose + ['up', '--wait', '--wait-timeout', '90', 'db', 'dialog', 'hubs-client'], timeout=120)
        result['runtimeExecuted'] = True
        # Pinned Ret.Application creates ret0 and performs its own locked startup
        # migrations. A separate mix ecto.migrate would bypass that native prefix setup.
        stage('start-reticulum', compose + ['up', '--detach', 'reticulum'], timeout=90)
        # The probe's complete I/O lifetime is supervised too: even a native
        # server trickling bytes cannot replace or outlive the overall budget.
        _, raw_ready = stage('service-readiness', [sys.executable, '-B', '-O', str(ROOT / 'readiness.py'),
                            run_id, str(private / 'cert.pem'), contexts['hubs-client']['derivedModel']['sha256']], timeout=300)
        ready = json.loads(raw_ready)
        require(ready == {'runId': run_id, 'modelSha256': contexts['hubs-client']['derivedModel']['sha256'],
                          'reticulumStatus': 200}, 'Service readiness evidence uses different inputs')
        records = inspect_containers()
        validate_owned_containers(records, run_id, require_services=True)
        write_json(evidence / 'containers-running.json', records)
        for service in ('hubs-client', 'dialog', 'reticulum'):
            _, value = stage('identity-' + service, compose + ['exec', '-T', service, 'cat', '/opt/bve-build-identity.json'])
            require(json.loads(value) == contexts[service], 'Running image does not match its source context')
        _, value = stage('dialog-meta', compose + ['exec', '-T', 'dialog', 'node', '-e',
                        "require('http').get('http://127.0.0.1:7000/meta',r=>{r.pipe(process.stdout);r.on('end',()=>{if(r.statusCode!==200)process.exitCode=1})}).on('error',()=>process.exit(1))"])
        meta = json.loads(value)
        require(type(meta.get('cap')) in (int, float) and meta['cap'] >= 0, 'Dialog worker health was not real')
        result['readiness'] = {'at': now(), 'dialogMeta': meta, 'reticulumStatus': 200, 'derivedModel': contexts['hubs-client']['derivedModel']}
        browser_dir = evidence / 'browser'
        browser_dir.mkdir()
        browser_input = {'runId': run_id, 'modelUrl': contexts['hubs-client']['modelUrl'],
                         'modelFingerprint': contexts['hubs-client']['derivedModel'], 'sources': result['sources'],
                         'fixtures': fixture_identity, 'upstreamTrees': trees, 'browserOverride': bool(env.get('CHROME_EXECUTABLE'))}
        write_json(browser_dir / 'input.json', browser_input)
        stage('two-client-browser', ['node', str(ROOT / 'browser-checks.mjs'), str(browser_dir)], BUNDLE, timeout=240)
        browser_report = read_json(browser_dir / 'browser-checks.json')
        validate_browser(browser_report, browser_input)
        for name, expected in browser_report['screenshots'].items():
            path = contained(browser_dir, name)
            require(fingerprint(path) == expected, 'Browser screenshot hash mismatch')
            helper.validate_png(path.read_bytes())
        result['browserPassed'] = True
        require(runtime_sources() == result['sources'], 'Runtime source changed during evaluation')
        require(verified_fixtures(fixture_root, pin_value) == fixture_identity, 'F03 inputs changed during evaluation')
    except BaseException as error:
        result['failures'].append(type(error).__name__ + ': ' + str(error))
    finally:
        if touched and compose is not None and helper is not None:
            try:
                cleanup_deadline = time.monotonic() + 360
                def cleanup_call(name, argv, timeout):
                    return stage(name, argv, cleanup=True,
                                 timeout=bounded_timeout(cleanup_deadline, timeout))[1]
                stopped = cleanup_owned(run_dir, run_id, pin_value, cleanup_call)
                write_json(evidence / 'containers-before-shutdown.json', stopped['containersBeforeShutdown'])
                result['failures'].extend(stopped['errors'])
                result['shutdownPassed'] = stopped['stopped']
            except BaseException as error:
                result['failures'].append('Shutdown: ' + type(error).__name__ + ': ' + str(error))
        elif not touched:
            result['shutdownPassed'] = True
        if result['shutdownPassed']:
            # Only task-generated ephemeral material in this unique directory.
            # It is never included in the evidence directory or upload manifest.
            try:
                shutil.rmtree(private)
            except OSError as error:
                result['failures'].append('Ephemeral key cleanup: ' + str(error))
        result['cancelledSignal'] = cancelled['signal']
        if cancelled['signal'] is not None:
            result['failures'].append('Run was interrupted by signal ' + str(cancelled['signal']))
        if result.get('sources') is not None and runtime_sources() != result['sources']:
            result['failures'].append('Runtime source changed before final evidence was written')
        if helper is not None:
            try:
                require(verified_shared(pin_value) == result['sharedSupervisor']['files']
                        and verified_shared(pin_value, helper_snapshot) == result['sharedSupervisor']['files'],
                        'Reviewed shared helper identity changed before final evidence')
            except (OSError, RuntimeError) as error:
                result['failures'].append('Shared process helper: ' + str(error))
        result['auditFailures'] = [name for name, verdict in result['audits'].items() if verdict.get('passed') is not True]
        result['artifacts'], collection_failures = collect_artifacts(evidence)
        result['failures'].extend('Collection: ' + failure for failure in collection_failures)
        result['overallStatus'] = overall_status(mode, result['audits'], result['browserPassed'], result['shutdownPassed'], result['failures'])
        if mode == 'preflight':
            result['preflightPassed'] = result.get('preflightPassed') is True and result['failures'] == []
        result['finishedAt'] = now()
        write_json(evidence / 'manifest.json', result)
        collection = run_dir / 'collection'
        collection.mkdir()
        # Only this directory is review/upload material. Worktrees, image data,
        # raw rejected output and ephemeral keys stay outside it.
        for name in (*result['artifacts'], 'manifest.json'):
            destination = collection / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(contained(evidence, name), destination)
        print(json.dumps({'runId': run_id, 'mode': mode, 'overallStatus': result['overallStatus'], 'qualification': 'incomplete',
                          'evidence': str(collection), 'auditFailures': result['auditFailures'], 'failures': result['failures']}), flush=True)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('preflight', 'evaluate', 'diagnose'))
    parser.add_argument('--run-id', help='Caller-owned unique identity; an existing directory is always rejected')
    arguments = parser.parse_args()
    receipt = main(arguments.mode, arguments.run_id)
    raise SystemExit(0 if receipt.get('preflightPassed') is True or receipt['overallStatus'] == 'passed' else 1)
