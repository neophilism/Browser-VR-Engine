import { mkdir, writeFile } from 'node:fs/promises';
import { delimiter, dirname, join } from 'node:path';
import { artifactRoot } from './config.mjs';

export async function isolatedEnvironment(source = process.env) {
  const config = join(artifactRoot, 'tool-config');
  const temp = join(artifactRoot, 'tmp');
  const cache = join(artifactRoot, 'npm-cache');
  const browsers = join(artifactRoot, 'browsers');
  const yarnCache = join(artifactRoot, 'yarn-cache');
  for (const dir of [config, temp, cache, browsers, yarnCache]) await mkdir(dir, { recursive: true });
  const userConfig = join(config, 'empty-npmrc');
  const globalConfig = join(config, 'empty-global-npmrc');
  await writeFile(userConfig, '', { mode: 0o600 });
  await writeFile(globalConfig, '', { mode: 0o600 });
  const env = {
    PATH: `${dirname(process.execPath)}${delimiter}${source.PATH || '/usr/bin:/bin'}`,
    TMPDIR: temp, TMP: temp, TEMP: temp,
    LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC', NODE_USE_SYSTEM_CA: '1',
    npm_config_cache: cache, npm_config_userconfig: userConfig, npm_config_globalconfig: globalConfig,
    npm_config_registry: 'https://registry.npmjs.org', npm_config_fetch_retries: '0',
    npm_config_fetch_timeout: '15000', npm_config_audit: 'false', npm_config_fund: 'false',
    YARN_CACHE_FOLDER: yarnCache, PLAYWRIGHT_BROWSERS_PATH: browsers,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(config, 'empty-gitconfig'),
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: '',
  };
  // HOME and USERPROFILE are neither read nor repurposed. Tools receive explicit
  // config/cache/profile paths. No tokens, provider keys, NODE_OPTIONS, user
  // registry credentials, or broad inherited environment reach subprocesses.
  for (const key of ['SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT',
    'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy',
    'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR']) {
    if (typeof source[key] === 'string') env[key] = source[key];
  }
  return env;
}
