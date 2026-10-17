"""Run only the verified release, with immediate and bounded child ownership."""
import hashlib
import json
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
from environment import clean_environment
from process_control import owned_child, process_start_ticks, require_linux_process_api, verify_file, write_json

ROOT = Path(__file__).resolve().parent


def main():
    require_linux_process_api()
    stop = {'signal': None}
    def request_stop(number, _frame):
        # Flag only: repeated signals cannot interrupt bounded cleanup waits.
        if stop['signal'] is None: stop['signal'] = number
    previous = {number: signal.signal(number, request_stop) for number in [signal.SIGINT, signal.SIGTERM]}
    try:
        return run_server(stop)
    finally:
        for number, handler in previous.items(): signal.signal(number, handler)


def run_server(stop):
    root = ROOT
    pins = json.loads((root / 'source-pins.json').read_text())
    jar = root / 'downloads/server-0.8.7-executable.jar'
    digest = pins['jar']['digest']
    if not isinstance(digest, str) or not digest.startswith('sha256:'):
        raise RuntimeError('Invalid pinned release digest')
    verify_file(jar, pins['jar']['bytes'], digest.removeprefix('sha256:'), 'Official release')
    profile_bytes = (root / 'server.properties').read_bytes()
    if hashlib.sha256(profile_bytes).hexdigest() != pins['profile']['sha256']:
        raise RuntimeError('Sterile profile changed; review and repin it deliberately before execution')
    configuration = profile_bytes.decode('utf8')
    runtime = subprocess.run(['java', '-version'], capture_output=True, text=True, env=clean_environment(), check=True, timeout=10)
    java_version = (runtime.stdout + runtime.stderr).strip()
    if 'version "17.' not in java_version:
        raise RuntimeError('This release evaluation is pinned to Java 17')
    if stop['signal'] is not None: return 128 + stop['signal']
    (root / 'artifacts').mkdir(parents=True, exist_ok=True)
    (root / 'content' / 'rpm-anim').mkdir(parents=True, exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix='server-', dir=root / 'artifacts'))
    (run / 'db').mkdir()
    configuration += 'org.vrspace.db=' + (run / 'db').as_uri() + '\n'
    (run / 'application.properties').write_text(configuration)
    command = ['java', '-Xms128m', '-Xmx768m', '-XX:MaxDirectMemorySize=256m', '-XX:MaxMetaspaceSize=256m', '-XX:ActiveProcessorCount=2', '-Djava.net.preferIPv4Stack=true', '-Ddbms.pagecache.memory.default.override=128m', '-Dslf4j.provider=ch.qos.logback.classic.spi.LogbackServiceProvider']
    for module in ['java.lang', 'java.nio', 'java.io', 'java.util', 'java.util.concurrent', 'sun.net.www.protocol.http', 'sun.nio.ch']:
        command += ['--add-opens', 'java.base/' + module + '=ALL-UNNAMED']
    command += ['-jar', str(jar), '--spring.config.location=' + (run / 'application.properties').as_uri()]
    metadata = {'release': pins, 'command': command, 'config': configuration, 'javaVersion': java_version, 'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'runDirectory': str(run)}
    outcome = {}
    proc = None
    try:
        with (run / 'server.log').open('w') as log:
            with owned_child(command, outcome=outcome, cwd=run, stdout=log, stderr=subprocess.STDOUT, env=clean_environment(), start_new_session=True) as child:
                proc = child
                record = {'pid': proc.pid, 'processStartTicks': process_start_ticks(proc.pid), 'runDirectory': str(run)}
                metadata.update(record)
                write_json(run / 'run.json', metadata)
                write_json(root / 'artifacts/current-server.json', record)
                print(json.dumps({**record, 'status': 'starting'}), flush=True)
                while stop['signal'] is None:
                    try:
                        proc.wait(timeout=.25)
                        break
                    except subprocess.TimeoutExpired:
                        continue
    except BaseException as error:
        metadata['failure'] = {'type': type(error).__name__, 'message': str(error)}
        raise
    finally:
        # The ownership context has completed terminate/kill/wait before final writes.
        if proc is not None:
            metadata['stoppedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            metadata['exitCode'] = proc.returncode
            metadata['shutdown'] = {**outcome, 'requestedSignal': stop['signal']}
            pending_error = sys.exc_info()[0] is not None
            try:
                write_json(run / 'run.json', metadata)
            except Exception as metadata_error:
                if not pending_error: raise
                print('Final metadata write also failed: ' + str(metadata_error), file=sys.stderr)
    print(json.dumps({'runDirectory': str(run), 'exitCode': proc.returncode, 'shutdown': outcome}), flush=True)
    return 128 + stop['signal'] if stop['signal'] is not None else proc.returncode


if __name__ == '__main__':
    raise SystemExit(main())
