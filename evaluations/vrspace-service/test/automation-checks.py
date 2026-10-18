"""Synthetic automation-verifier/process tests; these do not qualify VRSpace or CI."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import select
import signal
import struct
import sys
import tempfile
import time
import unittest
import zlib

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('service_automation', ROOT / 'automate.py')
automation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(automation)


def browser_fixture():
    names = sorted(automation.SERVICE_FILES)
    inputs = {'serviceBrowserSources': names, 'service': {name: {'bytes': 1, 'sha256': '0' * 64} for name in names},
              'sourcePins': {'release': 'synthetic-validator-fixture-not-vrspace'},
              'build': {'schemaVersion': 1}, 'fixtureDigests': {'synthetic': '1' * 64}}
    owned = {'pid': 123, 'processStartTicks': 456, 'runDirectory': '/synthetic/owned/server-fixture'}
    stage = {'startedAt': '2026-10-17T00:00:00Z', 'finishedAt': '2026-10-17T00:01:00Z', 'outcome': 'passed', 'exitCode': 0}
    report = {'runStatus': 'passed', 'qualificationStatus': 'incomplete',
              'counts': {'passed': 9, 'failed': 0, 'checks': 9},
              'finalization': {'evaluatedAfterCleanupSettled': True, 'browserErrors': 0, 'probeErrors': 0,
                               'failedOrBlockedRequests': 0, 'cleanupErrors': 0},
              'checks': [{'id': name, 'status': 'passed', 'method': 'two-real-browser-pages-and-release-server'} for name in automation.CHECKS],
              'requests': [], 'logs': [], 'sourcePins': inputs['sourcePins'],
              'sourceDigests': {name: '0' * 64 for name in names},
              'baseBuild': inputs['build'], 'fixtureDigests': inputs['fixtureDigests'],
              'startedAt': '2026-10-17T00:00:01Z', 'finishedAt': '2026-10-17T00:00:59Z',
              'observed': {'serverRun': owned, 'health': {'status': 200, 'body': {'status': 'UP'}},
                           'final': [{'errors': []}, {'errors': []}],
                           'environment': {'physicalGPU': False, 'physicalHeadset': False, 'physicalAudio': False}},
              'missingEvidence': ['Synthetic validator input; no service or browser was executed.']}
    run_path = 'artifacts/browser-runs/run-Synthetic'
    log = json.dumps({'runStatus': 'passed', 'counts': report['counts'], 'output': run_path})
    return report, inputs, owned, stage, run_path, log


def png(width=1280, height=800):
    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload))
    header = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    pixels = bytes((width * 4 + 1) * height)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')


class AutomationChecks(unittest.TestCase):
    def test_synthetic_browser_binding_accepts_without_execution_claim(self):
        automation.validate_browser(*browser_fixture())

    def test_browser_failures_remain_failures_after_consistent_counts(self):
        cases = [
            lambda value: value[0]['checks'].pop(),
            lambda value: value[0]['checks'].reverse(),
            lambda value: value[0]['checks'][0].update(status='failed'),
            lambda value: value[0]['sourceDigests'].pop('process_control.py'),
            lambda value: value[0]['sourceDigests'].update({'network.js': 'f' * 64}),
            lambda value: value[0]['observed'].update(serverRun={'pid': 999}),
            lambda value: value[0]['observed'].update(health={'status': 503, 'body': {'status': 'DOWN'}}),
            lambda value: value[0]['requests'].append({'url': 'https://example.invalid'}),
            lambda value: value[0]['logs'].append({'type': 'pageerror', 'text': 'synthetic'}),
            lambda value: value[0]['logs'].append('malformed'),
            lambda value: value[0]['observed'].update(cleanupErrors=[{'resource': 'browser', 'error': 'synthetic late cleanup failure'}]),
            lambda value: value[0]['observed'].update(cleanupErrors={}),
            lambda value: value[0]['observed'].update(cleanupErrors=''),
            lambda value: value[0]['observed'].update(cleanupErrors=None),
            lambda value: value[0]['observed'].update(fatal='synthetic late failure'),
            lambda value: value[0]['observed'].update(fatal=''),
            lambda value: value[0]['observed'].update(fatal=False),
            lambda value: value[0].update(observed=[]),
            lambda value: value[0]['observed']['final'][0]['errors'].append('synthetic late client error'),
            lambda value: value[0]['observed']['final'].pop(),
            lambda value: value[0]['observed'].update(final=None),
            lambda value: value[0].pop('finalization'),
            lambda value: value[0]['finalization'].update(evaluatedAfterCleanupSettled=False),
            lambda value: value[0]['finalization'].update(browserErrors=1),
            lambda value: value[0]['finalization'].update(probeErrors=1),
            lambda value: value[0]['finalization'].update(failedOrBlockedRequests=1),
            lambda value: value[0]['finalization'].update(cleanupErrors=1),
            lambda value: value[0].update(startedAt='2025-01-01T00:00:00Z'),
            lambda value: value[0].update(qualificationStatus='complete'),
            lambda value: value[0]['observed']['environment'].update(physicalHeadset=True),
            lambda value: value[3].update(exitCode=7),
            lambda value: value[3].update(outcome='failed'),
        ]
        for change in cases:
            with self.subTest(change=cases.index(change)):
                value = copy.deepcopy(browser_fixture())
                change(value)
                with self.assertRaises(RuntimeError):
                    automation.validate_browser(*value)

    def test_stdout_must_identify_exactly_one_fresh_browser_run(self):
        for mutate in (lambda log: log + '\n' + log, lambda log: log.replace('run-Synthetic', 'run-Older'), lambda _log: ''):
            value = list(browser_fixture())
            value[-1] = mutate(value[-1])
            with self.assertRaises(RuntimeError):
                automation.validate_browser(*value)

    def test_audit_requires_consistent_registry_entries_and_success(self):
        clear = {'metadata': {'vulnerabilities': dict.fromkeys(['info', 'low', 'moderate', 'high', 'critical', 'total'], 0)}, 'vulnerabilities': {}}
        automation.validate_audit(clear, 0)
        low = copy.deepcopy(clear)
        low['metadata']['vulnerabilities'].update(low=1, total=1)
        low['vulnerabilities']['fixture'] = {'severity': 'low'}
        automation.validate_audit(low, 0)
        high = copy.deepcopy(clear)
        high['metadata']['vulnerabilities'].update(high=1, total=1)
        high['vulnerabilities']['fixture'] = {'severity': 'high'}
        for value, code in ((clear, 1), (high, 0), ({'error': 'registry unavailable'}, 0), ({**clear, 'vulnerabilities': {'unreported': {'severity': 'low'}}}, 0)):
            with self.assertRaises(RuntimeError):
                automation.validate_audit(value, code)

    def test_screenshot_checks_dimensions_checksums_complete_rows(self):
        data = png()
        automation.validate_png(data)
        changed = bytearray(data)
        changed[-1] ^= 1
        for broken in (data[:24], data[:-1], bytes(changed), png(640, 480)):
            with self.assertRaises(RuntimeError):
                automation.validate_png(broken)

    def test_source_snapshot_includes_new_worklet_and_rejects_file_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'src').mkdir()
            (root / 'src/audio-meter.js').write_text('// synthetic input\n')
            first = automation.source_snapshot(root)
            self.assertIn('src/audio-meter.js', first)
            (root / 'src/audio-meter.js').write_text('// changed input\n')
            self.assertNotEqual(automation.source_snapshot(root), first)
            (root / 'outside.txt').write_text('synthetic')
            (root / 'src/link.js').symlink_to(root / 'outside.txt')
            with self.assertRaises(RuntimeError):
                automation.contained(root / 'src', 'link.js')
            with self.assertRaises(RuntimeError):
                automation.contained(root, '../outside.txt')

    def test_real_command_exit_spawn_timeout_and_cancel_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            environment = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'LANG': 'C.UTF-8', 'TMPDIR': str(root)}
            options = {'root': root, 'environment': environment, 'log_path': root / 'command.txt', 'timeout': 2}
            good = automation.run_command([sys.executable, '-c', 'print("synthetic command")'], **options)
            self.assertEqual(good['outcome'], 'passed', good)
            failed = automation.run_command([sys.executable, '-c', 'raise SystemExit(7)'], **options)
            self.assertEqual((failed['outcome'], failed['exitCode']), ('failed', 7))
            missing = automation.run_command(['/__bve_synthetic_missing_executable__'], **options)
            self.assertEqual(missing['outcome'], 'failed')
            cancelled = automation.run_command([sys.executable, '-c', 'print("must not run")'], **options, cancelled=lambda: True)
            self.assertEqual(cancelled['outcome'], 'failed')
            code = 'import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(20)'
            result = automation.run_command([sys.executable, '-c', code], **{**options, 'timeout': .3},
                                            terminate_timeout=.1, kill_timeout=1)
            self.assertEqual((result['outcome'], result['exitCode']), ('failed', -signal.SIGKILL))
            self.assertTrue(result['supervision']['shutdown']['stopped'])

    def test_exited_leader_and_detached_term_ignoring_descendants_are_reaped(self):
        # These real children are deliberately hostile lifecycle probes. They do
        # not run Playwright, VRSpace, network requests, or a production workload.
        for detached, leader_exit in ((False, 7), (True, 0), (True, None)):
            with self.subTest(detached=detached, leader_exit=leader_exit), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                marker = root / 'owned-child.json'
                child = (
                    'import json,os,pathlib,signal,time; '
                    'signal.signal(signal.SIGTERM,signal.SIG_IGN); '
                    'ticks=int(pathlib.Path("/proc/self/stat").read_text().rsplit(") ",1)[1].split()[19]); '
                    f'pathlib.Path({str(marker)!r}).write_text(json.dumps({{"pid":os.getpid(),"ticks":ticks}})); '
                    'time.sleep(20)'
                )
                parent = (
                    'import pathlib,subprocess,sys,time\n'
                    f'subprocess.Popen([sys.executable,"-c",{child!r}],start_new_session={detached!r})\n'
                    'deadline=time.monotonic()+2\n'
                    f'while not pathlib.Path({str(marker)!r}).exists() and time.monotonic()<deadline: time.sleep(.01)\n'
                    + ('time.sleep(20)\n' if leader_exit is None else f'raise SystemExit({leader_exit})\n')
                )
                environment = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'LANG': 'C.UTF-8', 'TMPDIR': str(root)}
                started = time.monotonic()
                try:
                    result = automation.run_command([sys.executable, '-c', parent], root=root, environment=environment,
                                                    log_path=root / 'command.txt', timeout=.5 if leader_exit is None else 3,
                                                    terminate_timeout=.1, kill_timeout=1)
                    self.assertLess(time.monotonic() - started, 3, result)
                    self.assertEqual(result['outcome'], 'failed', result)
                    self.assertEqual(result['exitCode'], -signal.SIGTERM if leader_exit is None else leader_exit, result)
                    self.assertTrue(result['supervision']['shutdown']['stopped'], result)
                    value = json.loads(marker.read_text())
                    self.assertIn(value['pid'], [item['pid'] for item in result['supervision']['shutdown']['killSent']])
                    self.assertFalse(Path('/proc', str(value['pid'])).exists(), 'Supervisor did not reap its adopted child')
                finally:
                    # A failed regression must not leak its synthetic child. A
                    # held pidfd plus creation ticks prevents signaling a reused PID.
                    if marker.exists():
                        value = json.loads(marker.read_text())
                        descriptor = None
                        try:
                            descriptor = os.pidfd_open(value['pid'])
                            fields = Path('/proc', str(value['pid']), 'stat').read_text().rsplit(') ', 1)[1].split()
                            if int(fields[19]) == value['ticks']:
                                signal.pidfd_send_signal(descriptor, signal.SIGKILL)
                                poll = select.poll()
                                poll.register(descriptor, select.POLLIN)
                                poll.poll(1000)
                        except (ProcessLookupError, FileNotFoundError):
                            pass
                        finally:
                            if descriptor is not None:
                                os.close(descriptor)

    def test_missing_and_symlinked_output_directories_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            automation.ensure_directory(root, 'artifacts/automation-runs')
            (root / 'link').symlink_to(root / 'artifacts', target_is_directory=True)
            with self.assertRaises(RuntimeError):
                automation.ensure_directory(root, 'link/nested')
            with self.assertRaises(RuntimeError):
                automation.ensure_directory(root, '../escape')


if __name__ == '__main__':
    unittest.main(verbosity=2)
