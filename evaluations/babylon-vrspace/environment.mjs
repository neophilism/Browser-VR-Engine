import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactRoot } from './config.mjs';

export async function isolatedEnvironment(source = process.env) {
  // Explicit allowlist: no enumeration, inherited Node flags, registry credentials,
  // provider credentials, or user/global npm configuration.
  const directories = {
    config: resolve(artifactRoot, 'tool-config'), temp: resolve(artifactRoot, 'tmp'),
    cache: resolve(artifactRoot, 'npm-cache'), browsers: resolve(artifactRoot, 'browsers'),
  };
  for (const directory of Object.values(directories)) await mkdir(directory, { recursive: true });
  const userConfig=resolve(directories.config,'user.npmrc'),globalConfig=resolve(directories.config,'global.npmrc');
  await Promise.all([userConfig,globalConfig].map(file=>writeFile(file,'',{mode:0o600})));
  const env = {
    PATH: source.PATH || '/usr/bin:/bin',
    TMPDIR: directories.temp, TMP: directories.temp, TEMP: directories.temp,
    LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC', NODE_USE_SYSTEM_CA: '1',
    npm_config_cache: directories.cache,
    npm_config_userconfig: userConfig,
    npm_config_globalconfig: globalConfig,
    PLAYWRIGHT_BROWSERS_PATH: directories.browsers,
  };
  for (const key of ['SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'CHROME_EXECUTABLE', 'F03_FIXTURE_ROOT', 'EVAL_PORT', 'EVAL_SOFTWARE_RENDERING', 'PLAYWRIGHT_BROWSERS_PATH', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR']) {
    if (typeof source[key] === 'string') env[key] = source[key];
  }
  return env;
}

