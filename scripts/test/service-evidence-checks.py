"""No-network evidence mutations. Synthetic receipts never establish execution."""
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/ci'))
import service_evidence as evidence
from service import command_contract

spec = importlib.util.spec_from_file_location('old_checks', evidence.SERVICE / 'test/automation-checks.py')
old_checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old_checks)


def stage(name='probe', argv=None):
    argv = argv or ['node', '--version']
    process = {'schemaVersion': 1, 'argv': argv, 'supervisorPid': 100, 'commandPid': 101,
               'startedAt': '2026-10-18T00:02:00Z', 'finishedAt': '2026-10-18T00:07:00Z',
               'outcome': 'passed', 'exitCode': 0, 'requestedSignal': None,
               'shutdown': {'stopped': True, 'needed': False, 'terminateSent': [], 'killSent': []}}
    return {'id': name, 'argv': argv, 'outcome': 'passed', 'exitCode': 0,
            'startedAt': '2026-10-18T00:01:00Z', 'finishedAt': '2026-10-18T00:08:00Z',
            'supervisorExitCode': 0, 'supervisorShutdown': {'terminateSent': False, 'killSent': False},
            'supervision': process, 'processEvidence': name + '-synthetic.process.json'}


def identity():
    return {'repository': evidence.REPOSITORY, 'event': 'pull_request', 'head': 'a' * 40, 'base': 'b' * 40,
            'tested': 'c' * 40, 'tree': 'd' * 40, 'workflowSha': 'e' * 40,
            'workflowRef': evidence.REPOSITORY + '/.github/workflows/engine-ci.yml@refs/pull/6/merge',
            'runId': '123', 'attempt': '1', 'dirty': False}


def write_json(root, name, value):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value) + '\n')


