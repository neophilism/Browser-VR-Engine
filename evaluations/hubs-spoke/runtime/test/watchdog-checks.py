"""Actual Linux process probes for the hosted watchdog; never skipped or mocked."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import pins, require
from run import load_shared, now, runtime_sources
from watchdog import _opened, owned_supervisors, process_argv, process_identity, require_process_api, stop_records

CASES = ('verified-pidfd-stop-refuses-unrelated-and-stale-identities',
         'orphaned-stage-owner-drains-and-reaps-term-ignoring-descendant')
ENV = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
       'PYTHONDONTWRITEBYTECODE': '1'}


def wait_for(condition, seconds=10):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        value = condition()
        if value:
            return value
        time.sleep(.025)
    raise RuntimeError('Bounded watchdog regression observation timed out')


def identity(pid):
    return {**process_identity(pid), 'argv': process_argv(pid)}


def verified_process():
    proc = subprocess.Popen([sys.executable, '-B', '-c', 'import time; time.sleep(60)'], env=ENV)
    try:
        original = identity(proc.pid)
        for changed in ({**original, 'startTicks': original['startTicks'] + 1},
                        {**original, 'argv': [*original['argv'], 'synthetic-wrong-owner']}):
            refused = stop_records([changed], grace=.2, kill_grace=.2)
            require(len(refused) == 1 and refused[0].get('error') and refused[0]['stopped'] is False
                    and not refused[0]['terminateSent'] and not refused[0]['killSent'] and proc.poll() is None,
                    'Watchdog signaled an unrelated or stale process identity')
        stopped = stop_records([original], grace=1, kill_grace=1)
        require(stopped[0]['stopped'] and stopped[0]['terminateSent'] and not stopped[0]['killSent'],
                'Verified child did not stop cleanly')
        require(proc.wait(timeout=2) == -signal.SIGTERM, 'Observed child exit differs')
    finally:
        if proc.poll() is None:
            proc.kill()
        proc.wait(timeout=2)
    # A forced kill is surfaced explicitly; the hosted cleanup rejects it as a
    # clean outcome even though the owned process is proven stopped afterward.
    with tempfile.TemporaryDirectory(prefix='f04-watchdog-kill-') as temporary:
        ready = Path(temporary) / 'ready'
        proc = subprocess.Popen([sys.executable, '-B', '-c',
                                 'import signal,time,pathlib,sys; signal.signal(signal.SIGTERM,signal.SIG_IGN); '
                                 'pathlib.Path(sys.argv[1]).write_text("ready"); time.sleep(60)', str(ready)], env=ENV)
        try:
            wait_for(ready.exists)
            stopped = stop_records([identity(proc.pid)], grace=.2, kill_grace=1)
            require(stopped[0]['stopped'] and stopped[0]['killSent'], 'Forced termination was hidden')
            require(proc.wait(timeout=2) == -signal.SIGKILL, 'Forced child exit differs')
        finally:
            if proc.poll() is None:
                proc.kill()
            proc.wait(timeout=2)


def orphaned_owner():
    with tempfile.TemporaryDirectory(prefix='f04-watchdog-orphan-') as temporary:
        root = Path(temporary)
        snapshot = root / 'owner'
        load_shared(pins(), snapshot)
        script = snapshot / 'command-supervisor.py'
        spec = importlib.util.spec_from_file_location('f04_watchdog_probe_owner', script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.enable_child_adoption()
        primary, child, owner = root / 'primary.json', root / 'child.json', root / 'owner.json'
        child_code = ('import os,signal,pathlib,sys,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); '
                      'pathlib.Path(sys.argv[1]).write_text(str(os.getpid())); time.sleep(60)')
        primary_code = ('import os,signal,pathlib,subprocess,sys,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); '
                        'subprocess.Popen([sys.executable,"-B","-c",sys.argv[3],sys.argv[2]],start_new_session=True); '
                        'pathlib.Path(sys.argv[1]).write_text(str(os.getpid())); time.sleep(60)')
        command = [sys.executable, '-B', '-c', primary_code, str(primary), str(child), child_code]
        report = root / 'process.json'
        # The short middle launcher exits before cleanup. The watchdog must find
        # the orphan by its exact verified path rather than retaining its Popen.
        middle_code = ('import os,pathlib,subprocess,sys,json; '
                       'f=open(sys.argv[1],"wb"); '
                       'p=subprocess.Popen([sys.executable,"-B","-O",sys.argv[2],"--report-fd",str(f.fileno()),'
                       '"--term-seconds","1","--kill-seconds","2","--",*json.loads(sys.argv[4])],'
                       'pass_fds=(f.fileno(),),start_new_session=True); '
                       'pathlib.Path(sys.argv[3]).write_text(str(p.pid)); os._exit(0)')
        middle = subprocess.Popen([sys.executable, '-B', '-c', middle_code, str(report), str(script),
                                   str(owner), json.dumps(command)], env=ENV)
        opened = []
        try:
            require(middle.wait(timeout=5) == 0, 'Short owner launcher failed')
            wait_for(lambda: owner.exists() and primary.exists() and child.exists())
            owner_pid = int(owner.read_text())
            for path in (primary, child):
                fd = os.pidfd_open(int(path.read_text()))
                poll = select.poll()
                poll.register(fd, select.POLLIN)
                opened.append((fd, poll))
            observed = owned_supervisors([script])
            require(len(observed) == 1 and observed[0]['pid'] == owner_pid, 'Orphaned stage owner was not located exactly')
            result = stop_records(observed, grace=6, kill_grace=1)
            require(result[0]['stopped'] and result[0]['terminateSent'] and not result[0]['killSent'],
                    'Watchdog failed to let the reviewed stage owner drain its children')
            require(owned_supervisors([script]) == [], 'Stopped owner is still executing')
            for _fd, poll in opened:
                wait_for(lambda: bool(poll.poll(0)), 2)
            captured = json.loads(report.read_text())
            require(captured['argv'] == command and captured['requestedSignal'] == signal.SIGTERM
                    and captured['shutdown']['stopped'] and len(captured['shutdown']['killSent']) >= 2,
                    'Owned descendant reaping evidence is incomplete')
            reaped, _status = os.waitpid(owner_pid, 0)
            require(reaped == owner_pid, 'Orphaned stage owner was not reaped')
        finally:
            if middle.poll() is None:
                middle.kill()
            middle.wait(timeout=2)
            remaining = owned_supervisors([script])
            if remaining:
                stop_records(remaining, grace=6, kill_grace=1)
            for fd, _poll in opened:
                os.close(fd)
            # This process enabled subreaping solely for its own synthetic tree.
            while True:
                try:
                    if os.waitpid(-1, os.WNOHANG)[0] == 0:
                        break
                except ChildProcessError:
                    break


def main(output):
    sources = runtime_sources()
    receipt = {'schemaVersion': 1, 'startedAt': now(), 'pythonOptimized': not __debug__,
               'sources': sources, 'cases': [], 'counts': {'passed': 0, 'failed': 0, 'checks': 2}}
    try:
        require_process_api()
        require((Path('/proc') / str(os.getpid()) / 'task' / str(os.getpid()) / 'children').is_file(),
                'Actual probes require the procfs task children interface')
        for name, function in zip(CASES, (verified_process, orphaned_owner)):
            try:
                function()
                receipt['cases'].append({'id': name, 'status': 'passed'})
                receipt['counts']['passed'] += 1
            except BaseException as error:
                receipt['cases'].append({'id': name, 'status': 'failed', 'error': type(error).__name__ + ': ' + str(error)})
                receipt['counts']['failed'] += 1
        require(runtime_sources() == sources, 'Watchdog probe source changed')
    except BaseException as error:
        receipt['fatal'] = type(error).__name__ + ': ' + str(error)
    receipt['finishedAt'] = now()
    with Path(output).open('x') as stream:
        json.dump(receipt, stream, indent=2)
        stream.write('\n')
    print(json.dumps({'counts': receipt['counts'], 'output': str(output)}))
    return 0 if receipt['counts'] == {'passed': 2, 'failed': 0, 'checks': 2} and 'fatal' not in receipt else 1


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Expected the new watchdog report path')
    raise SystemExit(main(sys.argv[1]))
