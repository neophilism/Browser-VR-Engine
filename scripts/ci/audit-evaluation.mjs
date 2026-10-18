import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { auditDependencies } from '../check-dependencies.mjs';

const root = resolve(import.meta.dirname, '../..');
const names = { f04: 'hubs-spoke', f05: 'babylon-vrspace' };
const id = process.argv[2];
if (process.argv.length !== 3 || !Object.hasOwn(names, id)) throw new Error('Usage: audit-evaluation.mjs f04|f05');
const config = resolve(root, 'artifacts/evaluation-tools/config');
await mkdir(config, { recursive: true });
for (const file of ['user.npmrc', 'global.npmrc']) await writeFile(resolve(config, file), '');
const assessment = await auditDependencies(resolve(root, 'evaluations', names[id]), {
  directory: resolve(root, 'artifacts/evaluations/reports', id),
  npmConfig: ['--registry=https://registry.npmjs.org', '--userconfig', resolve(config, 'user.npmrc'), '--globalconfig', resolve(config, 'global.npmrc')]
});
if (assessment.status !== 'passed') process.exitCode = 1;
