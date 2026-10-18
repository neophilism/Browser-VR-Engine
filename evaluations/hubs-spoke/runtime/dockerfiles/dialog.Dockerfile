ARG BASE_IMAGE
FROM ${BASE_IMAGE}
WORKDIR /code
COPY git-config /opt/bve-git-config
COPY source/ ./
COPY bootstrap/ /opt/bve-bootstrap/
ENV CI=1 GIT_TERMINAL_PROMPT=0 GIT_CONFIG_GLOBAL=/opt/bve-git-config GIT_CONFIG_NOSYSTEM=1 npm_config_audit=false npm_config_fund=false CORES=2 npm_config_nodedir=/usr/local
RUN npm ci --ignore-scripts --no-audit --no-fund
# mediasoup 3.11.4 otherwise installs floating pip/setuptools. Install the four
# hash-verified wheels into its exact expected directory, without a registry.
RUN PYTHONPATH=/opt/bve-bootstrap/pip-23.0.1-py3-none-any.whl python3 -m pip install --no-index --no-deps --target=/code/node_modules/mediasoup/worker/out/pip /opt/bve-bootstrap/*.whl
# This executes the real worker/heapdump native builds. Failure remains fatal.
# Meson native subprojects retain their upstream .wrap content hashes.
RUN npm rebuild --foreground-scripts --offline
COPY build-identity.json /opt/bve-build-identity.json
CMD ["node", "index.js"]
