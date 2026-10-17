"""Internal Linux stage owner. Reap adopted descendants, including detached sessions."""
import argparse
import ctypes
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import time


def now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def enable_child_adoption():
    if not sys.platform.startswith('linux') or not hasattr(os, 'pidfd_open') or not hasattr(signal, 'pidfd_send_signal'):
        raise RuntimeError('Stage supervision requires Linux procfs and pidfds')
    if Path('/proc/self/stat').read_text().split(' ', 1)[0] != str(os.getpid()):
        raise RuntimeError('Stage supervision requires procfs mounted in the current PID namespace')
    # PR_SET_CHILD_SUBREAPER makes orphaned grandchildren return to this dedicated
    # supervisor rather than PID 1, even when they have created another session.
    libc = ctypes.CDLL(None, use_errno=True)
    libc.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong]
    libc.prctl.restype = ctypes.c_int
    if libc.prctl(36, 1, 0, 0, 0) != 0:
        number = ctypes.get_errno()
        raise OSError(number, os.strerror(number))
    try:
        children_path().read_text()
    except FileNotFoundError as error:
        raise RuntimeError('Stage supervision requires the Linux procfs task children interface') from error


def children_path():
    return Path('/proc') / str(os.getpid()) / 'task' / str(os.getpid()) / 'children'


def identity(pid):
    # The command name may contain spaces or parentheses. Fields after its final
    # closing parenthesis begin with state, parent PID, and eventually start ticks.
    fields = (Path('/proc') / str(pid) / 'stat').read_text().rsplit(') ', 1)[1].split()
    return {'pid': pid, 'parent': int(fields[1]), 'startTicks': int(fields[19])}


def cleanup_descendants(primary, terminate_timeout, kill_timeout):
    started = time.monotonic()
    term_deadline = started + terminate_timeout
    deadline = term_deadline + kill_timeout
    sent = {signal.SIGTERM: set(), signal.SIGKILL: set()}
    result = {'needed': False, 'terminateSent': [], 'killSent': [], 'stopped': False}
    while True:
        if primary is not None:
            primary.poll()  # Preserve the actual main-command return code.
        children = [int(value) for value in children_path().read_text().split()]
        if not children:
            result['stopped'] = True
            return result
        for pid in children:
            descriptor = None
            try:
                before = identity(pid)
                descriptor = os.pidfd_open(pid)
                current = identity(pid)
                if before != current or current['parent'] != os.getpid():
                    continue
                poll = select.poll()
                poll.register(descriptor, select.POLLIN)
                if poll.poll(0):
                    if primary is not None and pid == primary.pid:
                        primary.poll()
                    else:
                        os.waitpid(pid, os.WNOHANG)
                    continue
                result['needed'] = True
                number = signal.SIGTERM if time.monotonic() < term_deadline else signal.SIGKILL
                key = (pid, current['startTicks'])
                if key not in sent[number]:
                    signal.pidfd_send_signal(descriptor, number)
                    sent[number].add(key)
                    result['terminateSent' if number == signal.SIGTERM else 'killSent'].append(
                        {'pid': pid, 'processStartTicks': current['startTicks']})
            except (ProcessLookupError, FileNotFoundError, ChildProcessError):
                pass
            finally:
                if descriptor is not None:
                    os.close(descriptor)
        if time.monotonic() >= deadline:
            # Re-scan once after the final signals to distinguish reaped children
            # from an incomplete shutdown. No unrelated PID or process group is signaled.
            if primary is not None:
                primary.poll()
            for value in children_path().read_text().split():
                pid = int(value)
                if primary is None or pid != primary.pid:
                    try:
                        os.waitpid(pid, os.WNOHANG)
                    except ChildProcessError:
                        pass
            result['stopped'] = not children_path().read_text().split()
            return result
        time.sleep(.025)


def supervise(argv, report_fd, terminate_timeout, kill_timeout):
    stopped = {'signal': None}

    def request_stop(number, _frame):
        if stopped['signal'] is None:
            stopped['signal'] = number

    for number in (signal.SIGTERM, signal.SIGINT):
        signal.signal(number, request_stop)
    record = {'schemaVersion': 1, 'argv': argv, 'supervisorPid': os.getpid(), 'startedAt': now(),
              'outcome': 'failed', 'exitCode': None, 'requestedSignal': None}
    primary = None
    enabled = False
    try:
        enable_child_adoption()
        enabled = True
        if stopped['signal'] is not None:
            raise RuntimeError('Stage interrupted before command start')
        primary = subprocess.Popen(argv, stdin=subprocess.DEVNULL, start_new_session=True, close_fds=True)
        record['commandPid'] = primary.pid
        while primary.poll() is None and stopped['signal'] is None:
            time.sleep(.025)
    except BaseException as error:
        record['error'] = type(error).__name__ + ': ' + str(error)
    finally:
        try:
            record['shutdown'] = (cleanup_descendants(primary, terminate_timeout, kill_timeout) if enabled
                                  else {'needed': False, 'terminateSent': [], 'killSent': [], 'stopped': True})
        except BaseException as error:
            record['shutdown'] = {'stopped': False, 'error': type(error).__name__ + ': ' + str(error)}
        record['exitCode'] = primary.poll() if primary is not None else None
        record['requestedSignal'] = stopped['signal']
        shutdown = record['shutdown']
        if (record['exitCode'] == 0 and stopped['signal'] is None and 'error' not in record
                and shutdown.get('stopped') is True and shutdown.get('needed') is False):
            record['outcome'] = 'passed'
        record['finishedAt'] = now()
        with os.fdopen(report_fd, 'w', encoding='utf8') as stream:
            json.dump(record, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
    return 0 if record['outcome'] == 'passed' else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report-fd', type=int, required=True)
    parser.add_argument('--term-seconds', type=float, default=5)
    parser.add_argument('--kill-seconds', type=float, default=5)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command or not 0 < args.term_seconds <= 30 or not 0 < args.kill_seconds <= 10:
        parser.error('A command and bounded positive shutdown deadlines are required')
    raise SystemExit(supervise(command, args.report_fd, args.term_seconds, args.kill_seconds))
