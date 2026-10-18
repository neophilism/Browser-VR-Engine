"""Required hosted VRSpace service subset. --local never creates CI acceptance."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
from urllib.parse import urlsplit

from service_evidence import (ROOT, SERVICE, STAGES, REGRESSIONS, REPOSITORY, automation, require,
                              snapshot, inventory, validate_inputs, validate_regression, validate_stage,
                              validate_automation, validate_identity, verify_report)


def command_contract():
    return {
        'automation-methods': ['python3', '-B', '-O', 'test/report-automation-checks.py'],
        'launcher-regressions': ['python3', '-B', '-O', 'test/launcher-checks.py'],
        'finalization-regressions': ['node', 'test/finalization-checks.mjs'],
        'node-version': ['node', '--version'], 'java-version': ['java', '-version'], 'npm-version': ['npm', '--version'],
        'f05-install': ['node', 'run.mjs', 'install'], 'f05-build': ['node', 'run.mjs', 'build'],
        'browser-install': ['node', 'node_modules/playwright/cli.js', 'install', '--with-deps', 'chromium'],
        'full-automation': ['python3', '-B', '-O', 'automate.py'],
    }


def git(root, *args):
    result = subprocess.run(['git', '-c', 'credential.helper=', *args], cwd=root,
                            env={'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null'},
                            check=True, capture_output=True, text=True, timeout=10)
    return result.stdout.strip()


def checkout(root):
    return {'tested': git(root, 'rev-parse', 'HEAD'), 'tree': git(root, 'rev-parse', 'HEAD^{tree}'),
            'dirty': bool(git(root, 'status', '--porcelain', '--untracked-files=all'))}


def event_identity(root, local):
    state = checkout(root)
    if local:
        return {**state, 'repository': REPOSITORY, 'event': 'local', 'head': state['tested'], 'base': None,
                'workflowRef': None, 'workflowSha': None, 'runId': None, 'attempt': None}
    require(os.environ.get('GITHUB_ACTIONS') == 'true', 'Hosted service runner requires GitHub Actions; use --local for a preview')
    require(os.environ.get('GITHUB_SHA') == state['tested'], 'Checkout differs from the event commit')
    event = os.environ.get('GITHUB_EVENT_NAME')
    path = Path(os.environ.get('GITHUB_EVENT_PATH', ''))
    require(path.is_file() and path.stat().st_size <= 4 * 1024 * 1024, 'Missing bounded hosted event payload')
    payload = json.loads(path.read_text())
    head, base = state['tested'], None
    if event == 'pull_request':
        head, base = payload['pull_request']['head']['sha'], payload['pull_request']['base']['sha']
        require(os.environ.get('CI_PR_HEAD_SHA') == head and os.environ.get('CI_PR_BASE_SHA') == base,
                'PR head/base environment differs from event payload')
        require(payload['pull_request']['base']['ref'] == 'main', 'Unexpected PR target')
    elif event == 'merge_group':
        head, base = payload['merge_group']['head_sha'], payload['merge_group']['base_sha']
        require(head == state['tested'] and payload['merge_group']['base_ref'] == 'refs/heads/main', 'Unexpected merge group')
    else:
        require(event == 'push' and os.environ.get('GITHUB_REF') == 'refs/heads/main', 'Unsupported hosted event')
    value = {**state, 'repository': os.environ.get('GITHUB_REPOSITORY'), 'event': event, 'head': head, 'base': base,
             'workflowRef': os.environ.get('CI_WORKFLOW_REF'), 'workflowSha': os.environ.get('CI_WORKFLOW_SHA'),
             'runId': os.environ.get('GITHUB_RUN_ID'), 'attempt': os.environ.get('GITHUB_RUN_ATTEMPT')}
    validate_identity(value, value)
    return value


def fresh_directory(root, prefix, before):
    after = {path.name for path in root.iterdir() if path.name.startswith(prefix) and path.is_dir()}
    added = after - before
    require(len(added) == 1, 'Command did not create exactly one fresh ' + prefix + ' report')
    directory = root / added.pop()
    require(not directory.is_symlink(), 'Fresh report directory is a symlink')
    return directory


def main(local=False):
    require(sys.version_info >= (3, 11) and sys.platform == 'linux', 'Service CI requires Linux and Python 3.11+')
    artifacts = automation.ensure_directory(ROOT, 'artifacts')
    lock = os.fdopen(os.open(artifacts / 'service-ci.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600), 'a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    output = artifacts / 'service'
    require(not output.is_symlink(), 'Service CI output must not be a symlink')
    if output.exists():
        shutil.rmtree(output)
    output.mkdir()
    for name in ('logs', 'reports'):
        (output / name).mkdir()
    record = {'schemaVersion': 1, 'kind': 'engine-service-evaluation', 'mode': 'local' if local else 'hosted',
              'complete': False, 'qualificationStatus': 'incomplete', 'runStatus': 'failed',
              'scope': 'Released VRSpace pair: process regressions, presence/pose/reconnect and cleanup only; no full engine, auth, authority, SFU/media, physical-XR or capacity acceptance.',
              'startedAt': automation.now(), 'commands': [], 'failures': [], 'files': []}
    stopped = {'signal': None}
    def request_stop(number, _frame):
        if stopped['signal'] is None:
            stopped['signal'] = number
    previous = {number: signal.signal(number, request_stop) for number in (signal.SIGINT, signal.SIGTERM)}
    control = automation.load_helper(SERVICE, 'process_control')
    def write():
        control.write_json(output / 'manifest.json', record)
    write()
    before = None
    try:
        identity = event_identity(ROOT, local)
        record['identity'] = identity
        before = snapshot(ROOT)
        record['inputs'] = before
        for package in (SERVICE, ROOT / 'evaluations/babylon-vrspace'):
            for name in ('artifacts', 'artifacts/tmp', 'artifacts/tool-config', 'artifacts/npm-cache', 'artifacts/browsers'):
                automation.ensure_directory(package, name)
            require(not (package / 'node_modules').is_symlink(), 'Evaluation dependencies must not be a symlink')
            for name in ('.npmrc', '.yarnrc', '.yarnrc.yml'):
                require(not (package / name).exists(), 'Unexpected evaluation package configuration: ' + name)
        environment = automation.load_helper(SERVICE, 'environment').clean_environment()
        f05 = ROOT / 'evaluations/babylon-vrspace'
        fixtures = ROOT / 'packages/qualification-fixtures/fixtures'
        browsers = automation.ensure_directory(SERVICE, 'artifacts/browsers')
        # CI controls these paths. No provider, GitHub, npm-token or arbitrary
        # runtime flags are forwarded to downloaded or browser code.
        environment.update(F03_FIXTURE_ROOT=str(fixtures), F05_EVALUATION_ROOT=str(f05), PLAYWRIGHT_BROWSERS_PATH=str(browsers))
        environment.pop('CHROME_EXECUTABLE', None)
        for name in ('HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy'):
            if name in environment:
                require(urlsplit(environment[name]).username is None, 'Credential-bearing proxy configuration is not permitted in retained CI logs')
        record['checkoutRoot'] = str(ROOT)
        record['toolchain'] = {'python': sys.version.split()[0], 'platform': sys.platform,
                               'kernel': os.uname().release,
                               'runnerImage': os.environ.get('ImageOS'), 'runnerImageVersion': os.environ.get('ImageVersion')}
        commands = command_contract()
        source_names = automation.read_json(SERVICE, 'source-files.json')
        sources = {name: before['service'][name]['sha256'] for name in source_names}
        for name in STAGES:
            require(stopped['signal'] is None, 'Service CI was interrupted')
            cwd = f05 if name.startswith('f05-') or name == 'browser-install' else SERVICE
            timeout = 900 if name == 'full-automation' else (240 if name in ('launcher-regressions', 'f05-install', 'browser-install') else 90)
            reports_before = set()
            if name in REGRESSIONS:
                prefix = REGRESSIONS[name][0] + '-'
                reports_before = {path.name for path in (SERVICE / 'artifacts').iterdir() if path.name.startswith(prefix)}
            if name == 'f05-build':
                require(not (f05 / 'dist').is_symlink(), 'Renderer dist must not be a symlink')
                if (f05 / 'dist').exists():
                    shutil.rmtree(f05 / 'dist')
            if name == 'full-automation':
                record['evaluatedInputs'] = automation.checked_inputs(SERVICE, f05, fixtures)
                validate_inputs(record['evaluatedInputs'], before)
                (output / 'build.json').write_bytes(automation.read_bytes(f05, 'dist/build.json'))
                reports_before = automation.run_directories(SERVICE, 'artifacts/automation-runs')
            log = output / 'logs' / (name + '.txt')
            result = automation.run_command(commands[name], root=cwd, environment=environment, log_path=log,
                                            timeout=timeout, cancelled=lambda: stopped['signal'] is not None,
                                            terminate_timeout=30 if name == 'full-automation' else 5, kill_timeout=5)
            result['id'] = name
            record['commands'].append(result)
            write()
            # Retain failure receipts before refusing to advance to expensive or
            # dependent stages. Never reuse a previous run's latest pointer.
            if name in REGRESSIONS:
                try:
                    report_root = fresh_directory(SERVICE / 'artifacts', prefix, reports_before)
                except RuntimeError:
                    require(result['outcome'] == 'passed', 'Stage failed before a fresh regression receipt: ' + name + '; ' + result.get('error', 'nonzero command'))
                    raise
                filename = REGRESSIONS[name][0] + '.json'
                data = automation.read_bytes(report_root, filename)
                (output / 'reports' / filename).write_bytes(data)
                validate_regression(json.loads(data), name, result, sources)
            if name == 'full-automation':
                report_root = fresh_directory(SERVICE / 'artifacts/automation-runs', 'run-', reports_before)
                inner = automation.read_json(report_root, 'manifest.json')
                target = output / 'automation'
                target.mkdir()
                (target / 'manifest.json').write_bytes(automation.read_bytes(report_root, 'manifest.json'))
                # Copy only the bounded, allowlisted evidence inventory. JARs,
                # databases, caches, browsers and source trees never enter uploads.
                from service_evidence import verify_inventory
                verify_inventory(report_root, inner.get('files'), inner=True)
                for item in inner['files']:
                    destination = target / item['path']
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(automation.read_bytes(report_root, item['path']))
                record['automationOutput'] = str(report_root)
                validate_automation(inner, record['evaluatedInputs'], target, result,
                                    automation.read_bytes(output, 'logs/full-automation.txt').decode(), str(report_root))
            validate_stage(result, name, commands[name])
            if name in ('node-version', 'java-version', 'npm-version'):
                value = automation.read_bytes(output, 'logs/' + name + '.txt').decode().strip()
                record['toolchain'][name.removesuffix('-version')] = value
                if name == 'node-version':
                    require(value == 'v' + (ROOT / '.nvmrc').read_text().strip(), 'Node differs from the repository pin')
                elif name == 'java-version':
                    require(re.search(r'version "17\.', value), 'Java 17 is required')
        require(stopped['signal'] is None, 'Service CI was interrupted')
        require(snapshot(ROOT) == before and checkout(ROOT) == {key: identity[key] for key in ('tested', 'tree', 'dirty')},
                'Checkout or inputs changed during service CI')
        require(automation.checked_inputs(SERVICE, f05, fixtures) == record['evaluatedInputs'],
                'Evaluated inputs changed after service shutdown')
        record['finishedAt'] = automation.now()
        record['files'] = inventory(output)
        record['runStatus'] = 'passed'
        if not local:
            record['complete'] = True
            verify_report(record, output, identity, before, commands)
    except BaseException as error:
        record['runStatus'] = 'failed'
        record['complete'] = False
        record['failures'].append(type(error).__name__ + ': ' + str(error))
    finally:
        record['finishedAt'] = automation.now()
        try:
            record['files'] = inventory(output)
            write()
        finally:
            for number, handler in previous.items():
                signal.signal(number, handler)
            lock.close()
    print(json.dumps({'runStatus': record['runStatus'], 'complete': record['complete'],
                      'qualificationStatus': record['qualificationStatus'], 'output': str(output), 'failures': record['failures']}, indent=2))
    return 0 if record['runStatus'] == 'passed' else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--local', action='store_true')
    args = parser.parse_args()
    raise SystemExit(main(args.local))
