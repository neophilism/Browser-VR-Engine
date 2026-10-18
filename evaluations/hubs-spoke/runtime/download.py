"""One byte-pinned public download, run only as a bounded supervised child stage."""
import argparse
import hashlib
import os
from pathlib import Path
import urllib.request
from config import pins, require
from run import safe_proxy


def download(name, directory):
    pin_value = pins()
    items = {**pin_value['bootstrap'], **pin_value['wheels']}
    require(name in items, 'Unknown pinned bootstrap')
    item = items[name]
    url = item['url']
    require(url.startswith(('https://repo.hex.pm/', 'https://github.com/erlang/rebar3/releases/',
                            'https://files.pythonhosted.org/')), 'Unexpected bootstrap origin')
    target = Path(directory).resolve(strict=True) / item.get('filename', 'hex.ez' if name == 'hex' else name)
    require(target.parent == Path(directory).resolve(strict=True) and not target.exists()
            and not target.is_symlink(), 'Bootstrap destination must be a new direct child')
    proxies = {scheme: os.environ.get(scheme.upper() + '_PROXY', os.environ.get(scheme + '_proxy'))
               for scheme in ('https', 'http')}
    proxies = {key: safe_proxy(value) for key, value in proxies.items() if value}
    opener = urllib.request.build_opener(urllib.request.ProxyHandler(proxies))
    # This socket timeout is supplementary. The parent stage's independent
    # 60-second wall deadline and Linux supervisor bound the entire transfer.
    with opener.open(url, timeout=30) as response:
        data = response.read(item['bytes'] + 1)
    require(len(data) == item['bytes'] and hashlib.sha256(data).hexdigest() == item['sha256'],
            'Downloaded bootstrap does not match its fixed bytes')
    with target.open('xb') as stream:
        stream.write(data)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('name')
    parser.add_argument('directory')
    arguments = parser.parse_args()
    download(arguments.name, arguments.directory)
