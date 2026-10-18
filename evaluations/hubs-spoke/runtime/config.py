"""Pure configuration and fixture adapters for the isolated F04 runtime probe."""
import hashlib
import json
from pathlib import Path
import re
import struct
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
BUNDLE = ROOT.parent
REPOSITORY = BUNDLE.parent.parent
LABEL = 'org.browser-vr-engine.f04-run'
SERVICES = ('db', 'dialog', 'hubs-client', 'reticulum')
CHECKS = (
    'native-reticulum-room-created', 'both-renderers-load-retained-f03-export',
    'two-distinct-reticulum-sessions-and-mutual-presence',
    'real-dialog-audio-transports-and-packets', 'alpha-keyboard-pose-reaches-beta',
    'beta-keyboard-pose-reaches-alpha', 'closed-client-leaves-native-presence',
    'same-browser-rejoin-restores-native-pose-flow', 'no-late-browser-or-cleanup-errors',
)
METADATA = ('world.json', 'catalog.json', 'scenario.json', 'thresholds.json', 'workloads.json',
            'devices.json', 'schema-set.json', 'comparison.json')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def fingerprint(path):
    data = Path(path).read_bytes()
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def contained(root, name):
    require(isinstance(name, str) and re.fullmatch(r'[A-Za-z0-9._/-]+', name)
            and not name.startswith('/') and all(p not in ('', '.', '..') for p in name.split('/')),
            'Unsafe relative path')
    result = (Path(root) / name).resolve(strict=True)
    require(result.is_relative_to(Path(root).resolve()) and result.is_file(), 'Path escapes input root')
    return result


def pins():
    value = json.loads((ROOT / 'pins.json').read_text())
    require(value.get('schemaVersion') == 1 and set(value['sources']) == {'hubs', 'compose', 'reticulum', 'dialog'},
            'Unexpected runtime source contract')
    for key, item in value['sources'].items():
        require(re.fullmatch(r'[0-9a-f]{40}', item['commit']) is not None, 'Source must use a full commit')
        require(item['repository'].startswith('https://github.com/Hubs-Foundation/')
                and item['repository'].endswith('.git') and item['files'], 'Unexpected source location')
    for item in value['images']['images'].values():
        require(re.fullmatch(r'(library/(node|elixir|postgres)|hexpm/elixir)@sha256:[0-9a-f]{64}', item['image'])
                and item['platform'] == 'linux/amd64', 'Image must have a fixed Linux amd64 digest')
    require(set(value['images']['images']) == {'hubs', 'dialog', 'reticulum', 'db'}, 'Unexpected image set')
    return value


def verified_fixtures(fixture_root, pin_value):
    fixture_root = Path(fixture_root).resolve(strict=True)
    comparison = json.loads(contained(fixture_root, 'comparison.json').read_text())
    expected = json.loads((BUNDLE / 'fixture-pins.json').read_text())
    require(comparison == expected, 'F03 comparison differs from the frozen inputs')
    require(set(pin_value['fixtureMetadata']) == set(METADATA), 'Frozen metadata inventory differs')
    files = {}
    for name in METADATA:
        path = contained(fixture_root, name)
        actual = fingerprint(path)
        # Exact source bytes avoid reimplementing ECMAScript number formatting
        # in Python. The existing F03 comparison is also checked unchanged above.
        require(actual == pin_value['fixtureMetadata'][name], 'Frozen F03 metadata changed: ' + name)
        files[name] = actual
    catalog = json.loads(contained(fixture_root, 'catalog.json').read_text())
    for row in catalog['resources']:
        require(row['path'] not in files, 'Duplicate fixture path')
        path = contained(fixture_root, row['path'])
        actual = fingerprint(path)
        require(actual == {'bytes': row['sizeBytes'], 'sha256': row['sha256']}, 'Frozen F03 resource changed')
        files[row['path']] = actual
    export = pin_value['spokeExport']
    require(fingerprint(contained(BUNDLE, export['path'])) == {k: export[k] for k in ('bytes', 'sha256')},
            'Historical native Spoke export changed')
    return {'comparison': comparison, 'files': files, 'export': export}


