"""Verify an exact downloaded manual diagnostic; failed evidence never means acceptance."""
import argparse
from pathlib import Path
import json
from f04_runtime_evidence import (REPOSITORY, WORKFLOW_REF, checkout, source_snapshot,
                                  json_file, verify_record, require)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    for name in ('head', 'tested', 'run-id', 'attempt'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--operation', choices=('diagnose', 'evaluate'), required=True)
    parser.add_argument('--expected-outcome', choices=('failed', 'passed'), required=True)
    args = parser.parse_args()
    state = checkout()
    require(state['dirty'] is False and state['head'] == args.head == args.tested,
            'Verifier must run in the clean exact tested checkout')
    expected = {**state, 'repository': REPOSITORY, 'event': 'workflow_dispatch', 'ref': 'refs/heads/main',
                'base': None, 'workflowRef': WORKFLOW_REF, 'workflowSha': args.tested,
                'runId': args.run_id, 'attempt': args.attempt, 'operation': args.operation}
    record = json_file(args.directory / 'manifest.json')
    status = verify_record(record, args.directory.resolve(strict=True), expected, source_snapshot())
    require(status == args.expected_outcome, 'Observed outcome differs from the explicitly requested artifact')
    print(json.dumps({'artifactIntegrity': 'verified', 'runStatus': status, 'complete': record['complete'],
                      'qualificationStatus': 'incomplete', 'acceptancePassed': status == 'passed',
                      'meaning': 'This verifies the recorded outcome. A failed diagnostic remains a failed evaluation.'}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
