"""Read only this task-owned JVM's process and socket observations."""
import json
from pathlib import Path
import socket
import time
from process_control import ensure_loopback_sockets, exited, recorded_process

ROOT = Path(__file__).resolve().parent


def collect(record, directory, proc, pidfd):
    status = {}
    for line in proc.joinpath('status').read_text().splitlines():
        key, value = line.split(':', 1)
        if key in ['Name', 'Pid', 'Threads', 'VmRSS', 'VmHWM', 'VmPeak', 'VmSize']:
            status[key] = value.strip()
    inodes = set()
    for fd in proc.joinpath('fd').iterdir():
        try:
            value = str(fd.readlink())
            if value.startswith('socket:['): inodes.add(value[8:-1])
        except FileNotFoundError:
            pass
    sockets = []
    for family in ['tcp', 'tcp6']:
        for line in proc.joinpath('net', family).read_text().splitlines()[1:]:
            fields = line.split()
            if fields[9] not in inodes: continue
            def address(text):
                host, port = text.split(':')
                raw = bytes.fromhex(host)
                if family == 'tcp': raw = raw[::-1]
                else: raw = b''.join(raw[i:i+4][::-1] for i in range(0,16,4))
                return {'host': socket.inet_ntop(socket.AF_INET if family == 'tcp' else socket.AF_INET6, raw), 'port': int(port,16)}
            sockets.append({'state': fields[3], 'local': address(fields[1]), 'remote': address(fields[2])})
    ensure_loopback_sockets(sockets)
    if exited(pidfd):
        raise RuntimeError('Owned JVM exited while its sockets were being observed')
    value = {'observedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'process': status, 'processStartTicks': record['processStartTicks'], 'sockets': sockets, 'allOwnedListenersLoopback': True, 'allObservedEstablishedConnectionsLoopback': True, 'note': 'Snapshot of this task JVM only, not a complete historical egress audit or total-memory limit.'}
    out = directory / ('process-' + str(time.time_ns()) + '.json')
    out.write_text(json.dumps(value, indent=2)+'\n')
    return value


if __name__ == '__main__':
    with recorded_process(ROOT) as owned:
        print(json.dumps(collect(*owned), indent=2))
