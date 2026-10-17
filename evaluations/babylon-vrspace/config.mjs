import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageRoot = dirname(fileURLToPath(import.meta.url));
export const fixtureRoot = resolve(process.env.F03_FIXTURE_ROOT || resolve(packageRoot, '../../packages/qualification-fixtures/fixtures'));
export const artifactRoot = resolve(packageRoot, 'artifacts');
export const chromeExecutable = process.env.CHROME_EXECUTABLE || undefined;
export const softwareRendering = process.env.EVAL_SOFTWARE_RENDERING !== '0';
export const serverPort = Number(process.env.EVAL_PORT || 4173);

