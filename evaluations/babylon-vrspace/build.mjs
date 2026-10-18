import { build } from 'esbuild';
import { resolve } from 'node:path';
import { writeFile, copyFile } from 'node:fs/promises';
import { packageRoot, fixtureRoot } from './config.mjs';
import { loadFixtureSet, verifyVendor, fingerprintFiles, buildInputPaths } from './fixtures.mjs';

const fixtures = await loadFixtureSet(fixtureRoot);
await verifyVendor();
await build({
  absWorkingDir: packageRoot,
  entryPoints: ['src/main.js'], bundle: true, format: 'esm', target: 'es2022', platform: 'browser',
  outfile: resolve(packageRoot, 'dist/main.js'), sourcemap: true, logLevel: 'info',
  external: ['/vendor/vrspace/asset-loader.js'],
});
await copyFile(resolve(packageRoot,'src/audio-meter.js'),resolve(packageRoot,'dist/audio-meter.js'));
await writeFile(resolve(packageRoot, 'dist/build.json'), JSON.stringify({
  schemaVersion: 1,
  inputs: await fingerprintFiles(buildInputPaths),
  outputs: await fingerprintFiles(['dist/main.js', 'dist/main.js.map', 'dist/audio-meter.js']),
  fixtureDigests: fixtures.manifest.sourceFileDigests,
}, null, 2) + '\n');
console.log(`Built isolated F05 evaluation against ${fixtures.manifest.comparison.fixtureSetId}; ${fixtures.resources.size} verified shared resources.`);

