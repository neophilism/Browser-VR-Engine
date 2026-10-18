"""Verify a downloaded hosted service artifact against explicit event identities."""
import argparse
from pathlib import Path
from service_evidence import ROOT, automation, require, snapshot, verify_report
from service import command_contract, checkout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    for name in ('repository', 'event', 'head', 'tested', 'tree', 'workflow-sha', 'workflow-ref', 'run-id', 'attempt'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--base', required=True, help='Exact PR/merge-group base SHA; literal none for a main push')
    args = parser.parse_args()
    expected = {'repository': args.repository, 'event': args.event, 'head': args.head, 'tested': args.tested,
                'tree': args.tree, 'base': None if args.base == 'none' else args.base, 'workflowSha': args.workflow_sha,
                'workflowRef': args.workflow_ref, 'runId': args.run_id, 'attempt': args.attempt, 'dirty': False}
    require(checkout(ROOT) == {'tested': expected['tested'], 'tree': expected['tree'], 'dirty': False},
            'Check out the exact tested commit with a clean working tree before verifying hosted evidence')
    directory = args.directory.resolve(strict=True)
    record = automation.read_json(directory, 'manifest.json')
    before = snapshot(ROOT)
    verify_report(record, directory, expected, before, command_contract())
    # Recompute frozen fixture/resource identities even when this fresh checkout
    # has not downloaded dependencies or reproduced the renderer binaries.
    fixture_root = ROOT / 'packages/qualification-fixtures/fixtures'
    evaluated = record['evaluatedInputs']
    pins = automation.read_json(ROOT / 'evaluations/babylon-vrspace', 'fixture-pins.json')
    require(set(pins['files']) == set(automation.METADATA), 'Frozen fixture metadata coverage differs')
    for name, value in pins['files'].items():
        require(automation.fingerprint(fixture_root, name) == value
                and evaluated['fixtureDigests'].get(name.removesuffix('.json')) == value['sha256'], 'Fixture digest differs: ' + name)
    resources = {item['path']: {'bytes': item['sizeBytes'], 'sha256': item['sha256']}
                 for item in automation.read_json(fixture_root, 'catalog.json')['resources']}
    require(evaluated['resources'] == resources and all(automation.fingerprint(fixture_root, name) == value for name, value in resources.items()),
            'Fixture resource identity differs')
    require(evaluated['comparison'] == automation.read_json(fixture_root, 'comparison.json'), 'Fixture comparison differs')
    print('Hosted service subset evidence passed: all nine automation methods, 14 launcher cases, 15 finalization cases, six real-service stages, 9 browser checks and clean owned shutdown. Overall qualification remains incomplete.')


if __name__ == '__main__':
    main()
