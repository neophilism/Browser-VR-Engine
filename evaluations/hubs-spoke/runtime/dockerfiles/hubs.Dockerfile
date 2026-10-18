ARG BASE_IMAGE
FROM ${BASE_IMAGE}
WORKDIR /code
COPY git-config /opt/bve-git-config
COPY source/ ./
ENV CI=1 GIT_TERMINAL_PROMPT=0 GIT_CONFIG_GLOBAL=/opt/bve-git-config GIT_CONFIG_NOSYSTEM=1 npm_config_audit=false npm_config_fund=false
RUN npm ci --ignore-scripts --no-audit --no-fund
RUN mkdir -p certs
COPY build-identity.json /opt/bve-build-identity.json
CMD ["npm", "run", "local", "--", "--no-hot", "--no-live-reload"]