def relocate_glb(data, run_id, resource_paths, spawn):
    require(re.fullmatch(r'f04-[0-9a-f]{16}', run_id), 'Invalid run identity')
    require(len(data) >= 20 and data[:4] == b'glTF' and struct.unpack_from('<II', data, 4) == (2, len(data)),
            'Invalid retained GLB envelope')
    length, kind = struct.unpack_from('<II', data, 12)
    require(kind == 0x4e4f534a and length % 4 == 0 and 20 + length <= len(data), 'Invalid GLB JSON chunk')
    document = json.loads(data[20:20 + length])
    replacements = []
    def visit(item):
        if isinstance(item, dict):
            return {key: visit(value) for key, value in item.items()}
        if isinstance(item, list):
            return [visit(value) for value in item]
        if isinstance(item, str) and item.startswith(('http:', 'https:', 'blob:')):
            parsed = urlsplit(item)
            require(parsed.scheme == 'https' and parsed.hostname == '127.0.0.1'
                    and parsed.path.startswith('/fixtures/') and not parsed.query and not parsed.fragment
                    and not parsed.username and not parsed.password, 'Unexpected exported external resource')
            path = parsed.path.removeprefix('/fixtures/')
            require(path in resource_paths, 'Export points outside frozen resources')
            relocated = f'https://hubs.local:8080/evaluation/{run_id}/fixtures/{path}'
            replacements.append({'from': item, 'to': relocated})
            return relocated
        return item
    document = visit(document)
    spawn_nodes = [n for n in document['nodes'] if n.get('extensions', {}).get('MOZ_hubs_components', {}).get('spawn-point') is not None]
    require(len(spawn_nodes) == 1, 'Expected one native Spoke spawn point')
    old_spawn = {key: spawn_nodes[0].get(key) for key in ('translation', 'rotation')}
    # The retained editor export places the prop at its post-edit [2,1,2]
    # position, over the template spawn. Use the F03 traversal checkpoint's X/Z
    # at floor height; preserve the source JSON and every mesh buffer.
    require(len(spawn) == 3 and all(type(x) in (int, float) for x in spawn), 'Invalid scenario spawn')
    spawn_nodes[0]['translation'] = [spawn[0], 0, spawn[2]]
    spawn_nodes[0]['rotation'] = [0, 0, 0, 1]
    raw = json.dumps(document, separators=(',', ':'), ensure_ascii=False).encode()
    raw += b' ' * (-len(raw) % 4)
    tail = data[20 + length:]
    output = b'glTF' + struct.pack('<IIII', 2, 20 + len(raw) + len(tail), len(raw), 0x4e4f534a) + raw + tail
    return output, {'urls': replacements, 'spawnBefore': old_spawn, 'spawnAfter': spawn_nodes[0]['translation'],
                    'binaryChunksPreserved': True, 'sourceIsRetainedEditorExport': True,
                    'clips': len(document.get('animations', [])), 'skins': len(document.get('skins', []))}


def make_compose(run_dir, run_id, pin_value):
    require(re.fullmatch(r'f04-[0-9a-f]{16}', run_id), 'Invalid Compose project identity')
    run_dir = Path(run_dir).resolve()
    images = pin_value['images']['images']
    common = {'init': True, 'restart': 'no', 'platform': 'linux/amd64',
              'labels': {LABEL: run_id}, 'security_opt': ['no-new-privileges:true'],
              'networks': ['runtime'], 'stop_grace_period': '15s', 'pids_limit': 256,
              'logging': {'driver': 'json-file', 'options': {'max-size': '8m', 'max-file': '1'}}}
    def service(name, memory):
        result = {**common, 'mem_limit': memory, 'cpus': 2.0}
        if name == 'db':
            result['image'] = images['db']['image']
        else:
            result['image'] = f'bve-f04/{name}:{run_id}'
            source_name = 'hubs' if name == 'hubs-client' else name
            result['build'] = {'context': str(run_dir / 'work/contexts' / name), 'dockerfile': 'Dockerfile',
                               'args': {'BASE_IMAGE': images[source_name]['image']}, 'labels': {LABEL: run_id}}
        return result
    private = str(run_dir / 'private')
    db = service('db', '512m')
    db.update({'environment': {'POSTGRES_PASSWORD': 'synthetic-local-only', 'POSTGRES_DB': 'ret_dev'},
               'volumes': ['database:/var/lib/postgresql/data'], 'healthcheck': {
                   'test': ['CMD-SHELL', 'pg_isready -U postgres -d ret_dev'], 'interval': '2s', 'timeout': '2s', 'retries': 30}})
    dialog = service('dialog', '768m')
    dialog.update({'environment': {'AUTH_KEY': '/run/bve/perms-public.pem', 'HTTPS_CERT_FULLCHAIN': '/run/bve/cert.pem',
                                   'HTTPS_CERT_PRIVKEY': '/run/bve/key.pem', 'INTERACTIVE': 'false',
                                   'MEDIASOUP_MIN_PORT': '40000', 'MEDIASOUP_MAX_PORT': '40050',
                                   'MEDIASOUP_ANNOUNCED_IP': '127.0.0.1'},
                   'ports': ['127.0.0.1:4443:4443', '127.0.0.1:40000-40050:40000-40050/udp',
                             '127.0.0.1:40000-40050:40000-40050/tcp'],
                   'volumes': [f'{private}/cert.pem:/run/bve/cert.pem:ro', f'{private}/key.pem:/run/bve/key.pem:ro',
                               f'{private}/perms-public.pem:/run/bve/perms-public.pem:ro'],
                   'healthcheck': {'test': ['CMD', 'node', '-e',
                       "require('http').get('http://127.0.0.1:7000/meta',r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>{try{const v=JSON.parse(b);process.exit(r.statusCode===200&&Number.isFinite(v.cap)&&v.cap>=0?0:1)}catch{process.exit(1)}})}).on('error',()=>process.exit(1))"],
                       'interval': '3s', 'timeout': '2s', 'retries': 30}})
    hubs = service('hubs-client', '4g')
    hubs.update({'environment': {'INTERNAL_HOSTNAME': 'hubs-client', 'NODE_OPTIONS': '--max-old-space-size=3072'},
                 'ports': ['127.0.0.1:8080:8080'],
                 'volumes': [f'{private}/cert.pem:/code/certs/cert.pem:ro', f'{private}/key.pem:/code/certs/key.pem:ro']})
    reticulum = service('reticulum', '1536m')
    reticulum.update({'environment': {'MIX_ENV': 'dev', 'DB_HOST': 'db', 'DIALOG_HOSTNAME': 'hubs.local', 'DIALOG_PORT': '4443',
                                     'HUBS_CLIENT_INTERNAL_HOSTNAME': 'hubs-client', 'HUBS_ADMIN_INTERNAL_HOSTNAME': 'unavailable-admin',
                                     'SPOKE_INTERNAL_HOSTNAME': 'unavailable-spoke', 'ERL_FLAGS': '+S 2:2'},
                       'ports': ['127.0.0.1:4000:4000'], 'volumes': [f'{private}:/run/bve:ro', 'storage:/code/storage/dev'],
                       'depends_on': {'db': {'condition': 'service_healthy'}, 'dialog': {'condition': 'service_healthy'}}})
    value = {'name': run_id, 'services': {'db': db, 'dialog': dialog, 'hubs-client': hubs, 'reticulum': reticulum},
             'networks': {'runtime': {'internal': True, 'labels': {LABEL: run_id}}},
             'volumes': {name: {'labels': {LABEL: run_id}} for name in ('database', 'storage')}}
    validate_compose(value, run_id)
    return value


