"""Real local HTTPS readiness; its complete lifetime is bounded by the stage owner."""
import argparse
import hashlib
import http.client
import json
from pathlib import Path
import re
import ssl
import time
from config import require
from run import local_get


def wait_ready(run_id, certificate, model_hash):
    require(re.fullmatch(r'f04-[0-9a-f]{16}', run_id)
            and re.fullmatch(r'[0-9a-f]{64}', model_hash), 'Invalid readiness identity')
    certificate = Path(certificate).resolve(strict=True)
    deadline = time.monotonic() + 290
    last_error = 'No response'
    while time.monotonic() < deadline:
        try:
            model = local_get(8080, '/evaluation/' + run_id + '/courtyard.glb', certificate)
            require(hashlib.sha256(model).hexdigest() == model_hash, 'Owned fixture readiness mismatch')
            local_get(4000, '/stream-offline.png', certificate)
            return {'runId': run_id, 'modelSha256': model_hash, 'reticulumStatus': 200}
        except (OSError, RuntimeError, ssl.SSLError, http.client.HTTPException) as error:
            last_error = str(error)
            time.sleep(.5)
    raise RuntimeError('Real service readiness deadline expired: ' + last_error)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run_id')
    parser.add_argument('certificate')
    parser.add_argument('model_hash')
    arguments = parser.parse_args()
    print(json.dumps(wait_ready(arguments.run_id, arguments.certificate, arguments.model_hash)), flush=True)
