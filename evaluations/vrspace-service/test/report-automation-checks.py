"""Run every automation test method, retaining failures and skips as non-success."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from automate import ensure_directory, fingerprint, now, require


class RecordedResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.methods = []
        self.running = {}

    def startTest(self, test):
        super().startTest(test)
        self.running[test.id()] = {'id': test.id().split('.')[-1], 'status': 'passed', 'startedAt': now(), '_clock': time.monotonic()}

    def addError(self, test, error):
        self.running[test.id()]['status'] = 'failed'
        super().addError(test, error)

    def addFailure(self, test, error):
        self.running[test.id()]['status'] = 'failed'
        super().addFailure(test, error)

    def addSubTest(self, test, subtest, error):
        if error is not None:
            self.running[test.id()]['status'] = 'failed'
        super().addSubTest(test, subtest, error)

    def addSkip(self, test, reason):
        self.running[test.id()].update(status='skipped', reason=reason)
        super().addSkip(test, reason)

    def addExpectedFailure(self, test, error):
        self.running[test.id()]['status'] = 'failed'
        super().addExpectedFailure(test, error)

    def addUnexpectedSuccess(self, test):
        self.running[test.id()]['status'] = 'failed'
        super().addUnexpectedSuccess(test)

    def stopTest(self, test):
        value = self.running.pop(test.id())
        value.update(finishedAt=now(), durationMs=round((time.monotonic() - value.pop('_clock')) * 1000))
        self.methods.append(value)
        super().stopTest(test)


def main():
    require(sys.flags.optimize > 0, 'Automation regression evidence must run under python -O')
    output = Path(tempfile.mkdtemp(prefix='automation-checks-', dir=ensure_directory(ROOT, 'artifacts')))
    source_files = json.loads((ROOT / 'source-files.json').read_text())
    sources = {name: fingerprint(ROOT, name)['sha256'] for name in source_files}
    spec = importlib.util.spec_from_file_location('automation_checks', ROOT / 'test/automation-checks.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    suite = unittest.defaultTestLoader.loadTestsFromModule(module)
    started = now()
    result = unittest.TextTestRunner(verbosity=2, resultclass=RecordedResult).run(suite)
    counts = {key: sum(item['status'] == status for item in result.methods)
              for key, status in [('passed', 'passed'), ('failed', 'failed'), ('skipped', 'skipped')]}
    counts['checks'] = len(result.methods)
    unchanged = sources == {name: fingerprint(ROOT, name)['sha256'] for name in source_files}
    passed = result.wasSuccessful() and counts['failed'] == counts['skipped'] == 0 and unchanged
    report = {'schemaVersion': 1, 'kind': 'automation-method-regressions', 'runStatus': 'passed' if passed else 'failed',
              'qualificationStatus': 'incomplete', 'scope': 'Verifier mutations and real owned synthetic process lifecycle, not the VRSpace service or headset qualification',
              'pythonOptimized': True, 'startedAt': started, 'finishedAt': now(), 'counts': counts,
              'cases': result.methods, 'sourceDigests': sources, 'sourcesUnchanged': unchanged,
              'errors': [{'id': test.id(), 'traceback': detail} for test, detail in [*result.failures, *result.errors]]}
    (output / 'automation-checks.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'runStatus': report['runStatus'], 'counts': counts, 'output': output.relative_to(ROOT).as_posix()}))
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
