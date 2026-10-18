import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { packageRoot } from './config.mjs';

export const repositoryRoot=resolve(packageRoot,'../..');
export const workspaceInputPaths=['packages/contracts/package.json',...['index','schemas','ports','canonical','validation','math','qualification'].map(name=>`packages/contracts/src/${name}.ts`)];
const sourcePaths=workspaceInputPaths.filter(path=>path.endsWith('.ts'));
export function assertBuildInputSnapshot(before,after) {
  if(!isDeepStrictEqual(before,after))throw new Error('Evaluation build inputs changed during compilation; no build receipt may be published');
}

export async function contractsPlugin() {
  const manifest=JSON.parse(await readFile(resolve(packageRoot,'package.json'),'utf8'));
  const lock=JSON.parse(await readFile(resolve(packageRoot,'package-lock.json'),'utf8'));
  const contracts=JSON.parse(await readFile(resolve(repositoryRoot,workspaceInputPaths[0]),'utf8'));
  const directory=resolve(packageRoot,'node_modules/@sinclair/typebox');
  if(await realpath(directory)!==directory)throw new Error('TypeBox must be installed inside the isolated evaluation');
  const dependency=JSON.parse(await readFile(resolve(directory,'package.json'),'utf8'));
  if(manifest.dependencies['@sinclair/typebox']!=='0.34.52'||contracts.dependencies['@sinclair/typebox']!=='0.34.52'||dependency.version!=='0.34.52'||lock.packages['node_modules/@sinclair/typebox']?.version!=='0.34.52'||lock.packages[''].dependencies['@sinclair/typebox']!=='0.34.52')throw new Error('The isolated TypeBox dependency pin differs from the contracts dependency');
  return {name:'isolated-public-contracts',setup(build){
    build.onResolve({filter:/^@bve-evaluation\/contracts$/},()=>({path:resolve(repositoryRoot,'packages/contracts/src/index.ts')}));
    build.onResolve({filter:/^@sinclair\/typebox(?:\/.*)?$/},async({path})=>{
      const key=path==='@sinclair/typebox'?'.':'.'+path.slice('@sinclair/typebox'.length);
      const target=dependency.exports[key]?.import?.default;
      if(typeof target!=='string'||!target.startsWith('./'))throw new Error(`Unsupported TypeBox export: ${key}`);
      const file=await realpath(resolve(directory,target));
      if(!file.startsWith(directory+sep))throw new Error('TypeBox export escapes the isolated dependency');
      return {path:file};
    });
  }};
}

export function verifyWorkspaceBuildInputs(metafiles) {
  const actual=new Set();
  for(const metafile of metafiles)for(const name of Object.keys(metafile.inputs)){
    if(name==='fixture-catalog:frozen-media-catalog')continue;
    const absolute=resolve(packageRoot,name);
    if(absolute.startsWith(packageRoot+sep))continue;
    const key=relative(repositoryRoot,absolute).split(sep).join('/');
    if(!sourcePaths.includes(key))throw new Error(`Unbound workspace build input: ${key}`);
    actual.add(key);
  }
  if(sourcePaths.some(path=>!actual.has(path))||actual.size!==sourcePaths.length)throw new Error('Transitive contracts-source inventory differs from the exact workspace input contract');
  return [...actual].sort();
}

export function frozenMediaPlugin(catalog) {
  // Only called with loadFixtureSet's fully verified catalog. Its descriptor
  // hashes/lengths are embedded, never the original asset bytes themselves.
  const records=catalog.resources.filter(asset=>/^(?:audio|video|image)\//.test(asset.mediaType)).map(({mediaType,sha256,sizeBytes})=>({mediaType,sha256,sizeBytes}));
  return {name:'verified-fixture-media',setup(build){
    build.onResolve({filter:/^@bve-evaluation\/media-catalog$/},()=>({path:'frozen-media-catalog',namespace:'fixture-catalog'}));
    build.onLoad({filter:/.*/,namespace:'fixture-catalog'},()=>({contents:`export default ${JSON.stringify(records)};`,loader:'js'}));
  }};
}
