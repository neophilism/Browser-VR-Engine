"""Synthetic failure/ownership probes, separate from real VRSpace qualification.

Run with python3 -O test/launcher-checks.py. All tested Python entry points also
run with -O. A tiny fake Java executable exercises child lifecycle only; it does
not speak the VRSpace protocol and never substitutes for the real service run.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import traceback

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from environment import clean_environment
from process_control import process_start_ticks, require_linux_process_api


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def wait_until(predicate, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(.025)
    raise TimeoutError('Synthetic lifecycle condition did not become true')


def stop_owned(proc):
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=1)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=3)


def main():
    require_linux_process_api()
    require(sys.flags.optimize > 0, 'Run this verification with python3 -O')
    (ROOT / 'artifacts').mkdir(exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix='launcher-checks-', dir=ROOT / 'artifacts'))
    cases = []
    started = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

    def record(name, action):
        at = time.monotonic()
        try:
            detail = action()
            cases.append({'id': name, 'status': 'passed', 'elapsedSeconds': round(time.monotonic() - at, 3), 'detail': detail})
            print('PASS ' + name, flush=True)
        except Exception as error:
            cases.append({'id': name, 'status': 'failed', 'elapsedSeconds': round(time.monotonic() - at, 3), 'error': str(error), 'traceback': traceback.format_exc()})
            print('FAIL ' + name + ': ' + str(error), flush=True)

    def fixture(name):
        target = output / name
        target.mkdir()
        for filename in ['environment.py', 'process_control.py', 'run-clean.py', 'server-run.py', 'setup.py', 'observe-server.py', 'stop-server.py', 'server.properties']:
            shutil.copyfile(ROOT / filename, target / filename)
        (target / 'downloads').mkdir()
        (target / 'vendor/vrspace').mkdir(parents=True)
        (target / 'bin').mkdir()
        jar = b'SYNTHETIC LIFECYCLE FIXTURE, NOT A JAVA ARCHIVE\n'
        client = b'// Synthetic setup-integrity fixture.\n'
        (target / 'downloads/server-0.8.7-executable.jar').write_bytes(jar)
        (target / 'vendor/vrspace/client.js').write_bytes(client)
        pins = json.loads((ROOT / 'source-pins.json').read_text())
        pins['release'] = 'synthetic-lifecycle-fixture-not-vrspace'
        pins['jar'].update({'bytes': len(jar), 'digest': 'sha256:' + hashlib.sha256(jar).hexdigest()})
        pins['client'].update({'bytes': len(client), 'sha256': hashlib.sha256(client).hexdigest()})
        pins['profile']['sha256'] = hashlib.sha256((target / 'server.properties').read_bytes()).hexdigest()
        (target / 'source-pins.json').write_text(json.dumps(pins))
        fake = target / 'bin/java'
        fake.write_text('#!' + sys.executable + '\n' + '''import os, signal, sys, time
from pathlib import Path
if '-version' in sys.argv:
    print('openjdk version "17.0.0" synthetic-lifecycle-probe', file=sys.stderr)
    raise SystemExit(0)
signal.signal(signal.SIGTERM, signal.SIG_IGN)
Path('synthetic-child-ready.json').write_text(str(os.getpid()))
while True: time.sleep(.1)
''')
        fake.chmod(0o700)
        environment = clean_environment()
        environment['PATH'] = str(target / 'bin') + os.pathsep + environment['PATH']
        return target, environment

    def rejected_entry(script, mutate, expected):
        target, environment = fixture(script.removesuffix('.py') + '-' + str(len(cases)))
        mutate(target)
        result = subprocess.run([sys.executable, '-O', str(target / script)], cwd=target, env=environment, capture_output=True, text=True, timeout=10)
        require(result.returncode != 0, script + ' accepted a corrupted fixture under -O')
        require(expected in result.stderr, 'Unexpected rejection: ' + result.stderr[-1200:])
        require(not list((target / 'artifacts').glob('server-*')), 'Integrity failure launched a child')
        return {'entryPoint': script, 'pythonOptimized': True, 'exitCode': result.returncode, 'expectedRejection': expected, 'serverRunCreated': False}

    jar_relative = 'downloads/server-0.8.7-executable.jar'
    def rejects_namespace_mismatch():
        code = 'import process_control; process_control.os.getpid=lambda:-1; process_control.require_linux_process_api()'
        result = subprocess.run([sys.executable, '-O', '-c', code], cwd=ROOT, env=clean_environment(), capture_output=True, text=True, timeout=5)
        require(result.returncode != 0 and 'current PID namespace' in result.stderr, 'Optimized process controls accepted mismatched procfs identity')
        return {'pythonOptimized': True, 'syntheticSelfPidMismatchRejected': True, 'namespaceControlsChanged': False, 'processSignaled': False}
    record('optimized-process-controls-reject-mismatched-procfs-namespace', rejects_namespace_mismatch)
    record('optimized-launch-rejects-wrong-jar-length', lambda: rejected_entry('server-run.py', lambda p: (p / jar_relative).write_bytes(b'short'), 'length mismatch'))
    record('optimized-launch-rejects-wrong-jar-digest', lambda: rejected_entry('server-run.py', lambda p: (p / jar_relative).write_bytes(b'X' * (p / jar_relative).stat().st_size), 'SHA-256 mismatch'))
    record('optimized-launch-rejects-profile-change', lambda: rejected_entry('server-run.py', lambda p: (p / 'server.properties').write_text((p / 'server.properties').read_text() + 'server.address=0.0.0.0\n'), 'Sterile profile changed'))
    record('optimized-setup-rejects-wrong-jar', lambda: rejected_entry('setup.py', lambda p: (p / jar_relative).write_bytes(b'X' * (p / jar_relative).stat().st_size), 'SHA-256 mismatch'))
    record('optimized-setup-rejects-wrong-client', lambda: rejected_entry('setup.py', lambda p: (p / 'vendor/vrspace/client.js').write_bytes(b'changed'), 'client SHA-256 mismatch'))

    sentinel = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(180)'], env=clean_environment(), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        def ownership_record(target, pid, ticks=None):
            directory = target / 'artifacts/server-synthetic'
            directory.mkdir(parents=True, exist_ok=True)
            config = directory / 'application.properties'
            config.write_text('synthetic=true\n')
            value = {'pid': pid, 'processStartTicks': ticks if ticks is not None else process_start_ticks(pid), 'runDirectory': str(directory)}
            (target / 'artifacts/current-server.json').write_text(json.dumps(value))
            return directory, config

        def rejects_unrelated_process():
            target, environment = fixture('unrelated-process')
            ownership_record(target, sentinel.pid)
            details = []
            for script in ['stop-server.py', 'observe-server.py']:
                result = subprocess.run([sys.executable, '-O', str(target / script)], cwd=target, env=environment, capture_output=True, text=True, timeout=8)
                require(result.returncode != 0 and 'Process arguments do not match' in result.stderr, script + ' did not reject an unrelated process')
                require(sentinel.poll() is None, 'Unrelated sentinel was terminated')
                details.append({'entryPoint': script, 'exitCode': result.returncode})
            return {'pythonOptimized': True, 'unrelatedProcessSurvived': True, 'rejections': details}
        record('optimized-stop-and-observe-reject-unrelated-process', rejects_unrelated_process)

        def rejects_malformed_record():
            target, environment = fixture('malformed-ownership-record')
            ownership_record(target, sentinel.pid)
            path = target / 'artifacts/current-server.json'
            value = json.loads(path.read_text())
            value['runDirectory'] = '/proc/bve-synthetic-missing-run-directory'
            path.write_text(json.dumps(value))
            for script in ['stop-server.py', 'observe-server.py']:
                result = subprocess.run([sys.executable, '-O', str(target / script)], cwd=target, env=environment, capture_output=True, text=True, timeout=8)
                require(result.returncode != 0 and 'FileNotFoundError' in result.stderr, script + ' treated malformed metadata as a stopped process')
                require(sentinel.poll() is None, 'Malformed record signaled an unrelated process')
            return {'pythonOptimized': True, 'missingProcPrefixedRunDirectoryRejected': True, 'alreadyExitedNotClaimed': True, 'unrelatedProcessSurvived': True}
        record('optimized-stop-and-observe-reject-malformed-proc-path-record', rejects_malformed_record)

        def start_matching_child(target, environment):
            directory, config = ownership_record(target, sentinel.pid)
            child = subprocess.Popen([str(target / 'bin/java'), '-jar', str(target / jar_relative), '--spring.config.location=' + config.as_uri()], cwd=directory, env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                wait_until(lambda: (directory / 'synthetic-child-ready.json').exists())
                ownership_record(target, child.pid)
                return child
            except BaseException:
                stop_owned(child)
                raise

        def rejects_stale_creation_identity():
            target, environment = fixture('stale-creation-identity')
            child = start_matching_child(target, environment)
            try:
                ownership_record(target, child.pid, process_start_ticks(child.pid) + 1)
                for script in ['stop-server.py', 'observe-server.py']:
                    result = subprocess.run([sys.executable, '-O', str(target / script)], cwd=target, env=environment, capture_output=True, text=True, timeout=8)
                    require(result.returncode != 0 and 'creation identity does not match' in result.stderr, script + ' accepted stale creation identity')
                    require(child.poll() is None and sentinel.poll() is None, 'Identity rejection signaled a process')
                return {'pythonOptimized': True, 'matchingArgumentsButWrongStartTicksRejected': True, 'childAndUnrelatedSentinelSurvived': True}
            finally:
                stop_owned(child)
        record('optimized-stop-and-observe-reject-stale-creation-identity', rejects_stale_creation_identity)

        def bounded_external_stop():
            target, environment = fixture('bounded-recorded-stop')
            child = start_matching_child(target, environment)
            try:
                code = 'import json; from pathlib import Path; from process_control import stop_recorded; print(json.dumps(stop_recorded(Path.cwd(), .2, 1)))'
                result = subprocess.run([sys.executable, '-O', '-c', code], cwd=target, env=environment, capture_output=True, text=True, timeout=5)
                require(result.returncode == 0, result.stderr)
                stopped = json.loads(result.stdout)
                require(stopped['stopped'] and stopped['killSent'], 'Ignored SIGTERM did not reach bounded kill')
                require(child.wait(timeout=2) == -signal.SIGKILL, 'Wrong owned child termination result')
                require(sentinel.poll() is None, 'Unrelated sentinel was terminated')
                return {'pythonOptimized': True, 'syntheticChildIgnoresSigterm': True, 'probeTimeoutsSeconds': {'terminate': .2, 'kill': 1}, 'result': stopped, 'unrelatedProcessSurvived': True}
            finally:
                stop_owned(child)
        record('optimized-pidfd-stop-kills-only-verified-hung-child', bounded_external_stop)

        def loopback_checks():
            local = {'state': '0A', 'local': {'host': '127.0.0.1'}, 'remote': {'host': '0.0.0.0'}}
            bad_sets = [[], [{'state': '0A', 'local': {'host': '0.0.0.0'}, 'remote': {'host': '0.0.0.0'}}], [local, {'state': '01', 'local': {'host': '127.0.0.1'}, 'remote': {'host': '192.0.2.1'}}]]
            code = 'import json,sys; from process_control import ensure_loopback_sockets; ensure_loopback_sockets(json.loads(sys.argv[1]))'
            for snapshot in bad_sets:
                result = subprocess.run([sys.executable, '-O', '-c', code, json.dumps(snapshot)], cwd=ROOT, env=clean_environment(), capture_output=True, text=True, timeout=5)
                require(result.returncode != 0 and 'loopback-only' in result.stderr, 'Optimized observer accepted an invalid socket snapshot')
            good = subprocess.run([sys.executable, '-O', '-c', code, json.dumps([local])], cwd=ROOT, env=clean_environment(), capture_output=True, text=True, timeout=5)
            require(good.returncode == 0, good.stderr)
            return {'pythonOptimized': True, 'invalidSyntheticSnapshotsRejected': 3, 'validSyntheticSnapshotAccepted': True, 'nonLoopbackSocketOpened': False}
        record('optimized-observer-rejects-nonloopback-and-missing-listeners', loopback_checks)

        def parent_signal_cleanup():
            target, environment = fixture('parent-sigterm')
            launcher = subprocess.Popen([sys.executable, '-O', str(target / 'run-clean.py'), sys.executable, '-O', str(target / 'server-run.py')], cwd=target, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            child_pid = None
            try:
                wait_until(lambda: (target / 'artifacts/current-server.json').is_file())
                state = json.loads((target / 'artifacts/current-server.json').read_text())
                child_pid = state['pid']
                directory = Path(state['runDirectory'])
                wait_until(lambda: (directory / 'synthetic-child-ready.json').exists())
                at = time.monotonic()
                launcher.send_signal(signal.SIGTERM)
                # A second signal must not interrupt the cleanup ownership context.
                time.sleep(.15)
                launcher.send_signal(signal.SIGTERM)
                stdout, stderr = launcher.communicate(timeout=28)
                elapsed = time.monotonic() - at
                run = json.loads((directory / 'run.json').read_text())
                require(launcher.returncode == 143, 'Launcher SIGTERM result was not 143: ' + stderr)
                require(run['shutdown']['killSent'] and run['shutdown']['requestedSignal'] == signal.SIGTERM, 'Parent signal did not run bounded cleanup')
                require(run['exitCode'] == -signal.SIGKILL, 'Ignored child SIGTERM was not escalated to kill')
                require(19.5 <= elapsed < 28, 'Production terminate deadline was not exercised')
                require(not Path('/proc/' + str(child_pid)).exists(), 'Owned child was not reaped')
                require(sentinel.poll() is None, 'Unrelated sentinel was terminated')
                return {'pythonOptimized': True, 'entryPath': 'run-clean.py execs server-run.py without an extra wrapper process', 'syntheticChildIgnoresSigterm': True, 'launcherSignals': ['SIGTERM', 'SIGTERM'], 'launcherExitCode': launcher.returncode, 'shutdown': run['shutdown'], 'elapsedSeconds': round(elapsed, 3), 'childReaped': True, 'unrelatedProcessSurvived': True}
            finally:
                stop_owned(launcher)
                # Do not use a recorded bare PID for fallback cleanup. A verified
                # pidfd helper owns any still-running synthetic child.
                if child_pid and Path('/proc/' + str(child_pid)).exists():
                    code = 'from pathlib import Path; from process_control import stop_recorded; stop_recorded(Path.cwd(), .1, 1)'
                    subprocess.run([sys.executable, '-O', '-c', code], cwd=target, env=environment, capture_output=True, timeout=3)
        record('optimized-parent-sigterm-bounded-kill-and-reap', parent_signal_cleanup)

        def metadata_failure_cleanup():
            target, environment = fixture('metadata-write-failure')
            (target / 'artifacts/current-server.json').mkdir(parents=True)
            result = subprocess.run([sys.executable, '-O', str(target / 'server-run.py')], cwd=target, env=environment, capture_output=True, text=True, timeout=28)
            require(result.returncode != 0 and 'IsADirectoryError' in result.stderr, 'Synthetic metadata failure did not occur')
            runs = list((target / 'artifacts').glob('server-*/run.json'))
            require(len(runs) == 1, 'Expected owned-child metadata was not recorded')
            run = json.loads(runs[0].read_text())
            require('pid' in run and 'shutdown' in run and run['exitCode'] is not None, 'Metadata failure skipped child cleanup')
            require(not Path('/proc/' + str(run['pid'])).exists(), 'Metadata failure orphaned the child')
            require(sentinel.poll() is None, 'Metadata failure affected an unrelated process')
            return {'pythonOptimized': True, 'failureAfterPopen': run['failure'], 'shutdown': run['shutdown'], 'childReaped': True, 'unrelatedProcessSurvived': True}
        record('optimized-post-popen-metadata-failure-cleans-owned-child', metadata_failure_cleanup)
    finally:
        stop_owned(sentinel)

    def frontend_lifecycle():
        result = subprocess.run(['node', str(ROOT / 'test/frontend-checks.mjs')], cwd=ROOT, env=clean_environment(), capture_output=True, text=True, timeout=30)
        require(result.returncode == 0, result.stderr + result.stdout)
        detail = json.loads(result.stdout)
        require(detail['counts'] == {'passed': 2, 'failed': 0, 'checks': 2}, 'Frontend lifecycle checks were incomplete')
        return detail
    record('frontend-failure-paths-close-all-owned-loopback-listeners', frontend_lifecycle)

    source_files = json.loads((ROOT / 'source-files.json').read_text())
    digests = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in source_files}
    report = {'scope': 'Synthetic optimized-mode integrity, ownership and cleanup regression probes; no VRSpace service, headset or capacity qualification', 'startedAt': started, 'finishedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'python': sys.version.split()[0], 'pythonOptimized': True, 'platform': sys.platform, 'counts': {'passed': sum(c['status'] == 'passed' for c in cases), 'failed': sum(c['status'] == 'failed' for c in cases), 'checks': len(cases)}, 'cases': cases, 'sourceDigests': digests}
    (output / 'launcher-checks.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'counts': report['counts'], 'report': str((output / 'launcher-checks.json').relative_to(ROOT))}))
    return 1 if report['counts']['failed'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
