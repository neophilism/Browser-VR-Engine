"""Create source-bound build contexts; never start Docker or alter upstream checkouts."""
import difflib
import hashlib
import json
from pathlib import Path
import shutil
import tarfile
from config import BUNDLE, ROOT, contained, fingerprint, require, relocate_glb


def extract_source(archive, target):
    target = Path(target)
    require(not target.exists(), 'A build source context must be new')
    target.mkdir(parents=True)
    with tarfile.open(archive, 'r:') as stream:
        members = stream.getmembers()
        require(len(members) < 100000 and sum(m.size for m in members) <= 1024 * 1024 * 1024,
                'Source archive exceeds its budget')
        for member in members:
            path = Path(member.name)
            require(not path.is_absolute() and '..' not in path.parts
                    and '.git' not in path.parts and 'node_modules' not in path.parts,
                    'Unsafe source archive path')
            require(member.isdir() or member.isfile(), 'Source archive must contain regular files/directories only')
        stream.extractall(target, members=members, filter='data')


def verify_source(root, item):
    for name, expected in item['files'].items():
        require(fingerprint(contained(root, name)) == expected, 'Pinned upstream file changed: ' + name)


def patch_sources(context, source_name):
    patches = []
    def change(name, transform):
        path = contained(context, name)
        original = path.read_text()
        changed = transform(original)
        require(original != changed, 'Source adaptation made no change')
        path.write_text(changed)
        patch = ''.join(difflib.unified_diff(original.splitlines(True), changed.splitlines(True),
                                          fromfile='a/' + name, tofile='b/' + name))
        patches.append({'file': name, 'before': hashlib.sha256(original.encode()).hexdigest(),
                        'after': hashlib.sha256(changed.encode()).hexdigest(), 'patch': patch})
    if source_name == 'hubs':
        def local_ice(text):
            start = text.index('  getIceServers(host, port, turn) {')
            end = text.index('\n  /**', start)
            return text[:start] + '''  getIceServers(host, port, _turn) {
    // F04 local diagnostic only: no external STUN/TURN or NAT claim.
    if (host !== "hubs.local" || Number(port) !== 4443) {
      throw new Error("F04 diagnostic requires its owned loopback Dialog endpoint");
    }
    this._serverUrl = `wss://${host}:${port}`;
    return [];
  }
''' + text[end:]
        change('src/naf-dialog-adapter.js', local_ice)
    elif source_name == 'dialog':
        def bounded_worker(text):
            require(text.count('module.exports = config;') == 1, 'Dialog configuration anchor changed')
            return text.replace('module.exports = config;', '''// F04 loopback diagnostic: one real worker; one advertised loopback candidate.
config.mediasoup.numWorkers = 1;
config.mediasoup.webRtcTransportOptions.listenIps = [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }];
module.exports = config;''')
        change('config.js', bounded_worker)
    elif source_name == 'reticulum':
        def no_hot_reload(text):
            require(text.count('code_reloader: true') == 1, 'Reticulum reload configuration anchor changed')
            return text.replace('code_reloader: true', 'code_reloader: false')
        change('config/dev.exs', no_hot_reload)
        change('config/runtime.exs', lambda text: text + '\n' + (ROOT / 'reticulum-config.exs').read_text())
    return patches


def prepare_contexts(run_dir, run_id, pin_value, fixture_root, fixture_identity, source_trees):
    run_dir, fixture_root = Path(run_dir), Path(fixture_root)
    contexts = run_dir / 'work/contexts'
    result = {}
    for source_name, service in (('hubs', 'hubs-client'), ('dialog', 'dialog'), ('reticulum', 'reticulum')):
        context = contexts / service
        source = context / 'source'
        extract_source(run_dir / 'work' / (source_name + '.tar'), source)
        verify_source(source, pin_value['sources'][source_name])
        adaptations = patch_sources(source, source_name)
        shutil.copyfile(ROOT / 'dockerfiles' / (source_name + '.Dockerfile'), context / 'Dockerfile')
        shutil.copyfile(ROOT / 'git-config', context / 'git-config')
        (context / '.dockerignore').write_text('source/.git\nsource/node_modules\nsource/.env\nsource/.env.*\n')
        identity = {'schemaVersion': 1, 'runId': run_id, 'source': source_name,
                    'commit': pin_value['sources'][source_name]['commit'], 'tree': source_trees[source_name],
                    'files': pin_value['sources'][source_name]['files'], 'adaptations': adaptations,
                    'baseImage': pin_value['images']['images'][source_name]['image']}
        if source_name == 'hubs':
            public = source / 'public/evaluation' / run_id
            require(not public.exists(), 'Fixture publication directory already exists')
            public.mkdir(parents=True)
            for name in fixture_identity['files']:
                target = public / 'fixtures' / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(contained(fixture_root, name), target)
            scenario = json.loads(contained(fixture_root, 'scenario.json').read_text())
            checkpoint = next(step for step in scenario['steps'] if step['id'] == 'walk-through-arch')
            glb, relocation = relocate_glb(contained(BUNDLE, pin_value['spokeExport']['path']).read_bytes(),
                                           run_id, fixture_identity['files'], checkpoint['position'])
            (public / 'courtyard.glb').write_bytes(glb)
            identity['fixture'] = fixture_identity
            identity['relocation'] = relocation
            identity['derivedModel'] = fingerprint(public / 'courtyard.glb')
            identity['modelUrl'] = f'https://hubs.local:8080/evaluation/{run_id}/courtyard.glb'
        else:
            bootstrap = context / 'bootstrap'
            bootstrap.mkdir()
            names = ('hex.ez', 'rebar3') if source_name == 'reticulum' else tuple(v['filename'] for v in pin_value['wheels'].values())
            for name in names:
                shutil.copyfile(run_dir / 'work/bootstrap' / name, bootstrap / name)
        (context / 'build-identity.json').write_text(json.dumps(identity, indent=2) + '\n')
        result[service] = identity
    return result
