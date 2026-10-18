"""Manual hosted F04 work, independent owned-resource watchdog, and bounded evidence."""
import argparse
import contextlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import sys
import time

from f04_runtime_evidence import (ROOT, BUNDLE, RUNTIME, STATE, OUTPUT, SETUP, event_identity,
                                  source_snapshot, setup_commands, inventory, assess, fingerprint, now,
                                  verify_record, json_file, safe_path, validate_artifact_bytes, runtime, require)
from f04_runtime_evidence import (RECOVERY_MODULES, RECOVERY_FILES, git_source_bytes,
                                  verify_original_bytes, original_dispatch_identity)


def mkdir(path, fresh=False):
    path = Path(path)
    require(path.is_relative_to(ROOT), 'Task state must remain within this checkout')
    current = ROOT
    for part in path.relative_to(ROOT).parts:
        current = current / part
        require(not current.is_symlink(), 'Task state must not contain symlinks')
        if current == path and fresh:
            current.mkdir(mode=0o700)
        else:
            current.mkdir(mode=0o700, exist_ok=True)
    return path


def write(path, value):
    path = Path(path)
    require(not path.is_symlink() and not path.with_suffix(path.suffix + '.tmp').exists(), 'Unsafe phase receipt path')
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
    temporary.replace(path)


def check_control():
    control = json_file(safe_path(STATE, 'control.json'))
    require(control.get('schemaVersion') == 1 and control.get('identity') == event_identity(), 'Control record belongs to another dispatch')
    require(control.get('inputs') == source_snapshot() and control.get('checkoutRoot') == str(ROOT)
            and control.get('stateRoot') == str(STATE), 'Control source or checkout path changed')
    require(re.fullmatch(r'f04-[0-9a-f]{16}', control.get('runtimeRunId', '')), 'Invalid control runtime identity')
    return control


def original_control():
    control = json_file(safe_path(STATE, 'control.json'))
    require(control.get('schemaVersion') == 1 and control.get('checkoutRoot') == str(ROOT)
            and control.get('stateRoot') == str(STATE)
            and re.fullmatch(r'f04-[0-9a-f]{16}', control.get('runtimeRunId', '')), 'Invalid original control record')
    original_dispatch_identity(control.get('identity'))
    return control


def recovery_helpers(control):
    # A dirty checkout is an evaluation failure, not permission to leave owned
    # resources running. Read exact original Git blobs; never import modified
    # working files to perform recovery. Every blob must match the original
    # source snapshot and the reviewed shared-process pins before execution.
    blobs = {name: git_source_bytes(control['identity']['tested'], name) for name in RECOVERY_FILES}
    verify_original_bytes(control, blobs)
    directory = mkdir(STATE / 'work/original-cleanup', fresh=True)
    for name, data in blobs.items():
        target = directory / ('runtime' if '/runtime/' in name else 'process') / Path(name).name
        mkdir(target.parent)
        target.write_bytes(data)
        target.chmod(0o400)
    verify_recovery_copy(control, directory)
    def load(name, path):
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    saved = {name: sys.modules.get(name) for name in RECOVERY_MODULES}
    modules = {}
    try:
        for name in RECOVERY_MODULES:
            module = load('f04_original_' + name, directory / 'runtime' / (name + '.py'))
            sys.modules[name] = module
            modules[name] = module
    finally:
        for name, previous in saved.items():
            if previous is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = previous
    helper = load('f04_original_process_owner', directory / 'process/automate.py')
    modules['run'].verified_shared(control['inputs']['pins'], directory / 'process')
    return modules, helper, directory


def verify_recovery_copy(control, directory):
    blobs = {name: safe_path(directory, ('runtime/' if '/runtime/' in name else 'process/') + Path(name).name).read_bytes()
             for name in RECOVERY_FILES}
    verify_original_bytes(control, blobs)


def phase(control):
    return {'schemaVersion': 1, 'identity': control['identity'], 'runtimeRunId': control['runtimeRunId'],
            'inputs': control['inputs'], 'startedAt': now(), 'commands': [], 'failures': [],
            'sourcesUnchanged': False}


def current_matches(control):
    # Receipt checks must remain read-only: a changed helper must not be
    # imported just to discover that it changed before original-source cleanup.
    require(event_identity() == control['identity']
            and all(fingerprint(ROOT, name) == value for name, value in control['inputs']['files'].items()),
            'Checked source or workflow identity changed during this phase')