class ServiceEvidenceChecks(unittest.TestCase):
    def test_hosted_identity_rejects_stale_head_base_tested_tree_and_attempt(self):
        value = identity()
        evidence.validate_identity(value, copy.deepcopy(value))
        for key, changed in [('head', 'f' * 40), ('tested', 'f' * 40), ('base', None), ('tree', 'f' * 40),
                             ('runId', '124'), ('attempt', '2'), ('workflowSha', 'f' * 40), ('dirty', True), ('event', 'local')]:
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                mutated = {**value, key: changed}
                evidence.validate_identity(mutated, value)
        for key, changed in [('repository', 'unrelated/repository'), ('dirty', True), ('workflowRef', 'other/workflow'), ('attempt', '')]:
            mutated = {**value, key: changed}
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                evidence.validate_identity(mutated, mutated)

    def test_success_requires_real_owned_command_and_no_leaked_descendants(self):
        value = stage()
        evidence.validate_stage(value, 'probe', ['node', '--version'])
        mutations = [lambda x: x.update(outcome='skipped'), lambda x: x.update(exitCode=None),
                     lambda x: x.update(error='late failure'), lambda x: x.update(argv=['true']),
                     lambda x: x.update(logTruncated=True), lambda x: x['supervision'].pop('commandPid'),
                     lambda x: x['supervision'].update(requestedSignal=15),
                     lambda x: x['supervision']['shutdown'].update(needed=True),
                     lambda x: x['supervision']['shutdown'].update(stopped=False),
                     lambda x: x['supervision']['shutdown'].update(killSent=[{'pid': 102, 'processStartTicks': 7}]),
                     lambda x: x['supervisorShutdown'].update(killSent=True),
                     lambda x: x['supervision'].update(startedAt='2025-01-01T00:00:00Z')]
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index), self.assertRaises(RuntimeError):
                changed = copy.deepcopy(value); mutate(changed)
                evidence.validate_stage(changed, 'probe', ['node', '--version'])

    def test_all_nine_methods_and_both_historical_regression_sets_are_required(self):
        source = {'runner.py': 'a' * 64}
        for name, (_, ids) in evidence.REGRESSIONS.items():
            counts = {'passed': len(ids), 'failed': 0, 'checks': len(ids)}
            if name == 'automation-methods': counts['skipped'] = 0
            report = {'cases': [{'id': item, 'status': 'passed'} for item in ids], 'counts': counts,
                      'sourceDigests': source, 'startedAt': '2026-10-18T00:02:00Z', 'finishedAt': '2026-10-18T00:07:00Z',
                      'pythonOptimized': True, 'runStatus': 'passed', 'sourcesUnchanged': True, 'errors': []}
            evidence.validate_regression(report, name, stage(name), source)
            changes = [lambda x: x['cases'].pop(), lambda x: x['cases'][0].update(status='skipped'),
                       lambda x: x['cases'].reverse(), lambda x: x['counts'].update(passed=0),
                       lambda x: x['sourceDigests'].update({'runner.py': 'b' * 64}),
                       lambda x: x.update(startedAt='2025-01-01T00:00:00Z')]
            if name != 'finalization-regressions': changes.append(lambda x: x.update(pythonOptimized=False))
            for index, mutate in enumerate(changes):
                with self.subTest(name=name, index=index), self.assertRaises(RuntimeError):
                    value = copy.deepcopy(report); mutate(value)
                    evidence.validate_regression(value, name, stage(name), source)
        self.assertEqual(len(evidence.AUTOMATION_METHODS), 9)
        self.assertIn('test_exited_leader_and_detached_term_ignoring_descendants_are_reaped', evidence.AUTOMATION_METHODS)
        self.assertIn('test_real_command_exit_spawn_timeout_and_cancel_fail_closed', evidence.AUTOMATION_METHODS)

    def test_renderer_source_and_worklet_inventory_cannot_be_silently_shortened(self):
        before = evidence.snapshot(ROOT)
        for name in ('test/media-progress.mjs', 'test/media-progress.test.mjs', 'test/lifecycle-browser-checks.mjs', 'test/lifecycle-observer.mjs',
                     'test/lifecycle-profile.json', 'test/lifecycle-observer.test.mjs'):
            self.assertIn(name, before['sibling'])
        inputs = {'service': before['service'], 'siblingSource': before['sibling'],
                  'serviceBrowserSources': evidence.automation.read_json(evidence.SERVICE, 'source-files.json'),
                  'sourcePins': evidence.automation.read_json(evidence.SERVICE, 'source-pins.json'),
                  'build': {'inputs': {name: before['sibling'][name] for name in evidence.BUILD_INPUTS},
                            'workspaceInputs': copy.deepcopy(before['workspace']),
                            'outputs': {name: {'bytes': 1, 'sha256': 'a' * 64} for name in evidence.BUILD_OUTPUTS}}}
        evidence.validate_inputs(inputs, before)
        for mutate in (lambda x: x['build']['inputs'].pop('src/audio-meter.js'),
                       lambda x: x['build']['inputs'].pop('src/xr-session.js'),
                       lambda x: x['build']['inputs']['src/xr-session.js'].update(sha256='f' * 64),
                       lambda x: x['build']['outputs'].pop('dist/audio-meter.js'),
                       lambda x: x['build']['outputs'].pop('dist/portable-world.mjs'),
                       lambda x: x['build']['outputs']['dist/portable-world.mjs'].update(bytes=True),
                       lambda x: x['build']['inputs'].pop('src/portable-world.js'),
                       lambda x: x['build']['inputs'].pop('contracts-build.mjs'),
                       lambda x: x['build'].pop('workspaceInputs'),
                       lambda x: x['build']['workspaceInputs'].pop('packages/contracts/src/canonical.ts'),
                       lambda x: x['build']['workspaceInputs']['packages/contracts/src/schemas.ts'].update(sha256='f' * 64),
                       lambda x: x['siblingSource'].pop('src/main.js'),
                       lambda x: x['siblingSource'].pop('test/browser-finalize.mjs'),
                       lambda x: x['siblingSource'].pop('test/lifecycle-observer.mjs'),
                       lambda x: x['siblingSource'].pop('test/media-progress.mjs'),
                       lambda x: x['siblingSource'].pop('test/lifecycle-profile.json'),
                       lambda x: x['siblingSource']['test/lifecycle-browser-checks.mjs'].update(sha256='f' * 64),
                       lambda x: x['serviceBrowserSources'].remove('command-supervisor.py'),
                       lambda x: x['sourcePins'].update(release='unqualified-master')):
            with self.assertRaises(RuntimeError):
                value = copy.deepcopy(inputs); mutate(value)
                evidence.validate_inputs(value, before)

    def test_retained_file_inventory_rejects_changes_extras_binary_payloads_and_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_json(root, 'reports/automation-checks.json', {'synthetic': True})
            entries = evidence.inventory(root)
            evidence.verify_inventory(root, entries)
            (root / 'reports/automation-checks.json').write_text('changed')
            with self.assertRaises(RuntimeError): evidence.verify_inventory(root, entries)
            write_json(root, 'private.json', {'not': 'allowlisted'})
            with self.assertRaises(RuntimeError): evidence.verify_inventory(root, evidence.inventory(root))
            (root / 'private.json').unlink()
            (root / 'secret-link').symlink_to('/proc/self/status')
            with self.assertRaises(RuntimeError): evidence.inventory(root)

    def test_full_automation_rejects_green_status_with_late_browser_errors_or_bad_shutdown(self):
        # Build an internally consistent synthetic artifact to exercise the exact
        # production verifier; it is never saved as hosted or live-service evidence.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            report, inputs, server, browser_stage, run_path, browser_log = old_checks.browser_fixture()
            pins = evidence.automation.read_json(evidence.SERVICE, 'source-pins.json')
            inputs['sourcePins'] = pins; report['sourcePins'] = pins
            package = '/synthetic/evaluations/vrspace-service'
            options = ['--registry=https://registry.npmjs.org', '--fetch-timeout=15000', '--fetch-retries=0',
                       '--userconfig=' + package + '/artifacts/tool-config/user-npmrc',
                       '--globalconfig=' + package + '/artifacts/tool-config/global-npmrc']
            args = [['node', '--version'], ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund', *options],
                    ['npm', 'audit', '--json', '--audit-level=high', *options], ['/usr/bin/python3', 'setup.py'],
                    ['node', 'browser-checks.mjs'], ['/usr/bin/python3', 'observe-server.py']]
            commands = []
            for name, argv in zip(evidence.INNER_STAGES, args):
                item = stage(name, argv); item['cwd'] = package
                commands.append(item); write_json(root, 'logs/' + item['processEvidence'], item['supervision'])
                (root / 'logs' / (name + '.txt')).write_text('Synthetic command output\n')
            browser_stage = commands[4]
            report.update(startedAt='2026-10-18T00:02:00Z', finishedAt='2026-10-18T00:07:00Z')
            write_json(root, 'browser/browser-checks.json', report)
            (root / 'logs/service-browser.txt').write_text(browser_log)
            for name in ('alpha-courtyard.png', 'beta-courtyard.png'):
                (root / 'browser' / name).write_bytes(old_checks.png())
            audit = {'metadata': {'vulnerabilities': dict.fromkeys(['info', 'low', 'moderate', 'high', 'critical', 'total'], 0)}, 'vulnerabilities': {}}
            write_json(root, 'reports/dependency-audit.json', audit); write_json(root, 'logs/toolkit-audit.txt', audit)
            write_json(root, 'logs/release-download-verify.txt', {'release': pins['release'], 'jarBytes': pins['jar']['bytes'],
                       'jarSha256': pins['jar']['digest'].removeprefix('sha256:'), 'clientBytes': pins['client']['bytes'], 'verified': True})
            final = {**server, 'release': pins, 'shutdown': {'killSent': False}, 'exitCode': 143}
            write_json(root, 'server/run.json', final)
            (root / 'server/server.log').write_text('Synthetic server log, no server was run\n')
            (root / 'logs/server-launcher.txt').write_text('Synthetic launcher output\n')
            snapshot = {'process': {'Pid': str(server['pid'])}, 'processStartTicks': server['processStartTicks'],
                        'allOwnedListenersLoopback': True, 'allObservedEstablishedConnectionsLoopback': True,
                        'sockets': [{'state': '0A', 'local': {'host': '127.0.0.1', 'port': port},
                                     'remote': {'host': '0.0.0.0', 'port': 0}} for port in (18180, 17687)]}
            write_json(root, 'server/process-snapshot.json', snapshot)
            record = {'schemaVersion': 1, 'kind': 'vrspace-release-local-automation', 'mode': 'local', 'ciAcceptance': False,
                      'qualificationStatus': 'incomplete', 'runStatus': 'passed', 'failures': [], 'inputs': inputs,
                      'counts': report['counts'], 'commands': commands, 'server': server, 'browserRun': run_path,
                      'launcher': {'argv': ['/usr/bin/python3', 'server-run.py'], 'cwd': package, 'exitCode': 143, 'outcome': 'stopped'},
                      'health': {'status': 200, 'body': {'status': 'UP'}}, 'shutdown': {'stopped': True, 'killSent': False},
                      'startedAt': '2026-10-18T00:00:30Z', 'finishedAt': '2026-10-18T00:08:30Z', 'files': evidence.inventory(root)}
            outer = stage('full-automation'); outer.update(startedAt='2026-10-18T00:00:00Z', finishedAt='2026-10-18T00:09:00Z')
            output = package + '/artifacts/automation-runs/run-Synthetic'
            log = json.dumps({'runStatus': 'passed', 'qualificationStatus': 'incomplete', 'ciAcceptance': False,
                              'counts': report['counts'], 'output': output, 'failures': []})
            def validate(value): evidence.validate_automation(value, inputs, root, outer, log, output)
            validate(record)
            for mutate in (lambda x: x['commands'].pop(2), lambda x: x['shutdown'].update(javaFallbackKill=True),
                           lambda x: x['shutdown'].update(killSent=True), lambda x: x['failures'].append('cleanup failed'),
                           lambda x: x['launcher'].update(exitCode=0), lambda x: x.update(ciAcceptance=True)):
                with self.assertRaises(RuntimeError):
                    value = copy.deepcopy(record); mutate(value); validate(value)
            for field, value in [('logs', [{'type': 'pageerror', 'text': 'late'}]), ('requests', [{'type': 'failed'}])]:
                changed = copy.deepcopy(report); changed[field] = value
                write_json(root, 'browser/browser-checks.json', changed)
                record['files'] = evidence.inventory(root)
                with self.assertRaises(RuntimeError): validate(record)
            changed = copy.deepcopy(report); changed['observed']['cleanupErrors'] = [{'resource': 'browser', 'error': 'late'}]
            write_json(root, 'browser/browser-checks.json', changed); record['files'] = evidence.inventory(root)
            with self.assertRaises(RuntimeError): validate(record)

            # Also exercise the full outer hosted contract with synthetic bytes,
            # then mutate its current-run binding. No subprocess or service runs.
            before = evidence.snapshot(ROOT)
            declared = evidence.automation.read_json(evidence.SERVICE, 'source-files.json')
            fixture_root = ROOT / 'packages/qualification-fixtures/fixtures'
            fixture_pins = evidence.automation.read_json(ROOT / 'evaluations/babylon-vrspace', 'fixture-pins.json')
            digests = {name.removesuffix('.json'): value['sha256'] for name, value in fixture_pins['files'].items()}
            build = {'schemaVersion': 1, 'inputs': {name: before['sibling'][name] for name in evidence.BUILD_INPUTS},
                     'workspaceInputs': copy.deepcopy(before['workspace']),
                     'outputs': {name: {'bytes': 1, 'sha256': 'a' * 64} for name in evidence.BUILD_OUTPUTS}, 'fixtureDigests': digests}
            with tempfile.TemporaryDirectory() as hosted_directory:
                hosted = Path(hosted_directory)
                write_json(hosted, 'build.json', build)
                evaluated = {'service': before['service'], 'siblingSource': before['sibling'], 'serviceBrowserSources': declared,
                             'sourcePins': pins, 'build': build, 'buildFingerprint': evidence.automation.fingerprint(hosted, 'build.json'),
                             'fixtureDigests': digests,
                             'comparison': evidence.automation.read_json(fixture_root, 'comparison.json'),
                             'resources': {item['path']: {'bytes': item['sizeBytes'], 'sha256': item['sha256']}
                                           for item in evidence.automation.read_json(fixture_root, 'catalog.json')['resources']}}
                report.update(sourceDigests={name: before['service'][name]['sha256'] for name in declared},
                              baseBuild=build, fixtureDigests=digests)
                write_json(root, 'browser/browser-checks.json', report)
                record.update(inputs=evaluated, files=evidence.inventory(root))
                write_json(root, 'manifest.json', record)
                shutil.copytree(root, hosted / 'automation')
                hosted_record = {'schemaVersion': 1, 'kind': 'engine-service-evaluation', 'mode': 'hosted',
                                 'runStatus': 'passed', 'complete': True, 'qualificationStatus': 'incomplete',
                                 'identity': identity(), 'inputs': before, 'evaluatedInputs': evaluated, 'failures': [],
                                 'startedAt': '2026-10-18T00:00:00Z', 'finishedAt': '2026-10-18T00:10:00Z',
                                 'checkoutRoot': '/synthetic', 'automationOutput': output, 'commands': [],
                                 'toolchain': {'node': 'v' + (ROOT / '.nvmrc').read_text().strip(), 'java': 'openjdk version "17.0.20" synthetic',
                                               'npm': '11.9.0', 'python': '3.12.3', 'platform': 'linux'}}
                contract = command_contract()
                for name, argv in contract.items():
                    item = stage(name, argv)
                    selected = 'babylon-vrspace' if name.startswith('f05-') or name == 'browser-install' else 'vrspace-service'
                    item['cwd'] = '/synthetic/evaluations/' + selected
                    if name == 'full-automation': item.update(startedAt=outer['startedAt'], finishedAt=outer['finishedAt'])
                    hosted_record['commands'].append(item)
                    write_json(hosted, 'logs/' + item['processEvidence'], item['supervision'])
                    (hosted / 'logs' / (name + '.txt')).write_text(log if name == 'full-automation' else 'Synthetic command output\n')
                    if name in evidence.REGRESSIONS:
                        filename, ids = evidence.REGRESSIONS[name]
                        counts = {'passed': len(ids), 'failed': 0, 'checks': len(ids)}
                        if name == 'automation-methods': counts['skipped'] = 0
                        write_json(hosted, 'reports/' + filename + '.json', {
                            'cases': [{'id': case, 'status': 'passed'} for case in ids], 'counts': counts,
                            'sourceDigests': report['sourceDigests'], 'startedAt': '2026-10-18T00:02:00Z', 'finishedAt': '2026-10-18T00:07:00Z',
                            'pythonOptimized': True, 'runStatus': 'passed', 'sourcesUnchanged': True, 'errors': []})
                for name in ('node', 'java', 'npm'):
                    (hosted / 'logs' / (name + '-version.txt')).write_text(hosted_record['toolchain'][name] + '\n')
                hosted_record['files'] = evidence.inventory(hosted)
                evidence.verify_report(hosted_record, hosted, identity(), before, contract)
                for mutate in (lambda x: x.update(mode='local'), lambda x: x.update(complete=False),
                               lambda x: x['identity'].update(attempt='2'), lambda x: x['commands'].pop(0),
                               lambda x: x['commands'][0].update(cwd='/other/evaluations/vrspace-service'),
                               lambda x: x['inputs']['ci'].pop('scripts/ci/service.py'),
                               lambda x: x.update(automationOutput=output.replace('run-Synthetic', 'run-Old'))):
                    with self.assertRaises(RuntimeError):
                        value = copy.deepcopy(hosted_record); mutate(value)
                        evidence.verify_report(value, hosted, identity(), before, contract)

    def test_required_commands_keep_optimized_full_automation_and_browser_install(self):
        contract = command_contract()
        self.assertEqual(list(contract), evidence.STAGES)
        self.assertEqual(contract['full-automation'], ['python3', '-B', '-O', 'automate.py'])
        self.assertEqual(contract['automation-methods'], ['python3', '-B', '-O', 'test/report-automation-checks.py'])
        self.assertEqual(contract['browser-install'], ['node', 'node_modules/playwright/cli.js', 'install', '--with-deps', 'chromium'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
