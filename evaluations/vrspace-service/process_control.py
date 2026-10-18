"""Linux process ownership and bounded shutdown helpers for this local evaluation."""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import tempfile

TERMINATE_TIMEOUT = 20
KILL_TIMEOUT = 5


def require_linux_process_api():
    if sys.platform != 'linux' or not Path('/proc/self/stat').is_file():
        raise RuntimeError('This evaluation requires Linux with mounted procfs')
    if Path('/proc/self/stat').read_text().split(' ', 1)[0] != str(os.getpid()):
        raise RuntimeError('This evaluation requires procfs in the current PID namespace')
    if not hasattr(os, 'pidfd_open') or not hasattr(signal, 'pidfd_send_signal'):
        raise RuntimeError('This evaluation requires Linux pidfd APIs in Python')


def verify_file(path, expected_bytes, expected_sha256, label):
    if type(expected_bytes) is not int or expected_bytes < 0:
        raise RuntimeError(label + ' has an invalid pinned length')
    if path.stat().st_size != expected_bytes:
        raise RuntimeError(label + ' length mismatch')
    with path.open('rb') as stream:
        actual = hashlib.file_digest(stream, 'sha256').hexdigest()
    if actual != expected_sha256:
        raise RuntimeError(label + ' SHA-256 mismatch')
    return actual


def write_json(path, value):
    """Replace task metadata atomically; never follow an existing destination symlink."""
    handle = tempfile.NamedTemporaryFile(prefix=path.name + '-', suffix='.tmp', dir=path.parent, mode='w', delete=False)
    temporary = Path(handle.name)
    try:
        with handle:
            json.dump(value, handle, indent=2)
            handle.write('\n')
        temporary.replace(path)
    finally:
        if temporary.exists(): temporary.unlink()


def process_start_ticks(pid):
    # Field 22; comm can contain spaces or ')'.
    stat = (Path('/proc') / str(pid) / 'stat').read_text()
    return int(stat.rsplit(') ', 1)[1].split()[19])


def read_record(root):
    require_linux_process_api()
    record = json.loads((root / 'artifacts/current-server.json').read_text())
    if not isinstance(record, dict): raise RuntimeError('Invalid server ownership record')
    if type(record.get('pid')) is not int or record['pid'] <= 1:
        raise RuntimeError('Invalid owned process ID')
    if type(record.get('processStartTicks')) is not int or record['processStartTicks'] <= 0:
        raise RuntimeError('Missing or invalid process creation identity')
    directory = Path(record.get('runDirectory', '')).resolve(strict=True)
    artifacts = (root / 'artifacts').resolve(strict=True)
    if directory.parent != artifacts or not directory.name.startswith('server-') or not directory.is_dir():
        raise RuntimeError('Recorded run directory is outside this evaluation')
    config = (directory / 'application.properties').resolve(strict=True)
    if config.parent != directory or not config.is_file():
        raise RuntimeError('Recorded configuration is not inside the owned run')
    return record, directory, config


def exited(pidfd, timeout=0):
    poller = select.poll()
    poller.register(pidfd, select.POLLIN)
    return bool(poller.poll(max(0, int(timeout * 1000))))


@contextmanager
def recorded_process(root):
    """Pin a kernel process handle, then verify creation identity and exact arguments."""
    record, directory, config = read_record(root)
    pidfd = os.pidfd_open(record['pid'])
    try:
        if exited(pidfd): raise ProcessLookupError('Recorded process has already exited')
        proc = Path('/proc') / str(record['pid'])
        args = proc.joinpath('cmdline').read_bytes().split(b'\0')
        expected_config = ('--spring.config.location=' + config.as_uri()).encode()
        expected_jar = str(root / 'downloads/server-0.8.7-executable.jar').encode()
        has_jar = any(args[i] == b'-jar' and args[i+1] == expected_jar for i in range(len(args)-1))
        if not has_jar or expected_config not in args:
            raise RuntimeError('Process arguments do not match this task-owned JVM')
        if process_start_ticks(record['pid']) != record['processStartTicks']:
            raise RuntimeError('Process creation identity does not match the ownership record')
        if exited(pidfd): raise ProcessLookupError('Recorded process exited during ownership verification')
        yield record, directory, proc, pidfd
    except FileNotFoundError as error:
        # Metadata/config lookups above precede this try. Only a kernel-confirmed
        # exited process may turn a disappearing procfs read into "already exited".
        if exited(pidfd):
            raise ProcessLookupError('Recorded process exited during observation') from error
        raise
    finally:
        os.close(pidfd)


def stop_recorded(root, terminate_timeout=TERMINATE_TIMEOUT, kill_timeout=KILL_TIMEOUT):
    try:
        with recorded_process(root) as (record, _directory, _proc, pidfd):
            result = {'pid': record['pid'], 'terminateSent': True, 'killSent': False}
            signal.pidfd_send_signal(pidfd, signal.SIGTERM)
            if not exited(pidfd, terminate_timeout):
                result['killSent'] = True
                signal.pidfd_send_signal(pidfd, signal.SIGKILL)
                if not exited(pidfd, kill_timeout):
                    raise RuntimeError('Owned JVM did not exit within terminate/kill deadlines')
            result['stopped'] = True
            return result
    except ProcessLookupError:
        return {'stopped': True, 'alreadyExited': True}


def ensure_loopback_sockets(sockets):
    allowed = {'127.0.0.1', '::1'}
    listeners = [item for item in sockets if item['state'] == '0A']
    if not listeners or any(item['local']['host'] not in allowed for item in listeners):
        raise RuntimeError('JVM listener is not loopback-only')
    established = [item for item in sockets if item['state'] == '01']
    if any(item['remote']['host'] not in allowed for item in established):
        raise RuntimeError('An established JVM connection is not loopback-only')


def terminate_child(proc, outcome, terminate_timeout=TERMINATE_TIMEOUT, kill_timeout=KILL_TIMEOUT):
    """Only signal the Popen-owned child; both waits have deadlines."""
    outcome.update({'terminateSent': False, 'killSent': False})
    if proc.poll() is None:
        outcome['terminateSent'] = True
        proc.terminate()
        try:
            proc.wait(timeout=terminate_timeout)
        except subprocess.TimeoutExpired:
            outcome['killSent'] = True
            proc.kill()
            try:
                proc.wait(timeout=kill_timeout)
            except subprocess.TimeoutExpired as error:
                raise RuntimeError('Owned child did not exit within terminate/kill deadlines') from error
    outcome['childExitCode'] = proc.returncode


@contextmanager
def owned_child(command, *, outcome, terminate_timeout=TERMINATE_TIMEOUT, kill_timeout=KILL_TIMEOUT, **options):
    # Ownership cleanup starts immediately after Popen, before metadata or logging.
    proc = subprocess.Popen(command, **options)
    try:
        yield proc
    finally:
        terminate_child(proc, outcome, terminate_timeout, kill_timeout)