def run():
    identity, inputs = event_identity(), source_snapshot()
    from watchdog import process_identity, process_argv, require_process_api
    mkdir(STATE, fresh=True)
    for name in ('work', 'logs', 'reports', 'phases'):
        mkdir(STATE / name)
    control = {'schemaVersion': 1, 'identity': identity, 'inputs': inputs, 'startedAt': now(),
               'runtimeRunId': 'f04-' + secrets.token_hex(8), 'checkoutRoot': str(ROOT), 'stateRoot': str(STATE),
               'controller': None, 'toolchain': {'python': sys.version.split()[0], 'platform': sys.platform,
                   'pythonExecutable': sys.executable,
                   'kernel': os.uname().release, 'runnerImage': os.environ.get('ImageOS'),
                   'runnerImageVersion': os.environ.get('ImageVersion')}}
    write(STATE / 'control.json', control)
    result = phase(control)
    result.update(runtimeReturned=False, cancelledSignal=None)
    stopped = {'signal': None}
    def stop(number, _frame):
        if stopped['signal'] is None:
            stopped['signal'] = number
    previous = {number: signal.signal(number, stop) for number in (signal.SIGINT, signal.SIGTERM)}
    setup_snapshot = STATE / 'work/setup-process-owner'
    helper = None
    try:
        require_process_api()
        control['controller'] = {**process_identity(os.getpid()), 'argv': process_argv(os.getpid())}
        write(STATE / 'control.json', control)
        require(sys.version_info >= (3, 11) and sys.platform == 'linux' and os.uname().machine == 'x86_64',
                'The hosted runtime requires Linux x86_64 and Python 3.11+')
        ready = runtime.prerequisites()
        result['prerequisites'] = ready
        require(ready['passed'], 'Missing runtime prerequisites: ' + ', '.join(ready['missing']))
        runtime.reject_project_configuration(BUNDLE)
        environment = runtime.environment(STATE)
        helper = runtime.load_shared(inputs['pins'], setup_snapshot)
        commands = setup_commands(ROOT, STATE)
        deadline = time.monotonic() + 8 * 60
        for name in SETUP:
            require(stopped['signal'] is None, 'Hosted setup was interrupted')
            timeout = runtime.bounded_timeout(deadline, 240 if name == 'browser-install' else 180 if name == 'toolkit-install' else 90)
            command = helper.run_command(commands[name], root=BUNDLE, environment=environment,
                                         log_path=STATE / 'logs' / (name + '.txt'), timeout=timeout,
                                         cancelled=lambda: stopped['signal'] is not None)
            result['commands'].append({'id': name, **command})
            write(STATE / 'phases/run.json', {**result, 'finishedAt': now()})
            require(command['outcome'] == 'passed', 'Required hosted setup stage failed: ' + name)
            if name == 'node-version':
                require((STATE / 'logs/node-version.txt').read_text().strip() == 'v' + (ROOT / '.nvmrc').read_text().strip(),
                        'Installed Node differs from the repository pin')
        current_matches(control)
        runtime.verified_shared(inputs['pins'], setup_snapshot)
        require(stopped['signal'] is None, 'Hosted work was interrupted before runtime entry')
        # The runtime owns its own 45-minute stage budget and six-minute cleanup.
        # Calling its existing entry function avoids a second supervisor killing
        # that cleanup prematurely. The next workflow step independently handles
        # a dead controller or any orphaned per-stage owner.
        with (STATE / 'logs/runtime-controller.txt').open('x') as log, contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
            receipt = runtime.main(identity['operation'], control['runtimeRunId'])
        result['runtimeReturned'] = True
        result['runtimeStatus'] = receipt['overallStatus']
    except BaseException as error:
        result['failures'].append(type(error).__name__ + ': ' + str(error))
    finally:
        result['cancelledSignal'] = stopped['signal']
        try:
            current_matches(control)
            if helper is not None:
                runtime.verified_shared(inputs['pins'], setup_snapshot)
            result['sourcesUnchanged'] = True
        except BaseException as error:
            result['failures'].append('Final source verification: ' + str(error))
        result['finishedAt'] = now()
        write(STATE / 'phases/run.json', result)
        for number, handler in previous.items():
            signal.signal(number, handler)
    # A valid failed audit is a real nonzero workflow step even in diagnose mode.
    return 0 if result['runtimeReturned'] and result.get('runtimeStatus') == 'passed' and not result['failures'] and stopped['signal'] is None else 1


