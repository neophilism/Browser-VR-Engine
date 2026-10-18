"""Fail-closed evidence contract for the hosted released-service subset."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import signal

ROOT = Path(__file__).resolve().parents[2]
SERVICE = ROOT / 'evaluations/vrspace-service'
spec = importlib.util.spec_from_file_location('service_automation', SERVICE / 'automate.py')
automation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(automation)
require = automation.require
REPOSITORY = 'neophilism/Browser-VR-Engine'
SHA = r'[a-f0-9]{40}'
BUILD_INPUTS = {'src/main.js', 'src/xr-session.js', 'src/spatial-audio.js', 'src/audio-meter.js', 'src/import-policy.js',
                'src/import-resources.js', 'index.html', 'package.json', 'package-lock.json',
                'fixture-pins.json', 'vendor/vrspace/asset-loader.js', 'build.mjs'}
BUILD_OUTPUTS = {'dist/main.js', 'dist/main.js.map', 'dist/audio-meter.js'}
AUTOMATION_METHODS = sorted([
    'test_synthetic_browser_binding_accepts_without_execution_claim',
    'test_browser_failures_remain_failures_after_consistent_counts',
    'test_stdout_must_identify_exactly_one_fresh_browser_run',
    'test_audit_requires_consistent_registry_entries_and_success',
    'test_screenshot_checks_dimensions_checksums_complete_rows',
    'test_source_snapshot_includes_new_worklet_and_rejects_file_escape',
    'test_real_command_exit_spawn_timeout_and_cancel_fail_closed',
    'test_exited_leader_and_detached_term_ignoring_descendants_are_reaped',
    'test_missing_and_symlinked_output_directories_are_rejected',
])
LAUNCHER_CASES = [
    'optimized-process-controls-reject-mismatched-procfs-namespace', 'optimized-launch-rejects-wrong-jar-length',
    'optimized-launch-rejects-wrong-jar-digest', 'optimized-launch-rejects-profile-change',
    'optimized-setup-rejects-wrong-jar', 'optimized-setup-rejects-wrong-client',
    'optimized-stop-and-observe-reject-unrelated-process', 'optimized-stop-and-observe-reject-malformed-proc-path-record',
    'optimized-stop-and-observe-reject-stale-creation-identity', 'optimized-pidfd-stop-kills-only-verified-hung-child',
    'optimized-observer-rejects-nonloopback-and-missing-listeners', 'optimized-parent-sigterm-bounded-kill-and-reap',
    'optimized-post-popen-metadata-failure-cleans-owned-child', 'frontend-failure-paths-close-all-owned-loopback-listeners',
]
FINALIZATION_CASES = [
    'clean-run-passes-after-all-cleanup-settles',
    *['late-' + kind + '-fails-report-and-process' for kind in ('error', 'pageerror', 'socketerror')],
    *['late-' + kind + '-request-fails-report-and-process' for kind in ('failed', 'blocked-external')],
    *[kind + '-cleanup-rejection-still-closes-other-resources' for kind in ('dispose', 'browser', 'frontend')],
    'retained-cleanup-error-without-fatal-fails', 'fatal-observation-fails', 'incomplete-checks-fail',
    'failed-check-fails', 'late-probe-error-fails', 'error-during-metadata-read-fails',
]
REGRESSIONS = {'automation-methods': ('automation-checks', AUTOMATION_METHODS),
               'launcher-regressions': ('launcher-checks', LAUNCHER_CASES),
               'finalization-regressions': ('finalization-checks', FINALIZATION_CASES)}
STAGES = ['automation-methods', 'launcher-regressions', 'finalization-regressions',
          'node-version', 'java-version', 'npm-version', 'f05-install', 'f05-build', 'browser-install', 'full-automation']
INNER_STAGES = ['node-version', 'toolkit-install', 'toolkit-audit', 'release-download-verify', 'service-browser', 'owned-network-snapshot']
CI_SOURCES = ['scripts/ci/service.py', 'scripts/ci/service_evidence.py', 'scripts/ci/verify-service-evidence.py',
              'scripts/test/service-evidence.test.mjs', 'scripts/test/service-evidence-checks.py',
              'scripts/check-ci-policy.mjs', 'scripts/ci/evidence.mjs', 'scripts/test/evidence.test.mjs',
              'scripts/test/policy.test.mjs', '.github/workflows/engine-ci.yml', 'docs/ci/action-pins.json',
              'docs/ci/scopes.json', '.nvmrc', 'package.json', 'package-lock.json',
              'docs/plan/pr-plan.json', 'packages/qualification-fixtures/fixtures/comparison.json']


def within(stage, report, tolerance=0):
    start, end = automation.timestamp(stage['startedAt']), automation.timestamp(stage['finishedAt'])
    first, last = automation.timestamp(report['startedAt']), automation.timestamp(report['finishedAt'])
    require(start <= end and start - tolerance <= first <= last <= end + tolerance,
            'Stale or inverted report timestamps')


def validate_stage(stage, expected_id, expected_argv=None):
    require(isinstance(stage, dict) and stage.get('id') == expected_id and stage.get('outcome') == 'passed'
            and type(stage.get('exitCode')) is int and stage['exitCode'] == 0 and not stage.get('error')
            and not stage.get('logTruncated'), 'Command did not succeed: ' + expected_id)
    argv = stage.get('argv')
    require(isinstance(argv, list) and argv and all(isinstance(arg, str) for arg in argv), 'Missing command arguments')
    if expected_argv is not None:
        require(argv == expected_argv, 'Required command was substituted: ' + expected_id)
    require(stage.get('supervisorExitCode') == 0 and stage.get('supervisorShutdown') == {'terminateSent': False, 'killSent': False},
            'Stage supervisor failed or needed interruption: ' + expected_id)
    process = stage.get('supervision')
    require(isinstance(process, dict) and process.get('schemaVersion') == 1 and process.get('argv') == argv
            and process.get('outcome') == 'passed' and process.get('exitCode') == 0
            and process.get('requestedSignal') is None and 'error' not in process,
            'Missing successful process ownership evidence: ' + expected_id)
    require(all(type(process.get(key)) is int and process[key] > 1 for key in ('supervisorPid', 'commandPid')),
            'Command ownership was never established')
    shutdown = process.get('shutdown', {})
    require(shutdown.get('stopped') is True and shutdown.get('needed') is False
            and shutdown.get('killSent') == [] and shutdown.get('terminateSent') == [],
            'A command left descendants or needed cleanup: ' + expected_id)
    within(stage, process)


def validate_regression(report, name, stage, sources):
    _, ids = REGRESSIONS[name]
    cases = report.get('cases')
    require(isinstance(cases, list) and [item.get('id') for item in cases if isinstance(item, dict)] == ids
            and all(item.get('status') == 'passed' for item in cases), 'Incomplete regression cases: ' + name)
    counts = {'passed': len(ids), 'failed': 0, 'checks': len(ids)}
    if name == 'automation-methods':
        counts['skipped'] = 0
        require(report.get('runStatus') == 'passed' and report.get('sourcesUnchanged') is True
                and report.get('errors') == [], 'Automation test report failed or omitted errors')
    require(report.get('counts') == counts and report.get('sourceDigests') == sources,
            'Regression counts or source binding differ: ' + name)
    if name != 'finalization-regressions':
        require(report.get('pythonOptimized') is True, 'Optimized Python regression evidence is missing')
    # The original launcher receipt rounds timestamps down to whole seconds.
    within(stage, report, 1 if name == 'launcher-regressions' else 0)


def snapshot(root):
    return {'ci': {name: automation.fingerprint(root, name) for name in CI_SOURCES},
            'service': automation.source_snapshot(root / 'evaluations/vrspace-service'),
            'sibling': automation.source_snapshot(root / 'evaluations/babylon-vrspace')}


def validate_inputs(inputs, before):
    require(inputs.get('service') == before['service'] and inputs.get('siblingSource') == before['sibling'],
            'Automation used changed service or renderer source')
    require(inputs.get('serviceBrowserSources') == automation.read_json(SERVICE, 'source-files.json')
            and inputs.get('sourcePins') == automation.read_json(SERVICE, 'source-pins.json'),
            'Service browser inventory or released-pair pins differ')
    build = inputs.get('build', {})
    require(set(build.get('inputs', {})) == BUILD_INPUTS and set(build.get('outputs', {})) == BUILD_OUTPUTS,
            'Renderer build input/output coverage differs')
    for name, value in build['inputs'].items():
        require(before['sibling'].get(name) == value, 'Renderer build input does not match checkout: ' + name)


def inventory(root):
    values = []
    for path in sorted(root.rglob('*')):
        require(not path.is_symlink(), 'Artifact symlinks are forbidden')
        if path.is_file() and path != root / 'manifest.json':
            relative = path.relative_to(root).as_posix()
            require(path.stat().st_size <= 16 * 1024 * 1024, 'Oversized retained artifact')
            values.append({'path': relative, **automation.fingerprint(root, relative)})
    return values


def verify_inventory(root, entries, *, inner=False):
    require(isinstance(entries, list) and entries, 'Empty artifact inventory')
    names = [item.get('path') for item in entries if isinstance(item, dict)]
    require(len(names) == len(entries) == len(set(names)), 'Duplicate or malformed artifact entries')
    pattern = (r'(logs/[a-z0-9_-]+\.(?:txt|process\.json)|reports/dependency-audit\.json|'
               r'browser/(?:browser-checks\.json|alpha-courtyard\.png|beta-courtyard\.png|failure-[01]\.png)|'
               r'server/(?:process-snapshot\.json|run\.json|server\.log))') if inner else (
               r'(logs/[a-z0-9_-]+\.(?:txt|process\.json)|reports/(?:automation-checks|launcher-checks|finalization-checks)\.json|'
               r'build\.json|automation/manifest\.json|automation/(?:logs/[a-z0-9_-]+\.(?:txt|process\.json)|'
               r'reports/dependency-audit\.json|browser/(?:browser-checks\.json|alpha-courtyard\.png|beta-courtyard\.png|failure-[01]\.png)|'
               r'server/(?:process-snapshot\.json|run\.json|server\.log)))')
    for name in names:
        require(isinstance(name, str) and re.fullmatch(pattern, name), 'Unexpected retained artifact: ' + str(name))
    require(entries == inventory(root), 'Retained artifact inventory, length or digest differs')


def validate_automation(record, inputs, root, stage, log, expected_output):
    require(record.get('schemaVersion') == 1 and record.get('kind') == 'vrspace-release-local-automation'
            and record.get('mode') == 'local' and record.get('ciAcceptance') is False
            and record.get('qualificationStatus') == 'incomplete' and record.get('runStatus') == 'passed'
            and record.get('failures') == [], 'Full automation did not pass its limited local contract')
    require(record.get('inputs') == inputs and record.get('counts') == {'passed': 9, 'failed': 0, 'checks': 9},
            'Automation input binding or browser count differs')
    within(stage, record)
    summaries = [json.JSONDecoder().raw_decode(log[match.start():])[0]
                 for match in re.finditer(r'^\{\s*"runStatus"\s*:', log, re.MULTILINE)]
    require(summaries == [{'runStatus': 'passed', 'qualificationStatus': 'incomplete', 'ciAcceptance': False,
                          'counts': record['counts'], 'output': expected_output, 'failures': []}],
            'Full automation stdout does not identify this fresh run')
    commands = record.get('commands', [])
    require([item.get('id') for item in commands] == INNER_STAGES, 'Required automation commands are missing or reordered')
    server, launcher = record.get('server', {}), record.get('launcher', {})
    python = launcher.get('argv', [None])[0]
    package = launcher.get('cwd')
    require(isinstance(python, str) and Path(python).is_absolute() and launcher.get('argv') == [python, 'server-run.py']
            and isinstance(package, str) and Path(package).is_absolute(), 'Owned launcher command is missing')
    options = ['--registry=https://registry.npmjs.org', '--fetch-timeout=15000', '--fetch-retries=0',
               '--userconfig=' + package + '/artifacts/tool-config/user-npmrc',
               '--globalconfig=' + package + '/artifacts/tool-config/global-npmrc']
    expected_commands = {'node-version': ['node', '--version'],
                         'toolkit-install': ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund', *options],
                         'toolkit-audit': ['npm', 'audit', '--json', '--audit-level=high', *options],
                         'release-download-verify': [python, 'setup.py'], 'service-browser': ['node', 'browser-checks.mjs'],
                         'owned-network-snapshot': [python, 'observe-server.py']}
    for command in commands:
        validate_stage(command, command['id'], expected_commands[command['id']])
        require(command.get('cwd') == package, 'Inner stage ran outside its service package')
        within(record, command)
        require(automation.read_json(root, 'logs/' + command['processEvidence']) == command['supervision'],
                'Retained inner process report differs')
        automation.fingerprint(root, 'logs/' + command['id'] + '.txt')
    for name in ('logs/server-launcher.txt', 'server/server.log'):
        automation.fingerprint(root, name)
    audit = next(command for command in commands if command['id'] == 'toolkit-audit')
    require(audit['argv'][0:5] == ['npm', 'audit', '--json', '--audit-level=high', '--registry=https://registry.npmjs.org'],
            'Service graph registry audit was substituted')
    automation.validate_audit(automation.read_json(root, 'reports/dependency-audit.json'), audit['exitCode'])
    require(automation.read_bytes(root, 'reports/dependency-audit.json') == automation.read_bytes(root, 'logs/toolkit-audit.txt'),
            'Audit report differs from command output')
    verified = automation.read_json(root, 'logs/release-download-verify.txt')
    pins = inputs['sourcePins']
    require(verified == {'release': pins['release'], 'jarBytes': pins['jar']['bytes'],
                         'jarSha256': pins['jar']['digest'].removeprefix('sha256:'),
                         'clientBytes': pins['client']['bytes'], 'verified': True}, 'Released binary/client verification differs')
    require(record.get('health', {}).get('status') == 200 and record['health'].get('body') == {'status': 'UP'},
            'Service health was not observed')
    shutdown = record.get('shutdown', {})
    require(shutdown.get('stopped') is True and shutdown.get('killSent') is False
            and not any(key in shutdown for key in ('error', 'javaFallbackTerminate', 'javaFallbackKill'))
            and launcher.get('outcome') == 'stopped' and launcher.get('exitCode') == 143,
            'Service did not stop cleanly through its owned launcher')
    final = automation.read_json(root, 'server/run.json')
    require(all(final.get(key) == server.get(key) for key in ('pid', 'processStartTicks', 'runDirectory'))
            and final.get('release') == pins
            and type(server.get('pid')) is int and server['pid'] > 1 and type(server.get('processStartTicks')) is int
            and not final.get('failure') and final.get('shutdown', {}).get('killSent') is False
            and final.get('exitCode') in (0, 143, -signal.SIGTERM), 'Final Java ownership/shutdown receipt differs')
    snapshot = automation.read_json(root, 'server/process-snapshot.json')
    require(snapshot.get('process', {}).get('Pid') == str(server['pid']) and snapshot.get('processStartTicks') == server['processStartTicks']
            and snapshot.get('allOwnedListenersLoopback') is True and snapshot.get('allObservedEstablishedConnectionsLoopback') is True,
            'Service network/ownership observation differs')
    automation.load_helper(SERVICE, 'process_control').ensure_loopback_sockets(snapshot['sockets'])
    browser_stage = next(command for command in commands if command['id'] == 'service-browser')
    automation.validate_browser(automation.read_json(root, 'browser/browser-checks.json'), inputs, server, browser_stage,
                                record['browserRun'], automation.read_bytes(root, 'logs/service-browser.txt').decode())
    for name in ('alpha-courtyard.png', 'beta-courtyard.png'):
        automation.validate_png(automation.read_bytes(root, 'browser/' + name))
    verify_inventory(root, record.get('files'), inner=True)


def validate_identity(identity, expected):
    require(isinstance(identity, dict) and identity == expected, 'Hosted event/run identity differs from the requested evidence')
    require(identity.get('repository') == REPOSITORY and identity.get('event') in ('pull_request', 'push', 'merge_group')
            and identity.get('dirty') is False, 'Untrusted event or dirty checkout')
    for name in ('head', 'tested', 'tree', 'workflowSha'):
        require(isinstance(identity.get(name), str) and re.fullmatch(SHA, identity[name]), 'Invalid commit identity: ' + name)
    if identity['event'] == 'push':
        require(identity.get('base') is None and identity['head'] == identity['tested'], 'Push identity mismatch')
    else:
        require(isinstance(identity.get('base'), str) and re.fullmatch(SHA, identity['base']), 'Missing PR/merge-group base')
    require(isinstance(identity.get('workflowRef'), str)
            and identity['workflowRef'].startswith(REPOSITORY + '/.github/workflows/engine-ci.yml@'), 'Workflow identity missing')
    require(all(isinstance(identity.get(key), str) and re.fullmatch(r'[1-9][0-9]*', identity[key])
                for key in ('runId', 'attempt')), 'Missing run/attempt identity')


def verify_report(record, root, expected, before, commands):
    require(record.get('schemaVersion') == 1 and record.get('kind') == 'engine-service-evaluation'
            and record.get('mode') == 'hosted' and record.get('complete') is True
            and record.get('runStatus') == 'passed' and record.get('qualificationStatus') == 'incomplete' and record.get('failures') == [],
            'Service CI did not complete its hosted subset')
    validate_identity(record.get('identity'), expected)
    require(record.get('inputs') == before, 'CI inputs differ from this checkout')
    required = record.get('commands', [])
    require([item.get('id') for item in required] == STAGES, 'Hosted service stages are incomplete or reordered')
    for item in required:
        validate_stage(item, item['id'], commands[item['id']])
        within(record, item)
        require(automation.read_json(root, 'logs/' + item['processEvidence']) == item['supervision'],
                'Retained process evidence differs from its command')
        automation.fingerprint(root, 'logs/' + item['id'] + '.txt')
        package = 'babylon-vrspace' if item['id'].startswith('f05-') or item['id'] == 'browser-install' else 'vrspace-service'
        require(item.get('cwd') == record.get('checkoutRoot', '') + '/evaluations/' + package,
                'Hosted stage ran in an unexpected package')
    source = before['service']
    declared = record.get('evaluatedInputs', {}).get('serviceBrowserSources', [])
    sources = {name: source[name]['sha256'] for name in declared}
    for name, (filename, _) in REGRESSIONS.items():
        stage = next(item for item in required if item['id'] == name)
        validate_regression(automation.read_json(root, 'reports/' + filename + '.json'), name, stage, sources)
    evaluated = record['evaluatedInputs']
    validate_inputs(evaluated, before)
    build_data = automation.read_bytes(root, 'build.json')
    require({'bytes': len(build_data), 'sha256': hashlib.sha256(build_data).hexdigest()} == evaluated['buildFingerprint']
            and json.loads(build_data) == evaluated['build'], 'Retained renderer build differs')
    stage = required[-1]
    inner = automation.read_json(root, 'automation/manifest.json')
    require(inner.get('launcher', {}).get('cwd') == record['checkoutRoot'] + '/evaluations/vrspace-service'
            and record['automationOutput'].startswith(record['checkoutRoot'] + '/evaluations/vrspace-service/artifacts/automation-runs/run-'),
            'Automation did not use this checkout')
    validate_automation(inner, evaluated, root / 'automation', stage,
                        automation.read_bytes(root, 'logs/full-automation.txt').decode(), record['automationOutput'])
    toolchain = record.get('toolchain', {})
    require(toolchain.get('node') == 'v' + (ROOT / '.nvmrc').read_text().strip()
            and re.search(r'version "17\.', toolchain.get('java', ''))
            and re.fullmatch(r'3\.(?:1[1-9]|[2-9][0-9])\.[0-9]+', toolchain.get('python', ''))
            and toolchain.get('platform') == 'linux' and re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', toolchain.get('npm', '')),
            'Hosted toolchain evidence is incomplete')
    for key in ('node', 'java', 'npm'):
        require(automation.read_bytes(root, 'logs/' + key + '-version.txt').decode().strip() == toolchain[key],
                'Toolchain differs from actual command output')
    verify_inventory(root, record.get('files'))
