import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

export const bundleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const repositoryRoot = resolve(bundleRoot, '../..');
export const artifactRoot = resolve(process.env.EVAL_WORKDIR || join(bundleRoot, 'artifacts'));
export const fixtureRoot = resolve(process.env.F03_FIXTURE_ROOT || join(repositoryRoot, 'packages/qualification-fixtures/fixtures'));
export const sources = Object.fromEntries(['hubs', 'spoke', 'compose'].map(name => [name,
  resolve(process.env[`EVAL_${name.toUpperCase()}_SOURCE`] || join(artifactRoot, 'sources', name))
]));
export const browserExecutable = process.env.CHROME_EXECUTABLE || undefined;
export const softwareRendering = process.env.EVAL_SOFTWARE_RENDERING !== '0';
export const port = Number(process.env.EVAL_PORT || 9090);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('EVAL_PORT must be an integer from 1024 to 65535.');
export const origin = `https://127.0.0.1:${port}`;
