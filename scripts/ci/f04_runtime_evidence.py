"""Source-bound evidence for the dispatch-only F04 diagnostic, including failures."""
from datetime import datetime, timezone
import hashlib
import importlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / 'evaluations/hubs-spoke'
RUNTIME = BUNDLE / 'runtime'
sys.path.insert(0, str(RUNTIME))


class DeferredModule:
    """Do not execute working-tree recovery helpers merely to read a receipt."""
    def __init__(self, name):
        self.name = name

    def __getattr__(self, name):
        return getattr(importlib.import_module(self.name), name)


runtime = DeferredModule('run')
configuration = DeferredModule('config')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')

REPOSITORY = 'neophilism/Browser-VR-Engine'
WORKFLOW = '.github/workflows/f04-hubs-runtime.yml'
WORKFLOW_REF = REPOSITORY + '/' + WORKFLOW + '@refs/heads/main'
STATE = ROOT / 'artifacts/f04-runtime-state'
OUTPUT = ROOT / 'artifacts/f04-runtime'
SETUP = ('node-version', 'runtime-pure', 'browser-policy', 'watchdog-regressions', 'toolkit-install', 'browser-install')
WATCHDOG_CASES = ('verified-pidfd-stop-refuses-unrelated-and-stale-identities',
                  'orphaned-stage-owner-drains-and-reaps-term-ignoring-descendant')
CI_FILES = (WORKFLOW, 'scripts/ci/f04-runtime.py', 'scripts/ci/f04_runtime_evidence.py',
            'scripts/ci/verify-f04-runtime-evidence.py', 'scripts/check-f04-runtime-policy.mjs',
            'scripts/check-ci-policy.mjs', 'scripts/test/f04-runtime-policy.test.mjs',
            'scripts/test/f04-runtime-evidence.test.mjs', 'scripts/test/f04-runtime-evidence-checks.py',
            '.nvmrc', 'docs/ci/action-pins.json', 'docs/plan/pr-plan.json')
RECOVERY_MODULES = ('config', 'prepare', 'cleanup', 'watchdog', 'run')
RECOVERY_FILES = (*['evaluations/hubs-spoke/runtime/' + name + '.py' for name in RECOVERY_MODULES],
                  'evaluations/hubs-spoke/runtime/pins.json',
                  'evaluations/vrspace-service/automate.py', 'evaluations/vrspace-service/command-supervisor.py')
AUDIT_ARGV = ['npm', 'audit', '--package-lock-only', '--ignore-scripts', '--json', '--audit-level=high',
              '--registry=https://registry.npmjs.org', '--fetch-timeout=15000', '--fetch-retries=0']
SHA = r'[a-f0-9]{40}'
INNER_ARTIFACT = (r'(?:logs/[a-z0-9][a-z0-9_-]*\.(?:txt|process\.json)|'
                  r'audits/(?:toolkit|hubs|dialog)\.(?:stdout\.json|stderr\.txt|receipt\.json)|'
                  r'browser/(?:input\.json|browser-checks\.json|alpha\.png|beta\.png)|'
                  r'(?:compose|adaptations|containers-running|containers-before-shutdown)\.json)')
OUTER_ARTIFACT = (r'(?:phases/(?:run|cleanup)\.json|logs/[a-z0-9][a-z0-9_-]*\.(?:txt|process\.json)|'
                  r'reports/watchdog-checks\.json|runtime/manifest\.json|runtime/' + INNER_ARTIFACT + ')')


def json_file(path):
    path = Path(path)
    require(path.is_file() and not path.is_symlink() and path.stat().st_size <= 16 * 1024 * 1024,
            'Missing, linked or oversized evidence JSON')
    return json.loads(path.read_text())


def safe_path(root, name):
    require(isinstance(name, str) and re.fullmatch(r'[A-Za-z0-9._/-]+', name)
            and not name.startswith('/') and all(part not in ('', '.', '..') for part in name.split('/')),
            'Invalid relative evidence path')
    root = Path(root).resolve(strict=True)
    path = root
    for part in name.split('/'):
        path = path / part
        require(not path.is_symlink(), 'Symlinks are forbidden in evidence and source inputs')
    require(path.resolve(strict=True).is_relative_to(root) and path.is_file(), 'Path escapes its source root')
    return path


