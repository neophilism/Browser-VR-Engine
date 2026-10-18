"""Owned Docker teardown shared by the launcher and the hosted failure watchdog."""
import json
from pathlib import Path
import re
from config import LABEL, SERVICES, make_compose, require

DOCKER = ['docker', '--host', 'unix:///var/run/docker.sock']


def validate_containers(records, run_id, require_services=False):
    require(isinstance(records, list) and len(records) <= 8, 'Unexpected container inspection')
    observed = set()
    for row in records:
        labels = row.get('Config', {}).get('Labels', {})
        require(labels.get('com.docker.compose.project') == run_id and labels.get(LABEL) == run_id,
                'Refusing an unowned Compose resource')
        service = labels.get('com.docker.compose.service')
        require(service in SERVICES, 'Unexpected owned service')
        if labels.get('com.docker.compose.oneoff', '').lower() != 'true':
            observed.add(service)
        require(not row.get('HostConfig', {}).get('Privileged')
                and row.get('HostConfig', {}).get('NetworkMode') != 'host', 'Unsafe container runtime privilege')
        for entries in (row.get('NetworkSettings', {}).get('Ports') or {}).values():
            require(entries is None or all(item.get('HostIp') == '127.0.0.1' for item in entries),
                    'Container published a non-loopback listener')
        if require_services:
            require(row.get('State', {}).get('Running') is True, 'A required container is not running')
    if require_services:
        require(observed == set(SERVICES), 'Required services are absent')


def cleanup_owned(run_dir, run_id, pin_value, call):
    """call(label, argv, timeout) is a bounded, credential-filtered process stage."""
    require(re.fullmatch(r'f04-[0-9a-f]{16}', run_id), 'Invalid cleanup ownership identity')
    run_dir = Path(run_dir)
    errors, count = [], 0
    def command(label, argv, timeout=20):
        nonlocal count
        count += 1
        return call(f'cleanup-{label}-{count}', argv, timeout)
    def identifiers(kind, custom=False):
        argv = DOCKER + (['ps', '-aq'] if kind == 'container' else [kind, 'ls', '-q'])
        label = (LABEL if custom else 'com.docker.compose.project') + '=' + run_id
        output = command(kind + '-list', argv + ['--filter', 'label=' + label])
        result = output.strip().splitlines()
        require(len(result) <= 12 and all(re.fullmatch(r'[a-zA-Z0-9_.-]+', value) for value in result),
                'Malformed Docker cleanup identifiers')
        return sorted(set(result))
    ids = identifiers('container')
    records = json.loads(command('container-inspect', DOCKER + ['inspect', *ids])) if ids else []
    validate_containers(records, run_id)
    for kind in ('network', 'volume'):
        ids = identifiers(kind)
        if ids:
            rows = json.loads(command(kind + '-ownership', DOCKER + [kind, 'inspect', *ids]))
            require(isinstance(rows, list) and len(rows) == len(ids), 'Incomplete Docker resource ownership')
            for row in rows:
                labels = row.get('Labels', {})
                require(labels.get(LABEL) == run_id and labels.get('com.docker.compose.project') == run_id,
                        'Refusing teardown of unowned Docker ' + kind)
    path = run_dir / 'work/compose.json'
    if path.exists():
        require(not path.is_symlink() and path.stat().st_size < 128 * 1024,
                'Unsafe Compose cleanup input')
        require(json.loads(path.read_text()) == make_compose(run_dir, run_id, pin_value),
                'Compose configuration changed before cleanup')
        compose = DOCKER + ['compose', '--project-name', run_id, '--file', str(path)]
        try:
            command('logs', compose + ['logs', '--no-color', '--tail', '150'])
        except BaseException as error:
            errors.append('Shutdown log collection: ' + str(error))
        try:
            command('down', compose + ['down', '--volumes', '--remove-orphans', '--timeout', '15'], 60)
        except BaseException as error:
            errors.append('Compose shutdown: ' + str(error))
    for kind in ('container', 'network', 'volume'):
        require(not identifiers(kind), 'Owned Docker resources remain after shutdown')
    images = identifiers('image', custom=True)
    if images:
        rows = json.loads(command('image-ownership', DOCKER + ['image', 'inspect', *images]))
        require(isinstance(rows, list) and len(rows) == len(images)
                and all(row.get('Config', {}).get('Labels', {}).get(LABEL) == run_id for row in rows),
                'Refusing deletion of an unowned derived image')
        command('image-remove', DOCKER + ['image', 'rm', *images], 30)
        require(not identifiers('image', custom=True), 'Derived images remain')
    return {'stopped': True, 'errors': errors, 'containersBeforeShutdown': records,
            'containersNetworksVolumesImagesAbsent': True}
