"""Pure, explicitly synthetic envelope tests. No service, browser or process claims."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import sys
import unittest
from unittest.mock import patch
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'ci'))
import f04_runtime_evidence as contract
from cleanup import cleanup_owned
from config import audit_verdict, make_compose, relocate_glb
import watchdog

START, MIDDLE, END = '2026-10-18T00:00:00.000Z', '2026-10-18T00:00:01.000Z', '2026-10-18T00:00:02.000Z'


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + '\n')


def expected_identity():
    return {'head': 'a' * 40, 'tested': 'a' * 40, 'tree': 'b' * 40, 'dirty': False,
            'repository': contract.REPOSITORY, 'event': 'workflow_dispatch', 'ref': 'refs/heads/main',
            'base': None, 'workflowRef': contract.WORKFLOW_REF, 'workflowSha': 'a' * 40,
            'runId': '123', 'attempt': '2', 'operation': 'diagnose'}


def dispatch():
    identity = expected_identity()
    state = {key: identity[key] for key in ('head', 'tested', 'tree', 'dirty')}
    environment = {'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'workflow_dispatch',
                   'GITHUB_REF': 'refs/heads/main', 'F04_MODE': 'diagnose',
                   'GITHUB_REPOSITORY': contract.REPOSITORY, 'GITHUB_SHA': identity['tested'],
                   'GITHUB_WORKFLOW_SHA': identity['tested'], 'CI_WORKFLOW_SHA': identity['tested'],
                   'GITHUB_WORKFLOW_REF': contract.WORKFLOW_REF, 'CI_WORKFLOW_REF': contract.WORKFLOW_REF,
                   'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '2', 'RUNNER_ENVIRONMENT': 'github-hosted',
                   'RUNNER_OS': 'Linux', 'RUNNER_ARCH': 'X64'}
    payload = {'repository': {'full_name': contract.REPOSITORY, 'default_branch': 'main'},
               'ref': 'main', 'inputs': {'mode': 'diagnose'}}
    return state, environment, payload


class EvidenceChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.inputs = contract.source_snapshot()

    def fixture(self, root):
        identity = expected_identity()
        record = {'schemaVersion': 1, 'kind': 'f04-hubs-runtime-hosted', 'mode': 'hosted',
                  'qualificationStatus': 'incomplete', 'identity': identity, 'inputs': copy.deepcopy(self.inputs),
                  'runtimeRunId': 'f04-' + 'c' * 16, 'checkoutRoot': '/synthetic/checkout',
                  'stateRoot': '/synthetic/checkout/artifacts/f04-runtime-state', 'startedAt': START,
                  'finishedAt': END, 'runStatus': 'failed', 'complete': False, 'finalSourcesUnchanged': True,
                  'controller': {'pid': 123, 'startTicks': 456, 'argv': ['python3', '-B', '-O', 'scripts/ci/f04-runtime.py', 'run']},
                  'toolchain': {'pythonExecutable': '/usr/bin/python3'}}
        common = {'schemaVersion': 1, 'identity': identity, 'inputs': record['inputs'],
                  'runtimeRunId': record['runtimeRunId'], 'startedAt': START, 'finishedAt': END,
                  'sourcesUnchanged': True, 'commands': [], 'failures': []}
        run = {**common, 'runtimeReturned': False, 'cancelledSignal': None, 'failures': ['Synthetic pre-runtime failure']}
        cleanup = {**common, 'shutdownPassed': False, 'processes': [], 'supervisorsRemaining': None,
                   'failures': ['Synthetic unobserved cleanup'], 'docker': {}}
        save(root / 'phases/run.json', run)
        save(root / 'phases/cleanup.json', cleanup)
        self.bind(record, root)
        return record

    def bind(self, record, root):
        record['files'] = contract.inventory(root)
        record['failures'] = contract.assess(record, root)
        record['runStatus'] = 'failed' if record['failures'] else 'passed'
        record['complete'] = record['runStatus'] == 'passed'

    def verify(self, record, root):
        return contract.verify_record(record, root, expected_identity(), self.inputs)

    def command(self, root, name, argv, *, prefix='runtime/logs/', exit_code=0, log='synthetic output\n', cwd='/synthetic/checkout'):
        passed = exit_code == 0
        process = {'schemaVersion': 1, 'argv': argv, 'supervisorPid': 101, 'commandPid': 102,
                   'startedAt': MIDDLE, 'finishedAt': MIDDLE, 'outcome': 'passed' if passed else 'failed',
                   'exitCode': exit_code, 'requestedSignal': None,
                   'shutdown': {'needed': False, 'stopped': True, 'terminateSent': [], 'killSent': []}}
        item = {'id': name, 'argv': argv, 'cwd': cwd, 'startedAt': MIDDLE, 'finishedAt': MIDDLE,
                'outcome': process['outcome'], 'exitCode': exit_code, 'supervisorExitCode': exit_code,
                'supervisorShutdown': {'terminateSent': False, 'killSent': False},
                'processEvidence': name + '-12345678.process.json', 'supervision': process}
        if not passed:
            item['error'] = 'Synthetic nonzero command'
        path = root / (prefix + name + '.txt')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(log)
        save(root / (prefix + item['processEvidence']), process)
        return item

    def clean_watchdog(self, record, root):
        cleanup = contract.json_file(root / 'phases/cleanup.json')
        cleanup.update(shutdownPassed=True, failures=[], supervisorsRemaining=[],
                       processes=[{'pid': 123, 'startTicks': 456, 'stopped': True, 'killSent': False, 'alreadyExited': True}],
                       recoverySources={name: self.inputs['files'][name] for name in contract.RECOVERY_FILES},
                       docker={'containersNetworksVolumesImagesAbsent': True})
        cleanup['commands'] = [self.command(root, 'watchdog-cleanup-' + kind + '-list-' + str(index),
                                           contract.docker_query(record['runtimeRunId'], kind), prefix='logs/', log='',
                                           cwd=record['checkoutRoot'])
                               for index, kind in enumerate(('container', 'network', 'volume', 'image'), 1)]
        save(root / 'phases/cleanup.json', cleanup)
        return cleanup

    def inner(self, record):
        return {'schemaVersion': 1, 'runId': record['runtimeRunId'], 'mode': 'diagnose', 'qualification': 'incomplete',
                'startedAt': START, 'finishedAt': END, 'sources': self.inputs['runtime'], 'pins': self.inputs['pins'],
                'fixtures': self.inputs['fixtures'], 'commands': [], 'audits': {}, 'auditFailures': [],
                'failures': [], 'browserPassed': False, 'shutdownPassed': True, 'overallStatus': 'failed',
                'runtimeStartAttempted': False, 'runtimeExecuted': False}

    def save_inner(self, record, root, inner):
        files = contract.inventory(root)
        inner['artifacts'] = {name.removeprefix('runtime/'): value for name, value in files.items()
                              if name.startswith('runtime/') and name != 'runtime/manifest.json'}
        save(root / 'runtime/manifest.json', inner)
        phase = contract.json_file(root / 'phases/run.json')
        phase['runtimeReturned'] = True
        save(root / 'phases/run.json', phase)

    def runtime_with_failed_audit(self, record, root):
        """A complete *synthetic* diagnostic envelope; it never executes the stack."""
        inner = self.inner(record)
        inner.update(runtimeStartAttempted=True, runtimeExecuted=True, browserPassed=True,
                     repository={'head': record['identity']['tested'], 'tree': record['identity']['tree'], 'dirty': False},
                     upstreamTrees={name: 'd' * 40 for name in self.inputs['pins']['sources']})
        scenario = contract.json_file(contract.ROOT / 'packages/qualification-fixtures/fixtures/scenario.json')
        point = next(item for item in scenario['steps'] if item['id'] == 'walk-through-arch')['position']
        glb, relocation = relocate_glb((contract.BUNDLE / self.inputs['pins']['spokeExport']['path']).read_bytes(),
                                      record['runtimeRunId'], self.inputs['fixtures']['files'], point)
        derived = {'bytes': len(glb), 'sha256': hashlib.sha256(glb).hexdigest()}
        inner['contexts'] = {}
        for service, source in (('hubs-client', 'hubs'), ('dialog', 'dialog'), ('reticulum', 'reticulum')):
            value = {'schemaVersion': 1, 'runId': record['runtimeRunId'], 'source': source,
                     'commit': self.inputs['pins']['sources'][source]['commit'], 'tree': 'd' * 40,
                     'files': self.inputs['pins']['sources'][source]['files'], 'adaptations': [],
                     'baseImage': self.inputs['pins']['images']['images'][source]['image']}
            if source == 'hubs':
                value.update(fixture=self.inputs['fixtures'], relocation=relocation, derivedModel=derived,
                             modelUrl='https://hubs.local:8080/evaluation/' + record['runtimeRunId'] + '/courtyard.glb')
            inner['contexts'][service] = value
        save(root / 'runtime/adaptations.json', inner['contexts'])
        run_dir = record['checkoutRoot'] + '/evaluations/hubs-spoke/artifacts/runtime-runs/' + record['runtimeRunId']
        save(root / 'runtime/compose.json', make_compose(run_dir, record['runtimeRunId'], self.inputs['pins']))
        running = [{'Config': {'Labels': {'com.docker.compose.project': record['runtimeRunId'],
                    'org.browser-vr-engine.f04-run': record['runtimeRunId'], 'com.docker.compose.service': service}},
                    'HostConfig': {}, 'State': {'Running': True}, 'NetworkSettings': {'Ports': {}}}
                   for service in ('db', 'dialog', 'hubs-client', 'reticulum')]
        save(root / 'runtime/containers-running.json', running)
        input_value = {'runId': record['runtimeRunId'], 'modelUrl': inner['contexts']['hubs-client']['modelUrl'],
                       'modelFingerprint': derived, 'sources': self.inputs['runtime'], 'fixtures': self.inputs['fixtures'],
                       'upstreamTrees': inner['upstreamTrees'], 'browserOverride': False}
        report = {'schemaVersion': 1, 'runId': record['runtimeRunId'], 'input': input_value, 'startedAt': MIDDLE,
                  'finishedAt': MIDDLE, 'checks': [{'id': name, 'status': 'passed'} for name in contract.runtime.CHECKS],
                  'counts': {'passed': 9, 'failed': 0}, 'runStatus': 'passed', 'errors': [], 'failedRequests': [],
                  'blockedRequests': [], 'cleanupErrors': [], 'fatal': None, 'cleanupSettled': True, 'screenshots': {}}
        def chunk(name, data):
            return struct.pack('>I', len(data)) + name + data + struct.pack('>I', zlib.crc32(name + data))
        png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1280, 800, 8, 6, 0, 0, 0))
               + chunk(b'IDAT', zlib.compress(b'\0' * ((1280 * 4 + 1) * 800))) + chunk(b'IEND', b''))
        for name in ('alpha.png', 'beta.png'):
            path = root / ('runtime/browser/' + name)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(png)
            report['screenshots'][name] = {'bytes': len(png), 'sha256': hashlib.sha256(png).hexdigest()}
        save(root / 'runtime/browser/input.json', input_value)
        save(root / 'runtime/browser/browser-checks.json', report)
        expected = contract.runtime_commands(record)
        for name in contract.runtime_core_stages(self.inputs['pins']):
            command = copy.deepcopy(expected[name])
            log, exit_code = 'synthetic output\n', 0
            if name == 'service-readiness':
                command['argv'].append(derived['sha256'])
                log = json.dumps({'runId': record['runtimeRunId'], 'modelSha256': derived['sha256'], 'reticulumStatus': 200})
            elif name == 'repository-head':
                log = record['identity']['tested']
            elif name == 'repository-tree':
                log = record['identity']['tree']
            elif name == 'repository-status':
                log = ''
            elif name.endswith('-head'):
                log = self.inputs['pins']['sources'][name.removesuffix('-head')]['commit']
            elif name.endswith('-tree'):
                log = 'd' * 40
            elif name.startswith('identity-'):
                log = json.dumps(inner['contexts'][name.removeprefix('identity-')])
            elif name.endswith('-audit'):
                graph = name.removesuffix('-audit')
                exit_code = 1 if graph == 'hubs' else 0
                audit = {'auditReportVersion': 2, 'vulnerabilities': {'synthetic-library': {'severity': 'high'}} if exit_code else {},
                         'metadata': {'vulnerabilities': {'info': 0, 'low': 0, 'moderate': 0, 'high': exit_code, 'critical': 0, 'total': exit_code}}}
                receipt = {'name': graph, 'startedAt': MIDDLE, 'finishedAt': MIDDLE, 'cwd': command['argv'][2],
                           'argv': contract.AUDIT_ARGV, 'sourceUnchanged': True, 'signal': None, 'errorCode': None, 'exitCode': exit_code,
                           'inputs': {filename: self.inputs['files']['evaluations/hubs-spoke/' + filename]['sha256'] if graph == 'toolkit'
                                      else self.inputs['pins']['sources'][graph]['files'][filename]['sha256']
                                      for filename in ('package.json', 'package-lock.json')}}
                save(root / ('runtime/audits/' + graph + '.stdout.json'), audit)
                save(root / ('runtime/audits/' + graph + '.receipt.json'), receipt)
                inner['audits'][graph] = audit_verdict(audit, exit_code)
            elif name == 'two-client-browser':
                inner['commands'].append(self.command(root, 'container-inspect-100',
                    ['docker', '--host', 'unix:///var/run/docker.sock', 'inspect', 'synthetic-container'],
                    cwd=run_dir + '/work', log=json.dumps(running)))
                log = json.dumps({'runId': record['runtimeRunId'], 'runStatus': 'passed', 'counts': report['counts']})
            inner['commands'].append(self.command(root, name, command['argv'], cwd=command['cwd'], exit_code=exit_code, log=log))
        inner['auditFailures'] = ['hubs']
        self.save_inner(record, root, inner)
        return inner, report

    def test_current_main_dispatch_identity_is_exact(self):
        state, env, payload = dispatch()
        self.assertEqual(contract.identity_from(state, env, payload), expected_identity())
        payload['ref'] = 'refs/heads/main'
        self.assertEqual(contract.identity_from(state, env, payload), expected_identity())

    def test_dispatch_rejects_branch_event_workflow_override_and_runner_changes(self):
        for key, value in [('GITHUB_EVENT_NAME', 'push'), ('GITHUB_REF', 'refs/heads/proposal'),
                           ('GITHUB_REPOSITORY', 'other/project'), ('GITHUB_SHA', 'c' * 40),
                           ('GITHUB_WORKFLOW_SHA', 'c' * 40), ('CI_WORKFLOW_SHA', 'c' * 40),
                           ('GITHUB_WORKFLOW_REF', contract.WORKFLOW_REF.replace('main', 'proposal')),
                           ('CI_WORKFLOW_REF', ''), ('RUNNER_ENVIRONMENT', 'self-hosted'),
                           ('RUNNER_OS', 'Windows'), ('RUNNER_ARCH', 'ARM64'),
                           ('CHROME_EXECUTABLE', '/synthetic/browser'), ('F03_FIXTURE_ROOT', '/synthetic/fixtures'),
                           ('F04_MODE', 'evaluate')]:
            state, env, payload = dispatch()
            env[key] = value
            with self.subTest(field=key), self.assertRaises(RuntimeError):
                contract.identity_from(state, env, payload)
        for mutate in (lambda p: p.update(ref='proposal'), lambda p: p['inputs'].update(extra='unknown'),
                       lambda p: p['repository'].update(default_branch='other')):
            state, env, payload = dispatch()
            mutate(payload)
            with self.assertRaises(RuntimeError):
                contract.identity_from(state, env, payload)

    def test_dirty_or_malformed_commit_run_and_attempt_are_rejected(self):
        for key, value in [('dirty', True), ('head', 'c' * 40), ('tested', 'short'), ('tree', 'g' * 40),
                           ('runId', '0'), ('attempt', '-1'), ('base', 'd' * 40)]:
            identity = expected_identity()
            identity[key] = value
            with self.subTest(field=key), self.assertRaises(RuntimeError):
                contract.validate_identity(identity)

    def test_valid_failed_partial_artifact_does_not_become_acceptance(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            record = self.fixture(root)
            self.assertEqual(self.verify(record, root), 'failed')
            for changed in ({**record, 'runStatus': 'passed'}, {**record, 'complete': True}, {**record, 'failures': []}):
                with self.assertRaises(RuntimeError):
                    self.verify(changed, root)

    def test_run_attempt_source_and_inventory_binding_cannot_be_substituted(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            record = self.fixture(root)
            for mutate in (lambda r: r['identity'].update(attempt='3'),
                           lambda r: r['inputs']['files']['.nvmrc'].update(sha256='0' * 64),
                           lambda r: r['files']['phases/run.json'].update(bytes=0),
                           lambda r: r.update(stateRoot='/outside')):
                changed = copy.deepcopy(record)
                mutate(changed)
                with self.assertRaises(RuntimeError):
                    self.verify(changed, root)

    def test_valid_failed_audit_remains_a_failure_with_exact_lock_and_exit_binding(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            record = self.fixture(root)
            inner = self.inner(record)
            source = record['checkoutRoot'] + '/evaluations/hubs-spoke/artifacts/runtime-runs/' + record['runtimeRunId'] + '/work/sources/hubs'
            output = source.split('/work/sources/')[0] + '/evidence/audits'
            argv = ['node', record['checkoutRoot'] + '/evaluations/hubs-spoke/runtime/audit.mjs', source, output, 'hubs']
            inner['commands'].append(self.command(root, 'hubs-audit', argv, exit_code=1, cwd=source.split('/sources/')[0]))
            audit = {'auditReportVersion': 2, 'vulnerabilities': {'synthetic-public-library': {'severity': 'high'}}, 'metadata': {
                'vulnerabilities': {'info': 0, 'low': 0, 'moderate': 0, 'high': 1, 'critical': 0, 'total': 1}}}
            receipt = {'name': 'hubs', 'startedAt': MIDDLE, 'finishedAt': MIDDLE, 'cwd': source, 'argv': contract.AUDIT_ARGV,
                       'sourceUnchanged': True, 'signal': None, 'errorCode': None, 'exitCode': 1,
                       'inputs': {name: self.inputs['pins']['sources']['hubs']['files'][name]['sha256']
                                  for name in ('package.json', 'package-lock.json')}}
            save(root / 'runtime/audits/hubs.stdout.json', audit)
            save(root / 'runtime/audits/hubs.receipt.json', receipt)
            inner['audits']['hubs'] = audit_verdict(audit, 1)
            inner['auditFailures'] = ['hubs']
            self.save_inner(record, root, inner)
            self.bind(record, root)
            self.assertEqual(self.verify(record, root), 'failed')
            for mutate in (lambda r: r.update(overallStatus='passed'), lambda r: r.update(auditFailures=[]),
                           lambda r: r['audits']['hubs'].update(passed=True)):
                changed = copy.deepcopy(inner)
                mutate(changed)
                save(root / 'runtime/manifest.json', changed)
                record['files'] = contract.inventory(root)
                with self.assertRaises(RuntimeError):
                    self.verify(record, root)

    def test_unknown_symlink_and_escaping_artifact_paths_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.fixture(root)
            (root / 'private.pem').write_text('synthetic not a key')
            with self.assertRaises(RuntimeError):
                contract.inventory(root)
            (root / 'private.pem').unlink()
            (root / 'logs').symlink_to(root / 'phases', target_is_directory=True)
            with self.assertRaises(RuntimeError):
                contract.inventory(root)
            with self.assertRaises(RuntimeError):
                contract.safe_path(root, '../outside')

    def test_command_supervision_failure_cannot_hide_behind_zero_exit(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            item = self.command(root, 'node-version', ['node', '--version'], prefix='logs/')
            contract.validate_command(item, root, 'logs/')
            for mutate in (lambda r: r.update(error='synthetic failure'), lambda r: r.update(supervisorExitCode=1),
                           lambda r: r.update(logTruncated=True), lambda r: r['supervision'].update(requestedSignal=15),
                           lambda r: r['supervision']['shutdown'].update(needed=True)):
                changed = copy.deepcopy(item)
                mutate(changed)
                save(root / ('logs/' + changed['processEvidence']), changed['supervision'])
                with self.assertRaises(RuntimeError):
                    contract.validate_command(changed, root, 'logs/')

    def test_cleanup_force_error_and_missing_resource_proof_remain_failures(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            record = self.fixture(root)
            clean = self.clean_watchdog(record, root)
            self.bind(record, root)
            self.assertEqual(self.verify(record, root), 'failed')
            for mutate in (lambda r: r.update(commands=[]), lambda r: r.update(processes=[]),
                           lambda r: r['commands'][0]['argv'].append('--all'),
                           lambda r: r.update(recoverySources={})):
                changed = copy.deepcopy(clean)
                mutate(changed)
                save(root / 'phases/cleanup.json', changed)
                record['files'] = contract.inventory(root)
                with self.assertRaises(RuntimeError):
                    self.verify(record, root)
            for mutate in (lambda r: r.update(processes=[{'stopped': True, 'killSent': True}]),
                           lambda r: r.update(processes=[{'stopped': True, 'killSent': False, 'error': 'refused'}]),
                           lambda r: r.update(supervisorsRemaining=[{'pid': 123}]),
                           lambda r: r['docker'].update(containersNetworksVolumesImagesAbsent=False),
                           lambda r: r.update(failures=['synthetic late cleanup failure'])):
                changed = copy.deepcopy(clean)
                mutate(changed)
                changed['shutdownPassed'] = False
                save(root / 'phases/cleanup.json', changed)
                self.bind(record, root)
                self.assertTrue(any('cleanup' in value or 'shutdown' in value or 'resources' in value for value in record['failures']))
                self.assertEqual(self.verify(record, root), 'failed')

    def test_late_browser_error_is_rejected_even_with_all_nine_passed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            record = self.fixture(root)
            inner, report = self.runtime_with_failed_audit(record, root)
            self.bind(record, root)
            self.assertEqual(self.verify(record, root), 'failed')
            for mutate in (lambda r: r.update(fatal='synthetic late failure'),
                           lambda r: r.update(cleanupErrors=['synthetic cleanup failure']),
                           lambda r: r.update(errors=['synthetic page error']),
                           lambda r: r.update(blockedRequests=['https://synthetic-external.example'])):
                changed = copy.deepcopy(report)
                mutate(changed)
                save(root / 'runtime/browser/browser-checks.json', changed)
                self.save_inner(record, root, inner)
                record['files'] = contract.inventory(root)
                with self.assertRaises(RuntimeError):
                    self.verify(record, root)
            save(root / 'runtime/browser/browser-checks.json', report)
            for mutate in (lambda value: value['commands'][-1]['argv'].__setitem__(1, '/wrong/browser.mjs'),
                           lambda value: value['commands'][-1].update(cwd='/wrong'),
                           lambda value: value['commands'].pop(0), lambda value: value.update(upstreamTrees={}),
                           lambda value: value['contexts']['hubs-client']['derivedModel'].update(sha256='0' * 64)):
                changed = copy.deepcopy(inner)
                mutate(changed)
                # Keep process receipt consistent so the intended source/stage
                # boundary, rather than an incidental envelope mismatch, rejects it.
                if changed['commands'] and changed['commands'][-1]['id'] == 'two-client-browser':
                    item = changed['commands'][-1]
                    item['supervision']['argv'] = item['argv']
                    save(root / ('runtime/logs/' + item['processEvidence']), item['supervision'])
                self.save_inner(record, root, changed)
                record['files'] = contract.inventory(root)
                with self.assertRaises(RuntimeError):
                    self.verify(record, root)

    def test_original_cleanup_blobs_are_checked_without_reading_changed_working_helpers(self):
        # Loading the watchdog entry point and its receipt helpers must not
        # execute any working-tree runtime module before original Git recovery.
        modules = {name: None for name in ('run', 'config', 'prepare', 'cleanup', 'watchdog')}
        spec = importlib.util.spec_from_file_location('synthetic_receipt_bootstrap', contract.ROOT / 'scripts/ci/f04_runtime_evidence.py')
        bootstrap = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, modules):
            spec.loader.exec_module(bootstrap)
            with patch.dict(sys.modules, {'f04_runtime_evidence': bootstrap}):
                entry_spec = importlib.util.spec_from_file_location('synthetic_cleanup_entry', contract.ROOT / 'scripts/ci/f04-runtime.py')
                entry = importlib.util.module_from_spec(entry_spec)
                entry_spec.loader.exec_module(entry)
                self.assertEqual(entry.phase({'identity': {}, 'runtimeRunId': 'synthetic', 'inputs': {}})['commands'], [])
        control = {'inputs': self.inputs}
        original = {name: contract.safe_path(contract.ROOT, name).read_bytes() for name in contract.RECOVERY_FILES}
        contract.verify_original_bytes(control, original)
        for name in contract.RECOVERY_FILES:
            changed = {**original, name: original[name] + b'\n# synthetic wrong original source\n'}
            with self.subTest(source=name), self.assertRaises(RuntimeError):
                contract.verify_original_bytes(control, changed)
        # The verifier consumes explicit original Git bytes, not any current
        # helper path; current-source failure remains a separate fatal outcome.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            record = self.fixture(root)
            self.clean_watchdog(record, root)
            phase = contract.json_file(root / 'phases/cleanup.json')
            phase.update(sourcesUnchanged=False, shutdownPassed=False, failures=['Synthetic dirty current checkout; original recovery completed'])
            save(root / 'phases/cleanup.json', phase)
            record['finalSourcesUnchanged'] = False
            self.bind(record, root)
            self.assertEqual(self.verify(record, root), 'failed')

    def test_unrelated_non_utf8_process_arguments_do_not_abort_owned_path_scanning(self):
        raw = b'python3\0-B\0-O\0/unrelated.py\0\xff\0'
        with patch.object(Path, 'read_bytes', return_value=raw):
            unrelated = watchdog.process_argv(123)
        self.assertEqual(unrelated[-1].encode('utf-8', 'surrogateescape'), b'\xff')
        known = '/synthetic/original/command-supervisor.py'
        owned = ['python3', '-B', '-O', known, '--report-fd', '1', '--term-seconds', '5', '--kill-seconds', '5', '--', 'node']
        def stat_bytes(path):
            return path.parent.name.encode('ascii') + b' (synthetic-\xff) ' + b' '.join([b'S', *([b'0'] * 18), b'10'])
        with patch('watchdog.require_process_api'), patch.object(Path, 'iterdir', return_value=[Path('/proc/123'), Path('/proc/124')]), \
             patch.object(Path, 'read_bytes', autospec=True, side_effect=stat_bytes), \
             patch('watchdog.process_argv', side_effect=lambda pid: unrelated if pid == 123 else owned):
            self.assertEqual(watchdog.owned_supervisors([known]), [{'pid': 124, 'startTicks': 10, 'argv': owned}])

    def test_docker_cleanup_requires_both_ownership_labels_and_attempts_down_after_log_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, run_id = Path(temporary), 'f04-' + 'd' * 16
            save(root / 'work/compose.json', make_compose(root, run_id, self.inputs['pins']))
            observed = []
            def call(name, argv, timeout):
                observed.append(argv)
                if 'logs' in argv:
                    raise RuntimeError('synthetic log capture failure')
                return ''
            receipt = cleanup_owned(root, run_id, self.inputs['pins'], call)
            self.assertTrue(receipt['stopped'])
            self.assertEqual(len(receipt['errors']), 1)
            self.assertTrue(any('down' in argv for argv in observed))
            def unowned(name, argv, timeout):
                if argv[3:5] == ['ps', '-aq']:
                    return 'synthetic-container\n'
                if argv[3] == 'inspect':
                    return json.dumps([{'Config': {'Labels': {'com.docker.compose.project': run_id}}, 'HostConfig': {}}])
                return ''
            with self.assertRaises(RuntimeError):
                cleanup_owned(root, run_id, self.inputs['pins'], unowned)

    def test_artifact_byte_filter_runs_before_copy_or_upload(self):
        for name, data in [('cache/package.tgz', b'synthetic archive'),
                           ('logs/setup.txt', b'-----BEGIN ' + b'RSA PRIVATE KEY-----'),
                           ('logs/setup.txt', b'eyJsynthetic.synthetic.synthetic'),
                           ('logs/setup.txt', b'x' * (16 * 1024 * 1024 + 1))]:
            with self.subTest(name=name), self.assertRaises(RuntimeError):
                contract.validate_artifact_bytes(name, data)
        contract.validate_artifact_bytes('logs/setup.txt', b'synthetic bounded ordinary output')


if __name__ == '__main__':
    unittest.main(verbosity=2)
