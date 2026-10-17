"""Explicit subprocess configuration; application and provider credentials are not inherited."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def clean_environment():
    temporary = ROOT / 'artifacts' / 'tmp'
    config = ROOT / 'artifacts' / 'tool-config'
    cache = ROOT / 'artifacts' / 'npm-cache'
    for directory in [temporary, config, cache]: directory.mkdir(parents=True, exist_ok=True)
    for name in ['user-npmrc', 'global-npmrc']:
        path = config / name
        if not path.exists(): path.write_bytes(b'')
        if path.read_bytes() != b'': raise RuntimeError('Evaluation npm configuration must remain empty: ' + name)
    environment = {
        'PATH': os.environ.get('PATH', '/usr/bin:/bin'),
        'TMPDIR': str(temporary), 'TMP': str(temporary), 'TEMP': str(temporary),
        'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'UTC', 'NODE_USE_SYSTEM_CA': '1',
        'npm_config_userconfig': str(config / 'user-npmrc'),
        'npm_config_globalconfig': str(config / 'global-npmrc'),
        'npm_config_cache': str(cache),
    }
    for name in ['CHROME_EXECUTABLE', 'F03_FIXTURE_ROOT', 'F05_EVALUATION_ROOT', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'CURL_CA_BUNDLE']:
        if name in os.environ: environment[name] = os.environ[name]
    return environment
