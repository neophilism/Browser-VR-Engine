"""Download only the immutable upstream executable JAR, and verify it before use."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

from environment import ROOT, clean_environment

pins = json.loads((ROOT / 'source-pins.json').read_text())
target = ROOT / 'downloads' / 'server-0.8.7-executable.jar'
target.parent.mkdir(parents=True, exist_ok=True)

def verify(path):
    if path.stat().st_size != pins['jar']['bytes']: raise RuntimeError('Release length mismatch')
    with path.open('rb') as file: digest = hashlib.file_digest(file, 'sha256').hexdigest()
    if 'sha256:' + digest != pins['jar']['digest']: raise RuntimeError('Official release SHA-256 mismatch')
    return digest

if not target.exists():
    handle = tempfile.NamedTemporaryFile(prefix='server-', suffix='.part', dir=target.parent, delete=False)
    temporary = Path(handle.name); handle.close()
    try:
        subprocess.run(['curl', '-q', '--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--proto-redir', '=https', '--tlsv1.2', '--connect-timeout', '15', '--max-time', '180', '--max-filesize', str(pins['jar']['bytes']), '--output', str(temporary), pins['jar']['url']], check=True, env=clean_environment())
        verify(temporary)
        temporary.replace(target)
    finally:
        if temporary.exists(): temporary.unlink()
digest = verify(target)
client = (ROOT / 'vendor/vrspace/client.js').read_bytes()
if hashlib.sha256(client).hexdigest() != pins['client']['sha256']: raise RuntimeError('Release client SHA-256 mismatch')
print(json.dumps({'release': pins['release'], 'jarBytes': target.stat().st_size, 'jarSha256': digest, 'clientBytes': len(client), 'verified': True}))
