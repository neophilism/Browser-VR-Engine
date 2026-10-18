"""Pure fixture/security/evidence checks; these do not simulate a successful backend."""
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import struct
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import (BUNDLE, REPOSITORY, CHECKS, LABEL, SERVICES, audit_allows_runtime, audit_verdict,
                    fingerprint, make_compose, overall_status, pins, relocate_glb, validate_compose,
                    verified_fixtures)
from prepare import extract_source, patch_sources, verify_source
from run import (bounded_timeout, collect_artifacts, environment, load_shared, reject_project_configuration,
                 runtime_sources, safe_proxy, validate_browser, validate_owned_containers, verified_shared)
from download import download


class RuntimeChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pin = pins()
        cls.fixtures = REPOSITORY / 'packages/qualification-fixtures/fixtures'
        cls.export = BUNDLE / cls.pin['spokeExport']['path']
        cls.identity = verified_fixtures(cls.fixtures, cls.pin)

    def test_source_and_image_pins_are_immutable_and_existing_pins_match(self):
        old = json.loads((BUNDLE / 'source-pins.json').read_text())['sources']
        for name in ('hubs', 'compose'):
            self.assertEqual(self.pin['sources'][name]['commit'], old[name]['commit'])
            for filename, expected in old[name]['files'].items():
                self.assertEqual(self.pin['sources'][name]['files'][filename]['sha256'], expected['original'])
        self.assertEqual(fingerprint(self.export), {k: self.pin['spokeExport'][k] for k in ('bytes', 'sha256')})
        self.assertEqual(len(self.pin['wheels']), 4)
        for item in self.pin['images']['images'].values():
            self.assertRegex(item['image'], r'@sha256:[0-9a-f]{64}$')

    def test_reviewed_shared_supervisor_hashes_are_current(self):
        shared = load_shared(self.pin)
        self.assertTrue(callable(shared.run_command))
        mutation = copy.deepcopy(self.pin)
        mutation['sharedSupervisor']['command-supervisor.py']['sha256'] = '0' * 64
        with self.assertRaises(RuntimeError):
            load_shared(mutation)
        with tempfile.TemporaryDirectory() as temporary:
            snapshot = Path(temporary) / 'process-owner'
            copied = load_shared(self.pin, snapshot)
            self.assertEqual(Path(copied.__file__).parent, snapshot)
            self.assertEqual(verified_shared(self.pin, snapshot), verified_shared(self.pin))
            target = snapshot / 'command-supervisor.py'
            target.chmod(0o600)
            target.write_bytes(target.read_bytes() + b'\n# synthetic concurrent change\n')
            with self.assertRaises(RuntimeError):
                verified_shared(self.pin, snapshot)
            self.assertTrue(verified_shared(self.pin))

    def test_stage_budget_cannot_extend_the_original_overall_deadline(self):
        self.assertEqual(bounded_timeout(3000, 300, 1000), 300)
        self.assertEqual(bounded_timeout(3000, 300, 2999.75), .25)
        self.assertEqual(bounded_timeout(3000, 60, 2990), 10)
        for current in (3000, 3001):
            with self.subTest(current=current), self.assertRaises(RuntimeError):
                bounded_timeout(3000, 300, current)

    def test_project_package_configuration_is_rejected_before_npm(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            package = root / 'parent/package'
            package.mkdir(parents=True)
            reject_project_configuration(package)
            for directory in (package, package.parent):
                for name in ('.npmrc', '.yarnrc', '.yarnrc.yml'):
                    target = directory / name
                    target.write_text('synthetic project configuration; never consumed\n')
                    with self.subTest(directory=directory.name, name=name), self.assertRaises(RuntimeError):
                        reject_project_configuration(package)
                    target.unlink()
            target = package / '.npmrc'
            target.symlink_to(root / 'missing')
            with self.assertRaises(RuntimeError):
                reject_project_configuration(package)
            target.unlink()
            (package / 'node_modules').symlink_to(root / 'missing')
            with self.assertRaises(RuntimeError):
                reject_project_configuration(package)

    def test_proxy_credentials_and_control_characters_never_reach_child_environment(self):
        self.assertEqual(safe_proxy('https://proxy.example:8443'), 'https://proxy.example:8443')
        for value in ('http://synthetic-user:synthetic-password@proxy.example',
                      'https://synthetic-user@proxy.example', 'https://proxy.example?synthetic=secret',
                      'http://proxy.example\r\nheader:value', 'file:///private', ''):
            with self.subTest(kind='synthetic malformed setting'), self.assertRaises(RuntimeError):
                safe_proxy(value)
        with tempfile.TemporaryDirectory() as temporary, patch.dict(os.environ, {
            'HTTPS_PROXY': 'http://synthetic-user:synthetic-password@proxy.example',
        }):
            with self.assertRaises(RuntimeError):
                environment(Path(temporary))

    def test_download_child_verifies_bytes_and_never_overwrites_a_prior_file(self):
        data = b'synthetic pinned public bootstrap\n'
        item = {'url': 'https://files.pythonhosted.org/synthetic.whl', 'bytes': len(data),
                'sha256': hashlib.sha256(data).hexdigest()}
        with tempfile.TemporaryDirectory() as temporary, patch('download.pins', return_value={
            'bootstrap': {'synthetic': item}, 'wheels': {},
        }), patch('download.urllib.request.build_opener') as opener:
            response = opener.return_value.open.return_value.__enter__.return_value
            response.read.return_value = data + b'changed'
            with self.assertRaises(RuntimeError):
                download('synthetic', temporary)
            target = Path(temporary) / 'synthetic'
            self.assertFalse(target.exists())
            response.read.return_value = data
            download('synthetic', temporary)
            self.assertEqual(target.read_bytes(), data)
            with self.assertRaises(RuntimeError):
                download('synthetic', temporary)
            self.assertEqual(target.read_bytes(), data)

    def test_frozen_fixture_bytes_and_metadata_are_all_checked(self):
        self.assertEqual(len(self.identity['files']), 19)
        for path in ('world.json', 'audio/corner-0.wav', 'models/creature.gltf'):
            with self.subTest(path=path), tempfile.TemporaryDirectory() as temporary:
                copy_root = Path(temporary) / 'fixtures'
                shutil.copytree(self.fixtures, copy_root)
                target = copy_root / path
                if path.endswith('.json'):
                    data = json.loads(target.read_text())
                    data['id'] = 'changed'
                    target.write_text(json.dumps(data))
                else:
                    target.write_bytes(target.read_bytes() + b'changed')
                with self.assertRaises(RuntimeError):
                    verified_fixtures(copy_root, self.pin)

    def test_fixture_symlink_cannot_read_outside_fixture_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            copy_root = Path(temporary) / 'fixtures'
            shutil.copytree(self.fixtures, copy_root)
            outside = Path(temporary) / 'outside.wav'
            outside.write_bytes((copy_root / 'audio/corner-0.wav').read_bytes())
            (copy_root / 'audio/corner-0.wav').unlink()
            (copy_root / 'audio/corner-0.wav').symlink_to(outside)
            with self.assertRaises(RuntimeError):
                verified_fixtures(copy_root, self.pin)

    def test_retained_native_glb_is_relocated_without_geometry_or_clip_changes(self):
        original = self.export.read_bytes()
        generated, receipt = relocate_glb(original, 'f04-' + '1' * 16, self.identity['files'], [0, 1.6, -4])
        old_length = struct.unpack_from('<I', original, 12)[0]
        new_length = struct.unpack_from('<I', generated, 12)[0]
        self.assertEqual(original[20 + old_length:], generated[20 + new_length:])
        self.assertEqual(len(generated), struct.unpack_from('<I', generated, 8)[0])
        old = json.loads(original[20:20 + old_length])
        new = json.loads(generated[20:20 + new_length])
        for field in ('meshes', 'accessors', 'bufferViews', 'skins', 'animations'):
            self.assertEqual(old[field], new[field])
        self.assertEqual(receipt['clips'], 2)
        self.assertEqual(receipt['skins'], 1)
        self.assertEqual(len(receipt['urls']), 6)
        self.assertEqual(receipt['spawnAfter'], [0, 0, -4])
        self.assertEqual(self.export.read_bytes(), original)

    def test_glb_relocation_rejects_external_or_unknown_resource_urls(self):
        original = self.export.read_bytes()
        size = struct.unpack_from('<I', original, 12)[0]
        base = json.loads(original[20:20 + size])
        for url in ('https://evil.invalid/a.wav', 'https://127.0.0.1:9194/fixtures/private.wav',
                    'https://user:password@127.0.0.1:9194/fixtures/audio/corner-0.wav', 'blob:wrong'):
            with self.subTest(url=url):
                value = copy.deepcopy(base)
                value['untrusted'] = url
                body = json.dumps(value).encode()
                body += b' ' * (-len(body) % 4)
                data = b'glTF' + struct.pack('<IIII', 2, 20 + len(body), len(body), 0x4e4f534a) + body
                with self.assertRaises(RuntimeError):
                    relocate_glb(data, 'f04-' + '1' * 16, self.identity['files'], [0, 1.6, -4])

    def test_archive_unpack_rejects_traversal_links_and_special_files(self):
        for name, kind in (('../escape', tarfile.REGTYPE), ('/absolute', tarfile.REGTYPE),
                           ('link', tarfile.SYMTYPE), ('hard', tarfile.LNKTYPE), ('fifo', tarfile.FIFOTYPE),
                           ('.git/config', tarfile.REGTYPE)):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                archive = Path(temporary) / 'source.tar'
                with tarfile.open(archive, 'w') as stream:
                    member = tarfile.TarInfo(name)
                    member.type = kind
                    if kind == tarfile.REGTYPE:
                        member.size = 1
                        stream.addfile(member, io.BytesIO(b'x'))
                    else:
                        member.linkname = '/outside'
                        stream.addfile(member)
                with self.assertRaises(RuntimeError):
                    extract_source(archive, Path(temporary) / 'context')
                self.assertFalse((Path(temporary) / 'escape').exists())

    def test_regular_source_archive_is_extracted_and_hash_checked(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / 'source.tar'
            data = b'public pinned source\n'
            with tarfile.open(archive, 'w') as stream:
                member = tarfile.TarInfo('src/file.js')
                member.size = len(data)
                stream.addfile(member, io.BytesIO(data))
            target = Path(temporary) / 'context'
            extract_source(archive, target)
            expected = {'files': {'src/file.js': fingerprint(target / 'src/file.js')}}
            verify_source(target, expected)
            (target / 'src/file.js').write_bytes(data + b'changed')
            with self.assertRaises(RuntimeError):
                verify_source(target, expected)

    def test_compose_is_four_bounded_internal_services_with_loopback_publishing(self):
        value = make_compose('/tmp/unique-f04-run', 'f04-' + '2' * 16, self.pin)
        self.assertEqual(set(value['services']), set(SERVICES))
        self.assertEqual(set(value['volumes']), {'database', 'storage'})
        self.assertNotIn('ports', value['services']['db'])
        self.assertTrue(value['networks']['runtime']['internal'])
        for name, item in value['services'].items():
            if name != 'db':
                self.assertIn('@sha256:', item['build']['args']['BASE_IMAGE'])
            self.assertNotIn('/var/run/docker.sock', json.dumps(item))
            self.assertNotIn('HOME', item.get('environment', {}))

    def test_compose_rejects_nonlocal_or_privileged_scope(self):
        original = make_compose('/tmp/unique-f04-run', 'f04-' + '2' * 16, self.pin)
        mutations = [lambda v: v['services']['dialog'].update(ports=['0.0.0.0:4443:4443']),
                     lambda v: v['services']['db'].update(ports=['127.0.0.1:5432:5432']),
                     lambda v: v['services']['dialog'].update(privileged=True),
                     lambda v: v['services']['dialog'].update(network_mode='host'),
                     lambda v: v['services']['dialog'].update(labels={}),
                     lambda v: v['networks']['runtime'].update(internal=False)]
        for mutate in mutations:
            value = copy.deepcopy(original)
            mutate(value)
            with self.assertRaises(RuntimeError):
                validate_compose(value, 'f04-' + '2' * 16)

    def test_audit_must_be_valid_and_agree_with_real_exit(self):
        report = {'auditReportVersion': 2, 'vulnerabilities': {'old-package': {'severity': 'high'}},
                  'metadata': {'vulnerabilities': {'info':0, 'low':0, 'moderate':0, 'high':1, 'critical':0, 'total':1}}}
        verdict = audit_verdict(report, 1)
        self.assertFalse(verdict['passed'])
        self.assertTrue(verdict['valid'])
        for mutate, code in ((lambda v: v.update(error={}), 1), (lambda v: v.update(error={'code':'EAI_AGAIN'}), 1),
                             (lambda v: v['metadata']['vulnerabilities'].update(total=2), 1),
                             (lambda v: v['metadata']['vulnerabilities'].update(high=True), 1),
                             (lambda v: v.update(auditReportVersion=1), 1), (lambda v: None, 0), (lambda v: None, None)):
            value = copy.deepcopy(report)
            mutate(value)
            with self.assertRaises(RuntimeError):
                audit_verdict(value, code)

    def test_diagnostic_continuation_cannot_waive_a_failed_audit(self):
        verdicts = {name: {'valid':True,'passed':name != 'hubs'} for name in ('toolkit','hubs','dialog')}
        self.assertFalse(audit_allows_runtime('evaluate', verdicts))
        self.assertTrue(audit_allows_runtime('diagnose', verdicts))
        self.assertEqual(overall_status('diagnose', verdicts, True, True, []), 'failed')
        for name in verdicts:
            missing = copy.deepcopy(verdicts)
            del missing[name]
            with self.assertRaises(RuntimeError):
                audit_allows_runtime('diagnose', missing)
        passed = {name: {'valid':True,'passed':True} for name in verdicts}
        self.assertEqual(overall_status('evaluate', passed, True, True, []), 'passed')
        self.assertEqual(overall_status('evaluate', passed, True, False, []), 'failed')

    def test_environment_has_no_credentials_home_rewrite_or_inherited_docker_target(self):
        with tempfile.TemporaryDirectory() as temporary, patch.dict(os.environ, {
            'MESHY_API_KEY':'synthetic-never-use', 'GITHUB_TOKEN':'synthetic-never-use', 'NODE_AUTH_TOKEN':'synthetic-never-use',
            'HOME':'/original-home', 'USERPROFILE':'original-profile', 'NODE_OPTIONS':'--require hostile.js',
            'DOCKER_HOST':'tcp://external.invalid:2375', 'SSH_AUTH_SOCK':'/private/socket', 'CHROME_EXECUTABLE':'',
        }):
            value = environment(Path(temporary))
            for name in ('MESHY_API_KEY','GITHUB_TOKEN','NODE_AUTH_TOKEN','HOME','USERPROFILE','NODE_OPTIONS','DOCKER_HOST','SSH_AUTH_SOCK'):
                self.assertNotIn(name, value)
            self.assertEqual(os.environ['HOME'], '/original-home')
            self.assertEqual(Path(value['npm_config_userconfig']).read_bytes(), b'')

    def test_container_ownership_scope_and_host_bindings_are_verified(self):
        run_id = 'f04-' + 'a' * 16
        def row(service):
            return {'Config': {'Labels': {'com.docker.compose.project':run_id, LABEL:run_id,
                                         'com.docker.compose.service':service}}, 'State':{'Running':True},
                    'HostConfig':{'Privileged':False,'NetworkMode':run_id + '_runtime'},
                    'NetworkSettings':{'Ports': {'4443/tcp':[{'HostIp':'127.0.0.1','HostPort':'4443'}]}}}
        records = [row(service) for service in SERVICES]
        validate_owned_containers(records, run_id, True)
        mutations = [lambda v: v[0]['Config']['Labels'].pop(LABEL),
                     lambda v: v[0]['Config']['Labels'].update({'com.docker.compose.project':'other'}),
                     lambda v: v[0]['NetworkSettings']['Ports']['4443/tcp'][0].update(HostIp='0.0.0.0'),
                     lambda v: v[0]['State'].update(Running=False),
                     lambda v: v[0]['HostConfig'].update(Privileged=True), lambda v: v.pop()]
        for mutate in mutations:
            value = copy.deepcopy(records)
            mutate(value)
            with self.assertRaises(RuntimeError):
                validate_owned_containers(value, run_id, True)

    def test_browser_verifier_rejects_stale_and_contradictory_success(self):
        expected = {'runId':'f04-' + '1' * 16, 'sources':runtime_sources()}
        baseline = {'schemaVersion':1, 'runId':expected['runId'], 'input':expected, 'runStatus':'passed',
                    'counts':{'passed':9,'failed':0}, 'checks':[{'id':name,'status':'passed'} for name in CHECKS],
                    'errors':[], 'failedRequests':[], 'blockedRequests':[], 'cleanupErrors':[], 'fatal':None,
                    'cleanupSettled':True, 'screenshots':{'alpha.png':{},'beta.png':{}}}
        validate_browser(baseline, expected)
        mutations = [lambda v: v.update(runId='f04-' + '2' * 16), lambda v: v['input'].update(sources={}),
                     lambda v: v.update(fatal=''), lambda v: v.update(fatal=False), lambda v: v.update(cleanupSettled=False),
                     lambda v: v['errors'].append('late error'), lambda v: v['failedRequests'].append('late request'),
                     lambda v: v['blockedRequests'].append('egress'), lambda v: v['cleanupErrors'].append('late closure'),
                     lambda v: v['checks'][0].update(status='failed'), lambda v: v['checks'].reverse(),
                     lambda v: v['screenshots'].update({'../../private/key.pem':{}})]
        for mutate in mutations:
            value = copy.deepcopy(baseline)
            mutate(value)
            with self.assertRaises(RuntimeError):
                validate_browser(value, expected)

    def test_artifact_collection_excludes_private_keys_and_unlisted_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'logs').mkdir()
            (root / 'logs/ordinary.txt').write_text('bounded public diagnostic\n')
            # Synthetic marker only, not a key. It must still be rejected.
            (root / 'logs/private.txt').write_text('-----BEGIN ' + 'PRIVATE KEY-----\nsynthetic\n')
            (root / 'full-source.tar').write_bytes(b'not an allowed artifact')
            files, failures = collect_artifacts(root)
            self.assertEqual(set(files), {'logs/ordinary.txt'})
            self.assertEqual(len(failures), 2)


if __name__ == '__main__':
    unittest.main(verbosity=2)
