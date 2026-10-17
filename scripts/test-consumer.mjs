import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { redact } from './check-secret-exposure.mjs';
import { childEnvironment } from './ci/environment.mjs';

export function validatePackInventory(files) {
  const paths = files.map(file => file.path);
  const errors = [];
  for (const required of ['package.json', 'README.md', 'dist/index.js', 'dist/index.d.ts']) if (!paths.includes(required)) errors.push(`Packed package lacks ${required}`);
  for (const path of paths) if (!/^(?:package\.json|README\.md|LICENSE|dist\/[A-Za-z0-9_./-]+)$/.test(path) || path.split('/').some(part => part === '..' || part.startsWith('.'))) errors.push(`Unexpected packed file ${path}`);
  return errors;
}

export async function testConsumer(root) {
  const temp = await mkdtemp(join(tmpdir(), 'browser-vr-consumer-'));
  const env = childEnvironment(process.env, { npm_config_cache: join(temp, 'npm-cache') });
  function run(argv, cwd) {
    const result = spawnSync(argv[0], argv.slice(1), { cwd, env, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024, shell: false });
    if (result.status !== 0 || result.error) throw new Error(redact(`Consumer command failed: ${argv.join(' ')}\n${result.stdout ?? ''}${result.stderr ?? ''}`));
    return result.stdout;
  }
  try {
    const packDirectory = join(temp, 'packed');
    const consumer = join(temp, 'consumer');
    await mkdir(packDirectory);
    await mkdir(consumer);
    const [packed] = JSON.parse(run(['npm', 'pack', '--workspace', '@browser-vr-engine/core', '--ignore-scripts', '--json', '--pack-destination', packDirectory], root));
    assert.deepEqual(validatePackInventory(packed.files), []);
    assert.match(packed.filename, /^[A-Za-z0-9_.-]+\.tgz$/);
    await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'isolated-engine-consumer', private: true, type: 'module', dependencies: { '@browser-vr-engine/core': `file:${join(packDirectory, packed.filename)}` } }));
    run(['npm', 'install', '--package-lock-only', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], consumer);
    run(['npm', 'ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], consumer);
    await writeFile(join(consumer, 'runtime.mjs'), `import assert from 'node:assert/strict';\nimport { realpathSync } from 'node:fs';\nimport { resolve, relative, isAbsolute } from 'node:path';\nimport { fileURLToPath } from 'node:url';\nimport { enginePackage } from '@browser-vr-engine/core';\nconst installed = realpathSync(resolve('node_modules/@browser-vr-engine/core'));\nconst inConsumer = relative(realpathSync('.'), installed);\nassert.ok(!inConsumer.startsWith('..') && !isAbsolute(inConsumer));\nconst loaded = realpathSync(fileURLToPath(import.meta.resolve('@browser-vr-engine/core')));\nconst local = relative(installed, loaded);\nassert.ok(!local.startsWith('..') && !isAbsolute(local));\nassert.equal(enginePackage.name, '@browser-vr-engine/core');\nassert.equal(typeof enginePackage.implementationStage, 'string');\n`);
    run([process.execPath, 'runtime.mjs'], consumer);
    await writeFile(join(consumer, 'index.ts'), `import { enginePackage } from '@browser-vr-engine/core';\nconst name: string = enginePackage.name;\n// @ts-expect-error Public declarations must reject unknown properties.\nenginePackage.propertyThatDoesNotExist;\nvoid name;\n`);
    await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, types: [] }, files: ['index.ts'] }));
    run([process.execPath, resolve(root, 'node_modules/typescript/bin/tsc'), '-p', join(consumer, 'tsconfig.json')], consumer);
    console.log('Independent tarball consumer passed: local installed ESM entry and public TypeScript declarations.');
  } finally { await rm(temp, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await testConsumer(resolve(import.meta.dirname, '..'));
