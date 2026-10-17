import { execFileSync } from 'node:child_process';
import { readFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { childEnvironment } from './ci/environment.mjs';

const patterns = [
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ['github-fine-grained-token', /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g],
  ['access-key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['registry-token', /_authToken\s*=\s*(?!\$\{)[A-Za-z0-9_./+=-]{12,}/g]
];

export function redact(text) {
  let result = String(text).replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, '[REDACTED:private-key]');
  for (const [rule, pattern] of patterns) result = result.replace(new RegExp(pattern), `[REDACTED:${rule}]`);
  return result.replace(/(["']?[\w.-]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)["']?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]"']+)/gi, (_match, prefix, value) => {
    const quote = ['"', "'"].includes(value[0]) ? value[0] : '';
    return `${prefix}${quote}[REDACTED:credential]${quote}`;
  });
}

// Redact string contents before serializing reports, so escaped JSON strings
// cannot be damaged by a text replacement across serialization boundaries.
export function redactStructured(value) {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(redactStructured);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === 'string' && /(?:api[_-]?key|token|secret|password)$/i.test(key) ? '[REDACTED:credential]' : redactStructured(item)]));
  return value;
}

export function inspectExposure(path, text) {
  const issues = [];
  if (/(?:^|\/)(?:\.env(?:\..+)?|id_rsa|id_ed25519|credentials\.json)$/.test(path) && !path.endsWith('.env.example')) issues.push(`${path}: forbidden credential filename`);
  for (const [rule, pattern] of patterns) {
    for (const match of text.matchAll(new RegExp(pattern))) issues.push(`${path}:${text.slice(0, match.index).split('\n').length}: ${rule}`);
  }
  return issues;
}

export async function scanExposure(root) {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, env: childEnvironment(), encoding: 'utf8' }).split('\0').filter(Boolean);
  const issues = [];
  for (const path of new Set(files)) {
    try {
      const info = await lstat(resolve(root, path));
      if (info.isSymbolicLink()) { issues.push(`${path}: symlink needs explicit review`); continue; }
      if (!info.isFile()) continue;
      if (info.size > 2 * 1024 * 1024) { issues.push(`${path}: too large for baseline source scan`); continue; }
      issues.push(...inspectExposure(path, await readFile(resolve(root, path), 'utf8')));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return issues;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const issues = await scanExposure(resolve(import.meta.dirname, '..'));
  if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
  else console.log('Baseline credential filename/pattern scan passed; this is not a comprehensive secret audit.');
}