def fingerprint(root, name):
    data = safe_path(root, name).read_bytes()
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def git(*args, root=ROOT):
    result = subprocess.run(['git', '-c', 'credential.helper=', *args], cwd=root,
                            env={'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'LANG': 'C.UTF-8',
                                 'LC_ALL': 'C.UTF-8', 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null'},
                            check=True, capture_output=True, text=True, timeout=10)
    return result.stdout.strip()


def git_source_bytes(commit, name):
    require(re.fullmatch(SHA, commit) and name in RECOVERY_FILES, 'Unlisted original cleanup source')
    result = subprocess.run(['git', '-c', 'credential.helper=', 'show', commit + ':' + name], cwd=ROOT,
                            env={'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'LANG': 'C.UTF-8',
                                 'LC_ALL': 'C.UTF-8', 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null'},
                            check=True, capture_output=True, timeout=10)
    require(len(result.stdout) <= 1024 * 1024, 'Original cleanup source exceeds its bound')
    return result.stdout


def verify_original_bytes(control, blobs):
    require(set(blobs) == set(RECOVERY_FILES), 'Original cleanup source set is incomplete')
    for name, data in blobs.items():
        require(control['inputs']['files'].get(name) == {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()},
                'Original cleanup source differs from the recorded reviewed input')
    pin_value = json.loads(blobs['evaluations/hubs-spoke/runtime/pins.json'])
    require(pin_value == control['inputs']['pins'], 'Original runtime pins differ from the control record')
    for name, value in pin_value['sharedSupervisor'].items():
        require(hashlib.sha256(blobs['evaluations/vrspace-service/' + name]).hexdigest() == value['sha256'],
                'Original shared owner differs from the reviewed pin')


def checkout(root=ROOT):
    return {'head': git('rev-parse', 'HEAD', root=root), 'tested': git('rev-parse', 'HEAD', root=root),
            'tree': git('rev-parse', 'HEAD^{tree}', root=root),
            'dirty': bool(git('status', '--porcelain=v1', '--untracked-files=all', root=root))}


def identity_from(state, env, payload):
    require(env.get('GITHUB_ACTIONS') == 'true' and env.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
            and env.get('GITHUB_REF') == 'refs/heads/main', 'Only an explicit main-branch manual dispatch is supported')
    require(payload.get('repository', {}).get('full_name') == REPOSITORY
            and payload['repository'].get('default_branch') == 'main'
            and payload.get('ref') in ('main', 'refs/heads/main'), 'Dispatch payload is not for this reviewed main branch')
    mode = env.get('F04_MODE')
    require(mode in ('diagnose', 'evaluate') and payload.get('inputs') == {'mode': mode},
            'Dispatch mode differs from the event payload')
    require(env.get('GITHUB_REPOSITORY') == REPOSITORY and env.get('GITHUB_SHA') == state['tested']
            and env.get('GITHUB_WORKFLOW_SHA') == env.get('CI_WORKFLOW_SHA') == state['tested']
            and env.get('GITHUB_WORKFLOW_REF') == env.get('CI_WORKFLOW_REF') == WORKFLOW_REF,
            'Checkout, workflow and dispatched commit identities differ')
    require(env.get('RUNNER_ENVIRONMENT') == 'github-hosted' and env.get('RUNNER_OS') == 'Linux'
            and env.get('RUNNER_ARCH') == 'X64', 'This command requires the ephemeral Linux x64 GitHub-hosted runner')
    require(not env.get('CHROME_EXECUTABLE') and not env.get('F03_FIXTURE_ROOT'),
            'Hosted browser and fixture overrides are forbidden')
    identity = {**state, 'repository': REPOSITORY, 'event': 'workflow_dispatch', 'ref': 'refs/heads/main',
                'base': None, 'workflowRef': WORKFLOW_REF, 'workflowSha': env['GITHUB_WORKFLOW_SHA'],
                'runId': env.get('GITHUB_RUN_ID'), 'attempt': env.get('GITHUB_RUN_ATTEMPT'), 'operation': mode}
    validate_identity(identity)
    return identity


def event_identity():
    path = Path(os.environ.get('GITHUB_EVENT_PATH', ''))
    require(path.is_file() and path.stat().st_size <= 4 * 1024 * 1024, 'Missing bounded dispatch event payload')
    return identity_from(checkout(), os.environ, json.loads(path.read_text()))


def original_dispatch_identity(identity):
    """Bind the original event without requiring an unchanged working checkout."""
    validate_identity(identity)
    path = Path(os.environ.get('GITHUB_EVENT_PATH', ''))
    require(path.is_file() and path.stat().st_size <= 4 * 1024 * 1024, 'Missing bounded dispatch event payload')
    state = {key: identity[key] for key in ('head', 'tested', 'tree', 'dirty')}
    require(identity_from(state, os.environ, json.loads(path.read_text())) == identity,
            'Original control does not belong to this dispatched run')
    require(git('rev-parse', identity['tested'] + '^{tree}') == identity['tree'],
            'Original reviewed Git tree is unavailable or different')


def validate_identity(value):
    require(isinstance(value, dict) and value.get('repository') == REPOSITORY
            and value.get('event') == 'workflow_dispatch' and value.get('ref') == 'refs/heads/main'
            and value.get('base') is None and value.get('dirty') is False
            and value.get('workflowRef') == WORKFLOW_REF and value.get('operation') in ('diagnose', 'evaluate'),
            'Invalid hosted dispatch identity')
    require(all(isinstance(value.get(key), str) and re.fullmatch(SHA, value[key])
                for key in ('head', 'tested', 'tree', 'workflowSha'))
            and value['head'] == value['tested'] == value['workflowSha'], 'Wrong source or workflow commit')
    require(all(isinstance(value.get(key), str) and re.fullmatch(r'[1-9][0-9]*', value[key])
                for key in ('runId', 'attempt')), 'Run and attempt must be positive decimal identities')


def source_snapshot():
    pin_value = configuration.pins()
    runtime.verified_shared(pin_value)
    names = set(CI_FILES)
    names.update('evaluations/hubs-spoke/runtime/' + name for name in runtime.runtime_sources())
    names.update('evaluations/hubs-spoke/scripts/' + path.name for path in (BUNDLE / 'scripts').glob('*.mjs'))
    names.update('evaluations/hubs-spoke/' + name for name in ('package.json', 'package-lock.json',
                 'fixture-pins.json', 'source-pins.json', 'historical-source-map.json', 'evidence/index.json'))
    names.update('evaluations/vrspace-service/' + name for name in pin_value['sharedSupervisor'])
    return {'files': {name: fingerprint(ROOT, name) for name in sorted(names)},
            'fixtures': configuration.verified_fixtures(ROOT / 'packages/qualification-fixtures/fixtures', pin_value),
            'runtime': runtime.runtime_sources(), 'pins': pin_value}


def timestamp(value):
    require(isinstance(value, str), 'Missing evidence timestamp')
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(result.tzinfo is not None, 'Evidence time lacks a timezone')
    return result.timestamp()


def within(parent, child):
    require(timestamp(parent['startedAt']) <= timestamp(child['startedAt'])
            <= timestamp(child['finishedAt']) <= timestamp(parent['finishedAt']), 'Stale or inverted evidence time')


def inventory(directory):
    directory = Path(directory)
    files, total = {}, 0
    require(directory.is_dir() and not directory.is_symlink(), 'Missing or linked artifact directory')
    for path in sorted(directory.rglob('*')):
        require(not path.is_symlink(), 'Artifact symlinks are forbidden')
        if not path.is_file() or path == directory / 'manifest.json':
            continue
        name = path.relative_to(directory).as_posix()
        require(path.stat().st_size <= 16 * 1024 * 1024, 'Artifact exceeds 16 MiB')
        data = path.read_bytes()
        validate_artifact_bytes(name, data)
        total += len(data)
        require(total <= 64 * 1024 * 1024, 'Artifact collection exceeds 64 MiB')
        files[name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    return files


def validate_artifact_bytes(name, data):
    require(re.fullmatch(OUTER_ARTIFACT, name), 'Artifact is outside the explicit collection allowlist: ' + name)
    require(len(data) <= 16 * 1024 * 1024, 'Artifact exceeds 16 MiB')
    if not name.endswith('.png'):
        require(not re.search(rb'-----BEGIN [A-Z ]*PRIVATE KEY-----', data), 'Private material in artifact')
        require(not re.search(rb'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', data), 'Ephemeral grant in artifact')


def validate_command(record, directory, prefix, expected_id=None, expected_argv=None):
    require(isinstance(record, dict) and re.fullmatch(r'[a-z0-9-]+', record.get('id', '')),
            'Malformed command identity')
    if expected_id is not None:
        require(record['id'] == expected_id and record.get('argv') == expected_argv, 'Required command was substituted')
    require(record.get('outcome') in ('passed', 'failed') and isinstance(record.get('argv'), list)
            and all(isinstance(arg, str) for arg in record['argv']) and record['argv'], 'Malformed command result')
    log = prefix + record['id'] + '.txt'
    safe_path(directory, log)
    process = record.get('supervision')
    if process is not None:
        require(isinstance(record.get('processEvidence'), str)
                and re.fullmatch(re.escape(record['id']) + r'-[a-z0-9_]{8}\.process\.json', record['processEvidence'])
                and json_file(safe_path(directory, prefix + record['processEvidence'])) == process,
                'Command process receipt is missing or changed')
        require(process.get('argv') == record['argv'] and process.get('exitCode') == record.get('exitCode'),
                'Command and process result contradict one another')
        within(record, process)
    if record['outcome'] == 'passed':
        require(type(record.get('exitCode')) is int and record['exitCode'] == 0 and not record.get('error')
                and not record.get('logTruncated') and record.get('supervisorExitCode') == 0
                and record.get('supervisorShutdown') == {'terminateSent': False, 'killSent': False}
                and isinstance(process, dict) and process.get('outcome') == 'passed' and process.get('exitCode') == 0
                and process.get('requestedSignal') is None and 'error' not in process
                and process.get('shutdown', {}).get('stopped') is True and process['shutdown'].get('needed') is False
                and process['shutdown'].get('terminateSent') == [] and process['shutdown'].get('killSent') == [],
                'A failed or unowned process was labeled passed')


def setup_commands(checkout_root, state_root):
    bundle = str(Path(checkout_root) / 'evaluations/hubs-spoke')
    return {'node-version': ['node', '--version'],
            'runtime-pure': ['python3', '-B', '-O', 'runtime/test/runtime-checks.py'],
            'browser-policy': ['node', '--test', '--test-isolation=none', 'runtime/test/browser-policy.test.mjs'],
            'watchdog-regressions': ['python3', '-B', '-O', 'runtime/test/watchdog-checks.py',
                                     str(Path(state_root) / 'reports/watchdog-checks.json')],
            'toolkit-install': ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'],
            'browser-install': ['node', bundle + '/node_modules/playwright/cli.js', 'install', '--with-deps', 'chromium']}


def runtime_core_stages(pin_value):
    return ['docker-info', 'compose-version', 'node-version', 'npm-version',
            'repository-head', 'repository-tree', 'repository-status',
            *[name + '-' + action for name in pin_value['sources']
              for action in ('init', 'fetch', 'checkout', 'head', 'tree', 'archive')],
            'toolkit-audit', 'hubs-audit', 'dialog-audit', 'toolkit-install',
            *['download-' + name for name in (*pin_value['bootstrap'], *pin_value['wheels'])],
            'local-tls', 'local-perms-key', 'local-perms-public',
            *[name + '-image-pull' for name in pin_value['images']['images']],
            'compose-build', 'start-base', 'start-reticulum', 'service-readiness',
            'identity-hubs-client', 'identity-dialog', 'identity-reticulum', 'dialog-meta', 'two-client-browser']


def runtime_commands(record):
    checkout_root, run_id = record['checkoutRoot'], record['runtimeRunId']
    bundle = checkout_root + '/evaluations/hubs-spoke'
    runtime_root = bundle + '/runtime'
    run_dir = bundle + '/artifacts/runtime-runs/' + run_id
    work, private = run_dir + '/work', run_dir + '/private'
    python = record.get('toolchain', {}).get('pythonExecutable')
    require(isinstance(python, str) and Path(python).is_absolute(), 'Python executable identity is missing')
    docker = ['docker', '--host', 'unix:///var/run/docker.sock']
    compose = docker + ['compose', '--project-name', run_id, '--file', work + '/compose.json']
    values = {}
    def add(name, argv, cwd=work):
        values[name] = {'argv': argv, 'cwd': cwd}
    add('docker-info', docker + ['info', '--format', '{{json .ServerVersion}}'])
    add('compose-version', docker + ['compose', 'version', '--short'])
    add('node-version', ['node', '--version'])
    add('npm-version', ['npm', '--version'])
    for name, args in (('repository-head', ['rev-parse', 'HEAD']), ('repository-tree', ['rev-parse', 'HEAD^{tree}']),
                       ('repository-status', ['status', '--porcelain=v1', '--untracked-files=all'])):
        add(name, ['git', *args], checkout_root)
    for name, item in record['inputs']['pins']['sources'].items():
        directory = work + '/sources/' + name
        add(name + '-init', ['git', 'init', '--quiet', directory])
        add(name + '-fetch', ['git', '-C', directory, 'fetch', '--no-tags', '--depth=1', item['repository'], item['commit']])
        add(name + '-checkout', ['git', '-C', directory, '-c', 'advice.detachedHead=false', 'checkout', '--detach', item['commit']])
        add(name + '-head', ['git', '-C', directory, 'rev-parse', 'HEAD'])
        add(name + '-tree', ['git', '-C', directory, 'rev-parse', 'HEAD^{tree}'])
        add(name + '-archive', ['git', '-C', directory, 'archive', '--format=tar', '--output=' + work + '/' + name + '.tar', item['commit']])
    for name in ('toolkit', 'hubs', 'dialog'):
        source = bundle if name == 'toolkit' else work + '/sources/' + name
        add(name + '-audit', ['node', runtime_root + '/audit.mjs', source, run_dir + '/evidence/audits', name])
    add('toolkit-install', ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], bundle)
    for name in (*record['inputs']['pins']['bootstrap'], *record['inputs']['pins']['wheels']):
        add('download-' + name, [python, '-B', '-O', runtime_root + '/download.py', name, work + '/bootstrap'])
    add('local-tls', ['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '1',
                     '-keyout', private + '/key.pem', '-out', private + '/cert.pem', '-subj', '/CN=hubs.local',
                     '-addext', 'subjectAltName=DNS:hubs.local,DNS:hubs-client,DNS:hubs-assets.local,DNS:hubs-proxy.local,IP:127.0.0.1'])
    add('local-perms-key', ['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', private + '/perms-private.pem'])
    add('local-perms-public', ['openssl', 'pkey', '-in', private + '/perms-private.pem', '-pubout', '-out', private + '/perms-public.pem'])
    for name, image in record['inputs']['pins']['images']['images'].items():
        add(name + '-image-pull', docker + ['pull', '--platform=linux/amd64', image['image']])
    add('compose-build', compose + ['build'])
    add('start-base', compose + ['up', '--wait', '--wait-timeout', '90', 'db', 'dialog', 'hubs-client'])
    add('start-reticulum', compose + ['up', '--detach', 'reticulum'])
    # The expected derived model hash is bound separately to adaptations.json.
    add('service-readiness', [python, '-B', '-O', runtime_root + '/readiness.py', run_id, private + '/cert.pem'])
    for service in ('hubs-client', 'dialog', 'reticulum'):
        add('identity-' + service, compose + ['exec', '-T', service, 'cat', '/opt/bve-build-identity.json'])
    add('dialog-meta', compose + ['exec', '-T', 'dialog', 'node', '-e',
        "require('http').get('http://127.0.0.1:7000/meta',r=>{r.pipe(process.stdout);r.on('end',()=>{if(r.statusCode!==200)process.exitCode=1})}).on('error',()=>process.exit(1))"])
    add('two-client-browser', ['node', runtime_root + '/browser-checks.mjs', run_dir + '/evidence/browser'], bundle)
    return values


def docker_query(run_id, kind):
    label = ('org.browser-vr-engine.f04-run' if kind == 'image' else 'com.docker.compose.project') + '=' + run_id
    return ['docker', '--host', 'unix:///var/run/docker.sock',
            *(['ps', '-aq'] if kind == 'container' else [kind, 'ls', '-q']), '--filter', 'label=' + label]


def validate_docker_command(item, record, *, watchdog=False):
    name = item['id'].removeprefix('watchdog-') if watchdog else item['id']
    argv = item['argv']
    run_dir = record['checkoutRoot'] + '/evaluations/hubs-spoke/artifacts/runtime-runs/' + record['runtimeRunId']
    require(item.get('cwd') == (record['checkoutRoot'] if watchdog else run_dir + '/work'), 'Docker command CWD differs')
    match = re.fullmatch(r'(?:cleanup-)?(container|network|volume|image)-list-[0-9]+', name)
    if match:
        require(argv == docker_query(record['runtimeRunId'], match[1]), 'Docker resource query is not bound to this run')
        return
    compose = ['docker', '--host', 'unix:///var/run/docker.sock', 'compose', '--project-name', record['runtimeRunId'],
               '--file', run_dir + '/work/compose.json']
    if re.fullmatch(r'cleanup-(logs|down)-[0-9]+', name):
        args = ['logs', '--no-color', '--tail', '150'] if name.startswith('cleanup-logs-') else ['down', '--volumes', '--remove-orphans', '--timeout', '15']
        require(argv == compose + args, 'Docker cleanup targets a different project or configuration')
        return
    match = re.fullmatch(r'(?:cleanup-)?(container-inspect|network-ownership|volume-ownership|image-ownership|image-remove)-[0-9]+', name)
    require(match is not None, 'Unexpected Docker stage')
    action = match[1]
    prefix = ['docker', '--host', 'unix:///var/run/docker.sock'] + (
        ['inspect'] if action == 'container-inspect' else
        ['image', 'rm'] if action == 'image-remove' else [action.split('-')[0], 'inspect'])
    identifiers = argv[len(prefix):]
    require(argv[:len(prefix)] == prefix and 1 <= len(identifiers) <= 12
            and all(re.fullmatch(r'[a-zA-Z0-9_.-]+', value) for value in identifiers), 'Unbounded or changed Docker inspection/removal')


def validate_absence_claim(cleanup, record, directory):
    commands = cleanup.get('commands')
    require(isinstance(commands, list) and len({item.get('id') for item in commands}) == len(commands),
            'Missing or duplicate watchdog commands')
    for item in commands:
        validate_command(item, directory, 'logs/')
        validate_docker_command(item, record, watchdog=True)
        within(cleanup, item)
    for before, after in zip(commands, commands[1:]):
        require(timestamp(before['finishedAt']) <= timestamp(after['startedAt']), 'Watchdog commands overlap or are reordered')
    if cleanup.get('docker', {}).get('containersNetworksVolumesImagesAbsent') is True:
        require(cleanup.get('recoverySources') == {name: record['inputs']['files'][name] for name in RECOVERY_FILES},
                'Owned cleanup did not bind its original reviewed recovery source')
        for kind in ('container', 'network', 'volume', 'image'):
            matches = [item for item in commands if item['argv'] == docker_query(record['runtimeRunId'], kind)]
            require(matches and matches[-1]['outcome'] == 'passed'
                    and safe_path(directory, 'logs/' + matches[-1]['id'] + '.txt').read_text().strip() == '',
                    'Owned resource absence lacks an actual successful empty query: ' + kind)
            index = commands.index(matches[-1])
            require(not any('down' in item['argv'] or ('image' in item['argv'] and 'rm' in item['argv'])
                            for item in commands[index + 1:] if kind == 'image' or 'down' in item['argv']),
                    'Absence was sampled before a later resource mutation')
    if cleanup.get('shutdownPassed') is True:
        controller = record.get('controller')
        processes = cleanup.get('processes')
        require(isinstance(controller, dict) and type(controller.get('pid')) is int and controller['pid'] > 1
                and type(controller.get('startTicks')) is int and controller['startTicks'] > 0
                and isinstance(processes, list) and processes
                and processes[0].get('pid') == controller['pid'] and processes[0].get('startTicks') == controller['startTicks']
                and processes[0].get('stopped') is True
                and cleanup.get('docker', {}).get('containersNetworksVolumesImagesAbsent') is True,
                'Clean shutdown lacks original controller or owned resource observations')


def verify_runtime_contexts(inner, directory, record):
    contexts = inner.get('contexts')
    require(isinstance(contexts, dict) and set(contexts) == {'hubs-client', 'dialog', 'reticulum'}
            and json_file(safe_path(directory, 'runtime/adaptations.json')) == contexts, 'Build context receipts are missing or changed')
    trees = inner.get('upstreamTrees')
    require(isinstance(trees, dict) and set(trees) == set(record['inputs']['pins']['sources']), 'Upstream source-tree inventory differs')
    for name, tree in trees.items():
        require(isinstance(tree, str) and re.fullmatch(SHA, tree)
                and safe_path(directory, 'runtime/logs/' + name + '-tree.txt').read_text().strip() == tree,
                'Upstream source-tree output differs')
    for service, source in (('hubs-client', 'hubs'), ('dialog', 'dialog'), ('reticulum', 'reticulum')):
        value = contexts[service]
        pin_value = record['inputs']['pins']['sources'][source]
        require(value.get('schemaVersion') == 1 and value.get('runId') == record['runtimeRunId']
                and value.get('source') == source and value.get('commit') == pin_value['commit']
                and value.get('files') == pin_value['files'] and value.get('tree') == trees[source]
                and value.get('baseImage') == record['inputs']['pins']['images']['images'][source]['image'],
                'Build identity differs from the pinned source or image')
    scenario = json_file(ROOT / 'packages/qualification-fixtures/fixtures/scenario.json')
    checkpoint = next(item for item in scenario['steps'] if item['id'] == 'walk-through-arch')
    glb, relocation = configuration.relocate_glb(safe_path(BUNDLE, record['inputs']['pins']['spokeExport']['path']).read_bytes(),
                                   record['runtimeRunId'], record['inputs']['fixtures']['files'], checkpoint['position'])
    derived = {'bytes': len(glb), 'sha256': hashlib.sha256(glb).hexdigest()}
    model_url = 'https://hubs.local:8080/evaluation/' + record['runtimeRunId'] + '/courtyard.glb'
    require(contexts['hubs-client'].get('derivedModel') == derived and contexts['hubs-client'].get('relocation') == relocation
            and contexts['hubs-client'].get('fixture') == record['inputs']['fixtures']
            and contexts['hubs-client'].get('modelUrl') == model_url,
            'Published scene differs from the canonical retained export adaptation')
    run_dir = record['checkoutRoot'] + '/evaluations/hubs-spoke/artifacts/runtime-runs/' + record['runtimeRunId']
    require(json_file(safe_path(directory, 'runtime/compose.json')) == configuration.make_compose(run_dir, record['runtimeRunId'], record['inputs']['pins']),
            'Runtime Compose configuration differs from the bounded profile')
    return contexts


def validate_inner(inner, directory, record):
    require(inner.get('schemaVersion') == 1 and inner.get('runId') == record['runtimeRunId']
            and inner.get('mode') == record['identity']['operation'] and inner.get('qualification') == 'incomplete',
            'Runtime record is stale or claims full qualification')
    require(inner.get('sources') == record['inputs']['runtime'] and inner.get('pins') == record['inputs']['pins'],
            'Runtime used different source or upstream pins')
    require(inner.get('fixtures') in (None, record['inputs']['fixtures']), 'Runtime fixture inputs differ')
    require(isinstance(inner.get('failures'), list) and all(isinstance(value, str) for value in inner['failures']),
            'Malformed runtime failures')
    files = inner.get('artifacts')
    require(isinstance(files, dict), 'Runtime artifact inventory is missing')
    actual = {name.removeprefix('runtime/'): value for name, value in record['files'].items()
              if name.startswith('runtime/') and name != 'runtime/manifest.json'}
    require(files == actual, 'Runtime retained inventory differs from uploaded files')
    commands = inner.get('commands')
    require(isinstance(commands, list) and len({item.get('id') for item in commands}) == len(commands),
            'Duplicate or malformed runtime commands')
    expected_commands = runtime_commands(record)
    for item in commands:
        validate_command(item, directory, 'runtime/logs/')
        if item['id'] in expected_commands:
            expected = expected_commands[item['id']]
            if item['id'] == 'service-readiness':
                model = inner.get('contexts', {}).get('hubs-client', {}).get('derivedModel', {}).get('sha256')
                require(isinstance(model, str) and re.fullmatch(r'[a-f0-9]{64}', model), 'Readiness model fingerprint is missing')
                expected = {'argv': [*expected['argv'], model], 'cwd': expected['cwd']}
            require(item.get('argv') == expected['argv'] and item.get('cwd') == expected['cwd'], 'Runtime command was substituted: ' + item['id'])
        else:
            validate_docker_command(item, record)
        within(inner, item)
    audits = inner.get('audits')
    require(isinstance(audits, dict) and set(audits).issubset({'toolkit', 'hubs', 'dialog'}), 'Unknown runtime audit graph')
    for name, verdict in audits.items():
        receipt = json_file(safe_path(directory, 'runtime/audits/' + name + '.receipt.json'))
        value = json_file(safe_path(directory, 'runtime/audits/' + name + '.stdout.json'))
        command = next((item for item in commands if item['id'] == name + '-audit'), None)
        require(command is not None and receipt.get('argv') == AUDIT_ARGV and receipt.get('name') == name
                and receipt.get('sourceUnchanged') is True and receipt.get('signal') is None
                and receipt.get('errorCode') is None and command.get('exitCode') == receipt.get('exitCode'),
                'Invalid audit command/result binding')
        require(verdict == configuration.audit_verdict(value, receipt['exitCode']), 'Audit failure or entries were misrepresented')
        process = command.get('supervision', {})
        require(process.get('requestedSignal') is None and 'error' not in process
                and process.get('exitCode') == receipt['exitCode']
                and process.get('shutdown', {}).get('stopped') is True and process['shutdown'].get('needed') is False
                and command.get('supervisorExitCode') == receipt['exitCode']
                and command.get('supervisorShutdown') == {'terminateSent': False, 'killSent': False}
                and (command.get('outcome') == 'passed') is verdict['passed'],
                'An interrupted or unowned command cannot count as a valid audit result')
        source = record['checkoutRoot'] + '/evaluations/hubs-spoke'
        if name != 'toolkit':
            source += '/artifacts/runtime-runs/' + record['runtimeRunId'] + '/work/sources/' + name
        require(receipt.get('cwd') == source and command.get('argv') == ['node', record['checkoutRoot'] + '/evaluations/hubs-spoke/runtime/audit.mjs',
                source, record['checkoutRoot'] + '/evaluations/hubs-spoke/artifacts/runtime-runs/' + record['runtimeRunId'] + '/evidence/audits', name],
                'Audit invoked different source or output paths')
        expected_inputs = ({filename: record['inputs']['files']['evaluations/hubs-spoke/' + filename]['sha256']
                            for filename in ('package.json', 'package-lock.json')} if name == 'toolkit' else
                           {filename: record['inputs']['pins']['sources'][name]['files'][filename]['sha256']
                            for filename in ('package.json', 'package-lock.json')})
        require(receipt.get('inputs') == expected_inputs, 'Audit graph differs from its pinned lockfile')
        within(command, receipt)
    require(inner.get('auditFailures') == [name for name, value in audits.items() if value.get('passed') is not True],
            'Audit failure list is incomplete')
    expected_status = configuration.overall_status(inner['mode'], audits, inner.get('browserPassed'), inner.get('shutdownPassed'), inner['failures'])
    require(inner.get('overallStatus') == expected_status, 'Runtime status conceals an audit, browser or shutdown failure')
    claimed_runtime = inner.get('runtimeExecuted') is True or inner.get('browserPassed') is True
    if claimed_runtime:
        required = runtime_core_stages(record['inputs']['pins'])
        core = [item for item in commands if item['id'] in required]
        require([item['id'] for item in core] == required[:len(core)]
                and len(core) >= required.index('start-base') + 1,
                'Claimed runtime subset omitted or reordered its real preparation/start stages')
        for item in core:
            if item['id'].endswith('-audit') and inner['mode'] == 'diagnose':
                require(item['id'].removesuffix('-audit') in audits, 'Diagnostic execution lacks a valid retained audit')
            elif item['id'] in required[:required.index('start-base') + 1]:
                require(item['outcome'] == 'passed', 'Claimed runtime execution failed before service startup')
        require(inner.get('repository') == {'head': record['identity']['tested'], 'tree': record['identity']['tree'], 'dirty': False},
                'Runtime checked a different or dirty repository')
        for name, expected in (('repository-head', record['identity']['tested']), ('repository-tree', record['identity']['tree']),
                               ('repository-status', '')):
            require(safe_path(directory, 'runtime/logs/' + name + '.txt').read_text().strip() == expected,
                    'Runtime repository command output differs')
        for name, source in record['inputs']['pins']['sources'].items():
            require(safe_path(directory, 'runtime/logs/' + name + '-head.txt').read_text().strip() == source['commit'],
                    'Runtime fetched a different upstream commit')
        verify_runtime_contexts(inner, directory, record)
    if expected_status == 'passed':
        require(inner.get('runtimeStartAttempted') is True and inner.get('runtimeExecuted') is True
                and inner.get('prerequisites', {}).get('passed') is True and inner.get('cancelledSignal') is None,
                'Runtime success lacks actual service execution or contradicts interruption')
        required = runtime_core_stages(record['inputs']['pins'])
        require([item['id'] for item in commands if item['id'] in required] == required
                and all(item['outcome'] == 'passed' for item in commands),
                'Runtime success omitted or failed a mandatory stage')
    if inner.get('browserPassed') is True:
        require(len(core) == len(required) and all(item['outcome'] == 'passed' or item['id'].endswith('-audit')
                                                 for item in core), 'Browser success lacks completed real service stages')
        running = json_file(safe_path(directory, 'runtime/containers-running.json'))
        runtime.validate_owned_containers(running, record['runtimeRunId'], require_services=True)
        inspected = [item for item in commands if re.fullmatch(r'container-inspect-[0-9]+', item['id'])]
        require(inspected and inspected[-1]['outcome'] == 'passed'
                and json_file(safe_path(directory, 'runtime/logs/' + inspected[-1]['id'] + '.txt')) == running,
                'Owned running-container receipt differs from the real Docker inspection')
        for service, context in inner['contexts'].items():
            require(json_file(safe_path(directory, 'runtime/logs/identity-' + service + '.txt')) == context,
                    'Running container build identity differs from its source context')
        require(json_file(safe_path(directory, 'runtime/logs/service-readiness.txt')) == {
            'runId': record['runtimeRunId'], 'modelSha256': inner['contexts']['hubs-client']['derivedModel']['sha256'],
            'reticulumStatus': 200}, 'Readiness did not bind the actual served model and Reticulum response')
    browser = directory / 'runtime/browser/browser-checks.json'
    if browser.exists():
        report = json_file(browser)
        input_value = json_file(directory / 'runtime/browser/input.json')
        require(report.get('runId') == record['runtimeRunId'] and report.get('input') == input_value
                and input_value.get('sources') == record['inputs']['runtime']
                and input_value.get('fixtures') == record['inputs']['fixtures']
                and input_value.get('browserOverride') is False
                and input_value.get('modelFingerprint') == inner.get('contexts', {}).get('hubs-client', {}).get('derivedModel')
                and input_value.get('modelUrl') == inner.get('contexts', {}).get('hubs-client', {}).get('modelUrl')
                and input_value.get('upstreamTrees') == inner.get('upstreamTrees'), 'Browser evidence uses different inputs')
        stage = next((item for item in commands if item['id'] == 'two-client-browser'), None)
        require(stage is not None, 'Browser evidence has no runtime command')
        within(stage, report)
        log = safe_path(directory, 'runtime/logs/two-client-browser.txt').read_text()
        summaries = [json.JSONDecoder().raw_decode(log[match.start():])[0]
                     for match in re.finditer(r'^\{\s*"runId"\s*:', log, re.MULTILINE)]
        require(summaries == [{'runId': record['runtimeRunId'], 'runStatus': report.get('runStatus'), 'counts': report.get('counts')}],
                'Browser command stdout does not bind the exact run and recorded outcome')
        if inner.get('browserPassed') is True:
            runtime.validate_browser(report, input_value)
            require(stage['outcome'] == 'passed', 'Failed browser command labeled passed')
            for name, expected in report['screenshots'].items():
                require(fingerprint(directory, 'runtime/browser/' + name) == expected, 'Screenshot binding differs')
                runtime.load_shared(record['inputs']['pins']).validate_png(safe_path(directory, 'runtime/browser/' + name).read_bytes())
    else:
        require(inner.get('browserPassed') is False, 'Browser success claimed without a report')


def assess(record, directory):
    """Recompute the limited outcome. A valid failed diagnostic stays failed."""
    issues = []
    run = json_file(directory / 'phases/run.json')
    cleanup = json_file(directory / 'phases/cleanup.json')
    for phase in (run, cleanup):
        require(phase.get('identity') == record['identity'] and phase.get('runtimeRunId') == record['runtimeRunId']
                and phase.get('inputs') == record['inputs'], 'Phase belongs to a different run/source')
        require(isinstance(phase.get('failures'), list) and all(isinstance(item, str) for item in phase['failures']),
                'Malformed phase failure list')
        within(record, phase)
    commands = run.get('commands', [])
    require(isinstance(commands, list) and [item.get('id') for item in commands] == list(SETUP[:len(commands)]),
            'Setup command order differs')
    expected = setup_commands(record['checkoutRoot'], record['stateRoot'])
    for item in commands:
        validate_command(item, directory, 'logs/', item['id'], expected[item['id']])
        require(item.get('cwd') == record['checkoutRoot'] + '/evaluations/hubs-spoke', 'Setup command CWD differs')
        within(run, item)
    if any(item['id'] == 'node-version' and item['outcome'] == 'passed' for item in commands):
        require(safe_path(directory, 'logs/node-version.txt').read_text().strip() == 'v' + (ROOT / '.nvmrc').read_text().strip(),
                'Node command output differs from the repository pin')
    if len(commands) != len(SETUP) or any(item.get('outcome') != 'passed' for item in commands):
        issues.append('Required hosted setup commands did not all pass')
    if run.get('failures') or run.get('cancelledSignal') is not None or run.get('sourcesUnchanged') is not True:
        issues.append('Run phase failed, was interrupted, or lost source identity')
    validate_absence_claim(cleanup, record, directory)
    if cleanup.get('failures') or cleanup.get('shutdownPassed') is not True or cleanup.get('sourcesUnchanged') is not True:
        issues.append('Owned watchdog cleanup or source verification failed')
    processes = cleanup.get('processes')
    if not isinstance(processes, list) or any(not isinstance(item, dict) or item.get('error')
                                            or item.get('stopped') is not True or item.get('killSent') is not False for item in processes):
        issues.append('Owned process shutdown was incomplete or required forced termination')
    if cleanup.get('supervisorsRemaining') != [] or cleanup.get('docker', {}).get('containersNetworksVolumesImagesAbsent') is not True:
        issues.append('Owned processes or Docker resources were not proved absent')
    regression = directory / 'reports/watchdog-checks.json'
    if any(item['id'] == 'watchdog-regressions' and item['outcome'] == 'passed' for item in commands):
        receipt = json_file(regression)
        stage = next(item for item in commands if item['id'] == 'watchdog-regressions')
        require(receipt.get('cases') == [{'id': name, 'status': 'passed'} for name in WATCHDOG_CASES]
                and receipt.get('counts') == {'passed': 2, 'failed': 0, 'checks': 2}
                and receipt.get('pythonOptimized') is True and receipt.get('sources') == record['inputs']['runtime']
                and 'fatal' not in receipt,
                'Actual watchdog regression evidence is incomplete')
        within(stage, receipt)
    inner_path = directory / 'runtime/manifest.json'
    if inner_path.exists():
        inner = json_file(inner_path)
        validate_inner(inner, directory, record)
        within(run, inner)
        if run.get('runtimeReturned') is not True or inner.get('overallStatus') != 'passed':
            issues.append('Runtime did not finish with clean audits, nine browser checks and clean shutdown')
    else:
        require(run.get('runtimeReturned') is not True, 'Runtime return claimed without its manifest')
        issues.append('Runtime has no completed manifest; retained evidence is partial')
    if record.get('finalSourcesUnchanged') is not True:
        issues.append('Source or checkout identity changed before final collection')
    return issues


def verify_record(record, directory, expected, current):
    require(record.get('schemaVersion') == 1 and record.get('kind') == 'f04-hubs-runtime-hosted'
            and record.get('mode') == 'hosted' and record.get('qualificationStatus') == 'incomplete',
            'Wrong artifact kind or full qualification claim')
    validate_identity(record.get('identity'))
    require(record['identity'] == expected and record.get('inputs') == current, 'Requested run or current checked source differs')
    require(re.fullmatch(r'f04-[0-9a-f]{16}', record.get('runtimeRunId', '')), 'Missing unique runtime identity')
    checkout_root = record.get('checkoutRoot')
    require(isinstance(checkout_root, str) and Path(checkout_root).is_absolute()
            and record.get('stateRoot') == checkout_root + '/artifacts/f04-runtime-state', 'Invalid runtime path identity')
    require(record.get('files') == inventory(directory), 'Artifact length, hash or allowlist differs')
    require('phases/run.json' in record['files'] and 'phases/cleanup.json' in record['files'], 'Missing always-cleanup receipts')
    issues = assess(record, directory)
    require(record.get('failures') == issues, 'Declared outcome omits concrete failures')
    status = 'failed' if issues else 'passed'
    require(record.get('runStatus') == status and record.get('complete') is (status == 'passed'),
            'Failed diagnostic was mislabeled as complete or successful')
    return status
