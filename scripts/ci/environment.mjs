// Copy only settings needed to execute tools. Do not enumerate the parent
// environment: provider, publishing and GitHub credentials are never inputs.
const allowed = new Set([
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR',
  'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TMPDIR', 'TMP', 'TEMP',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TERM', 'CI', 'NO_COLOR', 'FORCE_COLOR',
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
  'npm_config_cache'
]);

export function childEnvironment(source = process.env, overrides = {}) {
  const environment = {};
  for (const key of allowed) {
    if (typeof source[key] === 'string') environment[key] = source[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!allowed.has(key) || (value !== undefined && typeof value !== 'string')) throw new Error('Unsupported child environment override');
    if (value === undefined) delete environment[key];
    else environment[key] = value;
  }
  return environment;
}