def cleanup():
    control = original_control()
    require(not (STATE / 'phases/cleanup.json').exists(), 'Cleanup evidence already exists for this run')
    result = phase(control)
    result.update(processes=[], supervisorsRemaining=None, shutdownPassed=False, docker={})
    run_dir = BUNDLE / 'artifacts/runtime-runs' / control['runtimeRunId']
    helper = None
    modules = None
    try:
        current_matches(control)
    except BaseException as error:
        result['failures'].append('Current source differs; original reviewed recovery is required: ' + str(error))
    try:
        modules, helper, snapshot = recovery_helpers(control)
        owner = modules['watchdog']
        original_runtime = modules['run']
        result['recoverySources'] = {name: control['inputs']['files'][name] for name in RECOVERY_FILES}
        # Each owner is stopped through a held pidfd only after its immutable
        # creation identity and exact argv match. Never kill by process name.
        owner.require_process_api()
        if control['controller'] is not None:
            result['processes'].extend(owner.stop_records([control['controller']], grace=35, kill_grace=5))
        else:
            result['failures'].append('Run controller ownership was never established')
        paths = []
        for directory in (STATE / 'work/setup-process-owner', run_dir / 'work/process-owner'):
            if directory.exists():
                original_runtime.verified_shared(control['inputs']['pins'], directory)
                paths.append(directory / 'command-supervisor.py')
        result['processes'].extend(owner.stop_records(owner.owned_supervisors(paths), grace=35, kill_grace=5))
        result['supervisorsRemaining'] = owner.owned_supervisors(paths)
        if result['supervisorsRemaining']:
            result['failures'].append('An owned stage supervisor is still running')
        if any(item.get('error') or item.get('stopped') is not True or item.get('killSent') is not False
               for item in result['processes']):
            result['failures'].append('A process identity, bounded shutdown or forced-kill check failed')
    except BaseException as error:
        result['failures'].append('Process watchdog: ' + type(error).__name__ + ': ' + str(error))
    try:
        # Even a process-watchdog failure must not skip safe, label-proven Docker
        # cleanup. All invocations use the same reviewed subreaper as runtime.
        require(helper is not None and modules is not None, 'Verified original recovery helpers are unavailable')
        environment = original_runtime.environment(mkdir(STATE / 'watchdog'))
        deadline = time.monotonic() + 360
        def call(name, argv, timeout):
            name = 'watchdog-' + name
            command = helper.run_command(argv, root=ROOT, environment=environment,
                                         log_path=STATE / 'logs' / (name + '.txt'),
                                         timeout=original_runtime.bounded_timeout(deadline, timeout))
            result['commands'].append({'id': name, **command})
            require(command['outcome'] == 'passed', 'Owned Docker watchdog command failed: ' + name)
            return (STATE / 'logs' / (name + '.txt')).read_text()
        result['docker'] = modules['cleanup'].cleanup_owned(run_dir, control['runtimeRunId'], control['inputs']['pins'], call)
        result['failures'].extend(result['docker']['errors'])
        if result['docker']['stopped']:
            private = run_dir / 'private'
            require(not private.is_symlink(), 'Ephemeral-key path became a symlink')
            if private.exists():
                shutil.rmtree(private)
        result['shutdownPassed'] = result['docker']['stopped'] and not result['failures']
    except BaseException as error:
        result['failures'].append('Docker watchdog: ' + type(error).__name__ + ': ' + str(error))
    finally:
        copy_verified = helper is None
        if helper is not None:
            try:
                verify_recovery_copy(control, snapshot)
                copy_verified = True
            except BaseException as error:
                result['failures'].append('Original recovery copy verification: ' + str(error))
        try:
            current_matches(control)
            result['sourcesUnchanged'] = copy_verified
        except BaseException as error:
            result['failures'].append('Final watchdog source verification: ' + str(error))
        result['finishedAt'] = now()
        write(STATE / 'phases/cleanup.json', result)
    return 0 if result['shutdownPassed'] and result['sourcesUnchanged'] and not result['failures'] else 1


