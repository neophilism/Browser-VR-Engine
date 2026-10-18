"""Stop only this run's recorded controller and verified stage-owner processes."""
import os
from pathlib import Path
import select
import signal
import time
from config import require


def process_identity(pid):
    # comm is an arbitrary byte name in parentheses; only the numeric tail is
    # relevant. Do not decode an unrelated process name as UTF-8.
    fields = (Path('/proc') / str(pid) / 'stat').read_bytes().rsplit(b') ', 1)[1].split()
    return {'pid': pid, 'startTicks': int(fields[19])}


def process_argv(pid):
    # POSIX argv is bytes, not guaranteed UTF-8. Preserve every byte losslessly
    # so an unrelated non-UTF8 argument cannot abort the owned-path scan.
    return (Path('/proc') / str(pid) / 'cmdline').read_bytes().rstrip(b'\0').decode('utf-8', 'surrogateescape').split('\0')


def require_process_api():
    require(Path('/proc/self/stat').read_bytes().split(b' ', 1)[0] == str(os.getpid()).encode('ascii')
            and hasattr(os, 'pidfd_open') and hasattr(signal, 'pidfd_send_signal'),
            'Watchdog requires same-namespace Linux procfs and pidfds')


def _opened(record):
    require(type(record.get('pid')) is int and record['pid'] > 1 and record['pid'] != os.getpid()
            and type(record.get('startTicks')) is int and record['startTicks'] > 0
            and isinstance(record.get('argv'), list) and all(isinstance(item, str) for item in record['argv']),
            'Malformed watchdog process identity')
    try:
        fd = os.pidfd_open(record['pid'])
    except ProcessLookupError:
        return None
    try:
        poll = select.poll()
        poll.register(fd, select.POLLIN)
        if poll.poll(0):
            os.close(fd)
            return None
        current = process_identity(record['pid'])
        require(current == {key: record[key] for key in ('pid', 'startTicks')}
                and process_argv(record['pid']) == record['argv'], 'Watchdog process identity changed; refusing to signal it')
        return fd, poll
    except FileNotFoundError:
        # A missing proc file means exit only when the held pidfd confirms it.
        if poll.poll(0):
            os.close(fd)
            return None
        os.close(fd)
        raise
    except BaseException:
        os.close(fd)
        raise


def stop_records(records, grace=35, kill_grace=5):
    require_process_api()
    require(len(records) <= 32 and 0 < grace <= 35 and 0 < kill_grace <= 5, 'Unbounded watchdog scope')
    held, results = [], []
    try:
        for record in records:
            item = {'pid': record['pid'], 'startTicks': record['startTicks'], 'alreadyExited': False,
                    'terminateSent': False, 'killSent': False, 'stopped': False}
            results.append(item)
            try:
                opened = _opened(record)
                if opened is None:
                    item.update(alreadyExited=True, stopped=True)
                else:
                    fd, poll = opened
                    held.append((fd, poll, item))
                    try:
                        signal.pidfd_send_signal(fd, signal.SIGTERM)
                        item['terminateSent'] = True
                    except ProcessLookupError:
                        require(bool(poll.poll(0)), 'Owned process vanished without a confirmed exit')
            except (OSError, RuntimeError) as error:
                # A refusal must not skip bounded cleanup of other verified
                # owners. Its explicit failure still prevents a clean outcome.
                item['error'] = str(error)
        deadline = time.monotonic() + grace
        while held and time.monotonic() < deadline:
            for _fd, poll, item in held:
                item['stopped'] = bool(poll.poll(0))
            if all(item['stopped'] for _fd, _poll, item in held):
                break
            time.sleep(.025)
        for fd, poll, item in held:
            item['stopped'] = bool(poll.poll(0))
            if not item['stopped']:
                try:
                    signal.pidfd_send_signal(fd, signal.SIGKILL)
                    item['killSent'] = True
                except ProcessLookupError:
                    require(bool(poll.poll(0)), 'Owned process vanished without a confirmed exit')
        deadline = time.monotonic() + kill_grace
        while held and time.monotonic() < deadline:
            for _fd, poll, item in held:
                item['stopped'] = bool(poll.poll(0))
            if all(item['stopped'] for _fd, _poll, item in held):
                break
            time.sleep(.025)
        return results
    finally:
        for fd, _poll, _item in held:
            os.close(fd)


def owned_supervisors(paths):
    """Only the unique, verified per-run supervisor paths confer ownership."""
    require_process_api()
    paths = {str(Path(path).resolve()) for path in paths}
    result = []
    for path in Path('/proc').iterdir():
        if not path.name.isdigit() or int(path.name) in (1, os.getpid()):
            continue
        pid = int(path.name)
        try:
            before = process_identity(pid)
            argv = process_argv(pid)
            if len(argv) < 12 or argv[1:3] != ['-B', '-O'] or argv[3] not in paths:
                continue
            require(argv[4] == '--report-fd' and argv[6] == '--term-seconds'
                    and argv[8] == '--kill-seconds' and argv[10] == '--', 'Unexpected owned supervisor command')
            require(before == process_identity(pid), 'Owned supervisor changed during observation')
            result.append({**before, 'argv': argv})
            require(len(result) <= 32, 'Too many owned stage supervisors')
        except (FileNotFoundError, ProcessLookupError):
            continue
        except PermissionError:
            # Unrelated OS/container processes may be unreadable. Every owned
            # stage owner runs as the same user and uses a readable Python argv.
            continue
    return result