def validate_compose(value, run_id):
    require(value.get('name') == run_id and set(value.get('services', {})) == set(SERVICES), 'Unexpected Compose scope')
    require(value.get('networks') == {'runtime': {'internal': True, 'labels': {LABEL: run_id}}}, 'Runtime network must be internal and owned')
    for name, item in value['services'].items():
        require(item.get('labels') == {LABEL: run_id} and item.get('networks') == ['runtime'], 'Unowned service')
        require(not item.get('privileged') and not item.get('network_mode') and not item.get('pid')
                and not item.get('devices') and not item.get('cap_add'), 'Unsafe service privilege')
        for port in item.get('ports', []):
            require(isinstance(port, str) and port.startswith('127.0.0.1:'), 'Host listeners must be loopback-only')
        if name == 'db':
            require(not item.get('ports'), 'Database must have no host listener')
        require(item.get('mem_limit') and item.get('pids_limit') == 256 and item.get('restart') == 'no', 'Unbounded runtime service')


def audit_verdict(report, exit_code):
    require(isinstance(report, dict) and report.get('auditReportVersion') == 2 and report.get('error') is None, 'Audit failed to produce a valid report')
    entries = report.get('vulnerabilities')
    counts = report.get('metadata', {}).get('vulnerabilities', {})
    levels = ('info', 'low', 'moderate', 'high', 'critical')
    require(isinstance(entries, dict) and all(type(counts.get(k)) is int and counts[k] >= 0 for k in (*levels, 'total')), 'Malformed audit counts')
    require(all(isinstance(v, dict) and v.get('severity') in levels for v in entries.values()), 'Malformed audit entry')
    require(counts['total'] == len(entries) and all(counts[k] == sum(v['severity'] == k for v in entries.values()) for k in levels), 'Contradictory audit counts')
    passed = counts['high'] + counts['critical'] == 0
    require(type(exit_code) is int and exit_code == (0 if passed else 1), 'Audit exit status contradicts the report')
    return {'valid': True, 'passed': passed, 'packageEntries': counts,
            'scope': 'npm package and metavulnerability graph; not a source-code, Hex, Python, OS or native-binary audit'}


def audit_allows_runtime(mode, verdicts):
    require(mode in ('evaluate', 'diagnose'), 'Unknown run mode')
    require(set(verdicts) == {'toolkit', 'hubs', 'dialog'} and all(v.get('valid') is True for v in verdicts.values()), 'All three real audits are mandatory')
    return mode == 'diagnose' or all(v.get('passed') is True for v in verdicts.values())


def overall_status(mode, verdicts, browser_passed, shutdown_passed, failures):
    # Diagnostic continuation is never a waiver. The same audit predicate is
    # used for both final statuses, irrespective of successful runtime findings.
    clear = set(verdicts) == {'toolkit', 'hubs', 'dialog'} and all(v.get('valid') is True and v.get('passed') is True for v in verdicts.values())
    return 'passed' if clear and browser_passed is True and shutdown_passed is True and failures == [] else 'failed'