def finalize():
    # Finalization does no network or signaling. If run/cleanup died before their
    # receipts, retain that absence explicitly instead of inventing a success.
    mkdir(OUTPUT, fresh=True)
    try:
        control = original_control()
    except BaseException as error:
        write(OUTPUT / 'manifest.json', {'schemaVersion': 1, 'kind': 'f04-hubs-runtime-hosted',
              'mode': 'hosted', 'qualificationStatus': 'incomplete', 'runStatus': 'failed', 'complete': False,
              'artifactIntegrity': 'unverifiable-missing-or-invalid-control', 'files': {},
              'failures': ['Finalization could not establish the original control identity: ' + str(error)]})
        return 1
    record = {'schemaVersion': 1, 'kind': 'f04-hubs-runtime-hosted', 'mode': 'hosted',
              'identity': control['identity'], 'inputs': control['inputs'], 'runtimeRunId': control['runtimeRunId'],
              'checkoutRoot': control['checkoutRoot'], 'stateRoot': control['stateRoot'],
              'startedAt': control['startedAt'], 'qualificationStatus': 'incomplete', 'runStatus': 'failed',
              'complete': False, 'failures': [], 'files': {},
              'toolchain': control.get('toolchain'),
              'controller': control.get('controller'),
              'scope': 'Pinned Hubs, Reticulum and Dialog loopback runtime subset. No physical XR/GPU, WAN/TURN, scale or production security acceptance.'}
    collection_errors, copied_bytes = [], 0
    def copy(source, name):
        nonlocal copied_bytes
        target = OUTPUT / name
        require(not source.is_symlink() and source.is_file() and source.stat().st_size <= 16 * 1024 * 1024,
                'Unsafe or oversized source artifact')
        data = source.read_bytes()
        validate_artifact_bytes(name, data)
        require(copied_bytes + len(data) <= 64 * 1024 * 1024, 'Artifact collection exceeds 64 MiB')
        mkdir(target.parent)
        require(not target.exists(), 'Artifact would overwrite a prior capture')
        target.write_bytes(data)
        copied_bytes += len(data)
    try:
        for name in ('run', 'cleanup'):
            source = STATE / 'phases' / (name + '.json')
            if source.exists():
                copy(safe_path(STATE, 'phases/' + name + '.json'), 'phases/' + name + '.json')
            else:
                missing = phase(control)
                missing.update(finishedAt=now(), failures=['Phase did not write a final receipt'],
                               runtimeReturned=False, processes=[], supervisorsRemaining=None, shutdownPassed=False, docker={})
                write(mkdir(OUTPUT / 'phases') / (name + '.json'), missing)
        for path in (STATE / 'logs').iterdir():
            require(path.is_file() and not path.is_symlink(), 'Unexpected phase log entry')
            copy(safe_path(STATE, 'logs/' + path.name), 'logs/' + path.name)
        regression = STATE / 'reports/watchdog-checks.json'
        if regression.exists():
            copy(safe_path(STATE, 'reports/watchdog-checks.json'), 'reports/watchdog-checks.json')
        # Original-source cleanup has already been attempted independently.
        # Never execute changed working helpers to collect or validate runtime
        # evidence: retain these phase receipts as explicitly unverifiable.
        current_matches(control)
        evidence = BUNDLE / 'artifacts/runtime-runs' / control['runtimeRunId'] / 'evidence'
        if evidence.exists():
            require(not evidence.is_symlink(), 'Runtime evidence path became a symlink')
            files, errors = runtime.collect_artifacts(evidence)
            collection_errors.extend(errors)
            for name in files:
                copy(safe_path(evidence, name), 'runtime/' + name)
            if (evidence / 'manifest.json').exists():
                copy(safe_path(evidence, 'manifest.json'), 'runtime/manifest.json')
        record['finishedAt'] = now()
        record['files'] = inventory(OUTPUT)
        try:
            current_matches(control)
            record['finalSourcesUnchanged'] = True
        except BaseException:
            record['finalSourcesUnchanged'] = False
        record['failures'] = assess(record, OUTPUT)
        require(not collection_errors, 'Runtime collection rejected files: ' + '; '.join(collection_errors))
        record['runStatus'] = 'failed' if record['failures'] else 'passed'
        record['complete'] = record['runStatus'] == 'passed'
        verify_record(record, OUTPUT, control['identity'], control['inputs'])
    except BaseException as error:
        record['runStatus'] = 'failed'
        record['complete'] = False
        record['artifactIntegrity'] = 'unverifiable-finalization-failure'
        record['failures'].append('Evidence finalization: ' + type(error).__name__ + ': ' + str(error))
        # Rejected bytes are not uploaded. The manifest preserves why this
        # artifact cannot be verified; a verifier must never accept it as clean.
        try:
            inventory(OUTPUT)
        except BaseException:
            # OUTPUT was created exclusively by this phase. Never upload any
            # remaining unverified entries, including linked directories.
            require(OUTPUT.is_dir() and not OUTPUT.is_symlink(), 'Output directory ownership changed')
            for path in OUTPUT.iterdir():
                if path.is_symlink() or path.is_file():
                    path.unlink()
                else:
                    shutil.rmtree(path)
        record['finishedAt'] = now()
        record['files'] = inventory(OUTPUT)
    write(OUTPUT / 'manifest.json', record)
    print(json.dumps({'runStatus': record['runStatus'], 'complete': record['complete'], 'qualificationStatus': 'incomplete',
                      'output': str(OUTPUT), 'failures': record['failures']}))
    return 0 if record['runStatus'] == 'passed' else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=('run', 'cleanup', 'finalize'))
    args = parser.parse_args()
    raise SystemExit({'run': run, 'cleanup': cleanup, 'finalize': finalize}[args.phase]())
