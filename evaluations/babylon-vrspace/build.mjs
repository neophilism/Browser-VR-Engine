import { build, stop } from 'esbuild';
import { resolve } from 'node:path';
import { writeFile, copyFile } from 'node:fs/promises';
import { packageRoot, fixtureRoot } from './config.mjs';
import { loadFixtureSet, verifyVendor, fingerprintFiles, fingerprintWorkspaceFiles, buildInputPaths, buildOutputPaths } from './fixtures.mjs';
import { contractsPlugin, frozenMediaPlugin, verifyWorkspaceBuildInputs, assertBuildInputSnapshot } from './contracts-build.mjs';

const fixtures = await loadFixtureSet(fixtureRoot);
await verifyVendor();
const before={inputs:await fingerprintFiles(buildInputPaths),workspaceInputs:await fingerprintWorkspaceFiles()};
const plugins=[await contractsPlugin(),frozenMediaPlugin(fixtures.manifest.catalog)];
const browser=await build({
  absWorkingDir: packageRoot,
  entryPoints: ['src/main.js'], bundle: true, format: 'esm', target: 'es2022', platform: 'browser',
  outfile: resolve(packageRoot, 'dist/main.js'), sourcemap: true, logLevel: 'info',
  external: ['/vendor/vrspace/asset-loader.js'],
  plugins,metafile:true,
});
const carrier=await build({absWorkingDir:packageRoot,entryPoints:['src/portable-world.js'],bundle:true,format:'esm',target:'es2022',platform:'browser',outfile:resolve(packageRoot,'dist/portable-world.mjs'),plugins,metafile:true,logLevel:'info'});
stop();
verifyWorkspaceBuildInputs([browser.metafile,carrier.metafile]);
await copyFile(resolve(packageRoot,'src/audio-meter.js'),resolve(packageRoot,'dist/audio-meter.js'));
const after={inputs:await fingerprintFiles(buildInputPaths),workspaceInputs:await fingerprintWorkspaceFiles()};
assertBuildInputSnapshot(before,after);
await writeFile(resolve(packageRoot, 'dist/build.json'), JSON.stringify({
  schemaVersion: 1,
  ...before,
  outputs: await fingerprintFiles(buildOutputPaths),
  fixtureDigests: fixtures.manifest.sourceFileDigests,
}, null, 2) + '\n');
console.log(`Built isolated F05 evaluation against ${fixtures.manifest.comparison.fixtureSetId}; ${fixtures.resources.size} verified shared resources.`);

