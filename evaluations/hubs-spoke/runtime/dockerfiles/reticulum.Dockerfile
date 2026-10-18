ARG BASE_IMAGE
FROM ${BASE_IMAGE}
WORKDIR /code
COPY git-config /opt/bve-git-config
COPY bootstrap/ /opt/bve-bootstrap/
RUN mix archive.install /opt/bve-bootstrap/hex.ez --force
RUN mix local.rebar rebar3 /opt/bve-bootstrap/rebar3 --force
COPY source/ ./
ENV MIX_ENV=dev ERL_FLAGS="+S 2:2" GIT_TERMINAL_PROMPT=0 GIT_CONFIG_GLOBAL=/opt/bve-git-config GIT_CONFIG_NOSYSTEM=1
RUN mix deps.get --check-locked
RUN mix deps.compile
RUN mix compile
COPY build-identity.json /opt/bve-build-identity.json
CMD ["mix", "phx.server"]
