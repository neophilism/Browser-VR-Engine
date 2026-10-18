import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadFixtureSet } from '../fixtures.mjs';
import { fixtureRoot } from '../config.mjs';
import { assertBuildInputSnapshot, verifyWorkspaceBuildInputs, workspaceInputPaths } from '../contracts-build.mjs';
import { SpatialGraph } from '../src/spatial-audio.js';
import { encodePortableWorld, decodePortableWorld, readPortableFile, authoredRevision, canonicalJson, validateEvaluationWorld, selectExactAnimationGroup, PORTABLE_LIMITS } from '../dist/portable-world.mjs';

const fixtures=await loadFixtureSet(fixtureRoot),base=fixtures.manifest.world;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const originals=()=>new Map(base.assets.map(reference=>{const resource=fixtures.manifest.catalog.resources.find(value=>value.id===reference.id);return [reference.id,{reference:structuredClone(reference),bytes:new Uint8Array(fixtures.resources.get(resource.path).bytes),mediaType:resource.mediaType}];}));
const encode=(world=structuredClone(base),assets=originals())=>encodePortableWorld(world,reference=>assets.get(reference.id));
const good=await encode();
function unpack(bytes){const length=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(8,true);return {manifest:JSON.parse(new TextDecoder().decode(bytes.subarray(48,48+length))),payload:new Uint8Array(bytes.subarray(48+length))};}
function frame(manifest,payload,text=canonicalJson(manifest)){
  const json=Buffer.from(text),result=Buffer.alloc(48+json.length+payload.length);result.write('BVEF05W1');result.writeUInt32LE(json.length,8);result.writeUInt32LE(payload.length,12);result.set(json,48);result.set(payload,48+json.length);result.set(createHash('sha256').update(result.subarray(48)).digest(),16);return result;
}
const component=(world,type)=>world.entities.find(entity=>entity.components.some(value=>value.type===type)).components.find(value=>value.type===type).data;

test('portable carrier restores the complete frozen document and all eleven exact original bytes',async()=>{
  const restored=await decodePortableWorld(good.bytes);assert.deepEqual(restored.world,base);assert.equal(restored.assets.size,11);
  for(const [id,asset] of originals())assert.deepEqual(restored.assets.get(id),asset);
  assert.equal(restored.integrity,sha(good.bytes));assert.equal(restored.world.revision,await authoredRevision(restored.world));
  assert(restored.assets.has('readability-image'));
});
test('optional future component data is retained in full while authored revision is derived from actual content',async()=>{
  const world=structuredClone(base);world.entities[0].components.push({type:'vendor:note',version:'0.2.0',required:false,data:{text:'Preserve exactly',nested:[1,{caption:'Authored metadata'}]}});
  const encoded=await encode(world),decoded=await decodePortableWorld(encoded.bytes);world.revision=await authoredRevision(world);
  assert.deepEqual(decoded.world,world);assert.notEqual(world.revision,base.revision);assert.equal(decoded.world.entities[0].components.at(-1).data.nested[1].caption,'Authored metadata');
});
test('carrier owns Uint8Array and Buffer snapshots before awaited hashes',async()=>{
  for(const input of [new Uint8Array(good.bytes),Buffer.from(good.bytes)]){
    const pending=decodePortableWorld(input);input.fill(0);assert.deepEqual((await pending).world,base);
  }
});
test('resolver Buffer originals are copied before the next awaited resolver can mutate them',async()=>{
  const assets=originals();let previous;
  const encoded=await encodePortableWorld(base,reference=>{if(previous)previous.fill(0);const asset=assets.get(reference.id);previous=Buffer.from(asset.bytes);return {...asset,bytes:previous};});
  previous.fill(0);assert.deepEqual((await decodePortableWorld(encoded.bytes)).world,base);
});
test('descriptor-first validation rejects caller getters without executing them',async()=>{
  let called=0;const world=structuredClone(base);Object.defineProperty(world,'id',{enumerable:true,get(){called++;throw new Error('Getter executed');}});
  await assert.rejects(()=>encode(world));assert.equal(called,0);
});
test('file size is rejected before reading or allocating its byte buffer',async()=>{
  let reads=0;await assert.rejects(()=>readPortableFile({size:48+PORTABLE_LIMITS.manifestBytes+PORTABLE_LIMITS.payloadBytes+1,arrayBuffer(){reads++;throw new Error('Read forbidden');}}),/size/);assert.equal(reads,0);
  await assert.rejects(()=>readPortableFile({size:good.bytes.length,arrayBuffer:async()=>new ArrayBuffer(1)}),/changed/);
});
test('framing rejects unknown version, truncation and trailing unclaimed bytes',async()=>{
  const invalid=new Uint8Array(good.bytes);invalid[0]=0;await assert.rejects(()=>decodePortableWorld(invalid),/header/);
  await assert.rejects(()=>decodePortableWorld(good.bytes.subarray(0,-1)),/length/);
  const trailing=new Uint8Array(good.bytes.length+1);trailing.set(good.bytes);await assert.rejects(()=>decodePortableWorld(trailing),/length/);
});
test('a modified payload fails both the complete digest and independently the original digest',async()=>{
  const corrupted=new Uint8Array(good.bytes);corrupted[corrupted.length-1]^=1;await assert.rejects(()=>decodePortableWorld(corrupted),/integrity/);
  const {manifest,payload}=unpack(good.bytes);payload[payload.length-1]^=1;await assert.rejects(()=>decodePortableWorld(frame(manifest,payload)),/asset hash mismatch/);
});
test('canonical manifest rejects duplicate keys even after its complete digest is recomputed',async()=>{
  const {manifest,payload}=unpack(good.bytes),text=canonicalJson(manifest).replace('"kind":"f05-evaluation-world"','"kind":"f05-evaluation-world","kind":"f05-evaluation-world"');
  await assert.rejects(()=>decodePortableWorld(frame(manifest,payload,text)),/canonical/);
});
test('missing, duplicated and reordered descriptor inventories fail before decoding',async()=>{
  for(const mutate of [m=>m.assets.pop(),m=>{m.assets[1]=structuredClone(m.assets[0]);},m=>m.assets.reverse()]){
    const {manifest,payload}=unpack(good.bytes);mutate(manifest);await assert.rejects(()=>decodePortableWorld(frame(manifest,payload)));
  }
});
test('forged authored revision and excessive descriptor lengths cannot pass rehashed framing',async()=>{
  const first=unpack(good.bytes);first.manifest.world.revision='0'.repeat(64);await assert.rejects(()=>decodePortableWorld(frame(first.manifest,first.payload)),/revision/);
  const second=unpack(good.bytes);second.manifest.assets[0].byteLength=Number.MAX_SAFE_INTEGER;await assert.rejects(()=>decodePortableWorld(frame(second.manifest,second.payload)),/excessive/);
});
test('unsupported required components fail but optional data is not interpreted as executable content',async()=>{
  const world=structuredClone(base);world.entities[0].components.push({type:'vendor:script',version:'1.0.0',required:true,data:{url:'https://example.invalid/script.js'}});await assert.rejects(()=>encode(world));
  world.entities[0].components.at(-1).required=false;assert.equal((await decodePortableWorld((await encode(world)).bytes)).world.entities[0].components.at(-1).data.url,'https://example.invalid/script.js');
});
test('entity and repeated model-instance budgets reject excess native allocations',()=>{
  const world=structuredClone(base);while(world.entities.length<=PORTABLE_LIMITS.entities){const entity=structuredClone(base.entities[0]);entity.id='extra-'+world.entities.length;world.entities.push(entity);}assert.throws(()=>validateEvaluationWorld(world,originals()),/budget/);
  const models=structuredClone(base),source=base.entities.find(entity=>entity.components.some(component=>component.type==='bve:mesh'));
  for(let index=0;index<PORTABLE_LIMITS.modelInstances;index++)models.entities.push({id:'model-extra-'+index,name:'Budget model',transform:structuredClone(source.transform),components:structuredClone(source.components.filter(component=>component.type==='bve:mesh'))});
  assert(models.entities.length<PORTABLE_LIMITS.entities);assert.throws(()=>validateEvaluationWorld(models,originals()),/modelInstances allocation budget/);
});
test('local and projected route and emitter coordinates are bounded before native placement',()=>{
  const route=structuredClone(base);component(route,'bve:animation').route[0][0]=1e308;assert.throws(()=>validateEvaluationWorld(route,originals()),/range/);
  const emitter=structuredClone(base);component(emitter,'bve:audio-emitter').localOffset=[100000,100000,100000];assert.throws(()=>validateEvaluationWorld(emitter,originals()),/range/);
});
test('static colliders reject dynamic or route-animated ancestors at any depth',()=>{
  for(const ancestorId of ['prop-0','bird']){
    const world=structuredClone(base),parent={id:'middle',name:'middle',parentId:ancestorId,transform:{kind:'trs',translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},components:[]};
    const child=structuredClone(world.entities.find(entity=>entity.components.some(c=>c.type==='bve:collider'&&c.data.body==='static')));child.id='moving-static-child';child.parentId=parent.id;world.entities.push(parent,child);
    assert.throws(()=>validateEvaluationWorld(world,originals()),/stationary ancestors/);
  }
});
test('parented dynamic colliders are explicitly unsupported instead of losing affine solidity',()=>{
  const world=structuredClone(base);world.entities.find(e=>e.id==='prop-0').parentId='prop-1';assert.throws(()=>validateEvaluationWorld(world,originals()),/root TRS/);
});
test('exact native clip selection ignores suffixes and rejects missing or duplicate exact names',()=>{
  const expected={name:'flap'};assert.equal(selectExactAnimationGroup([{name:'notflap'},expected],'flap'),expected);
  assert.throws(()=>selectExactAnimationGroup([{name:'notflap'}],'flap'),/missing/);assert.throws(()=>selectExactAnimationGroup([expected,{name:'flap'}],'flap'),/ambiguous/);
});
test('video surface and spatial emitter retain one matching source/playback owner',()=>{
  const world=structuredClone(base),surface=component(world,'bve:media-surface');surface.playbackId='different-owner';assert.throws(()=>validateEvaluationWorld(world,originals()),/same-element/);
});
test('rendered media rejects catalog MIME/kind mismatches and modified bytes despite a new declared digest',async()=>{
  const assets=originals();assets.get('wall-video').mediaType='audio/webm';assert.throws(()=>validateEvaluationWorld(base,assets),/frozen catalog/);
  const world=structuredClone(base),other=originals(),asset=other.get('wall-video');asset.bytes[asset.bytes.length-1]^=1;const revision=sha(asset.bytes);asset.reference.revision=revision;world.assets.find(a=>a.id==='wall-video').revision=revision;await assert.rejects(()=>encode(world,other),/frozen catalog/);
});
test('unused opaque originals remain exact and are not handed to a native decoder',async()=>{
  const world=structuredClone(base),assets=originals(),bytes=new Uint8Array([0,255,13,37]),reference={id:'opaque-original',revision:sha(bytes),kind:'attachment'};
  world.assets.push(reference);assets.set(reference.id,{reference,bytes,mediaType:'application/octet-stream'});const restored=await decodePortableWorld((await encode(world,assets)).bytes);assert.deepEqual(restored.assets.get(reference.id).bytes,bytes);
});
test('build receipt rejects changed local and workspace inputs across compilation',()=>{
  const original={inputs:{source:{bytes:1,sha256:'a'}},workspaceInputs:{contract:{bytes:1,sha256:'b'}}};assert.doesNotThrow(()=>assertBuildInputSnapshot(original,structuredClone(original)));
  for(const key of ['inputs','workspaceInputs']){const changed=structuredClone(original);Object.values(changed[key])[0].sha256='different';assert.throws(()=>assertBuildInputSnapshot(original,changed),/changed during/);}
});
test('actual transitive workspace closure rejects both missing and undeclared sources',()=>{
  const inputs=Object.fromEntries(workspaceInputPaths.filter(path=>path.endsWith('.ts')).map(path=>['../../'+path,{}]));assert.equal(verifyWorkspaceBuildInputs([{inputs}]).length,7);
  const missing={...inputs};delete missing[Object.keys(missing)[0]];assert.throws(()=>verifyWorkspaceBuildInputs([{inputs:missing}]),/inventory/);
  assert.throws(()=>verifyWorkspaceBuildInputs([{inputs:{...inputs,'../../packages/unbound.ts':{}}}]),/Unbound/);
});

function fakeGraph({closeFailure=false,nodeFailure=false}={}){
  const calls=new Map(),call=key=>calls.set(key,(calls.get(key)||0)+1);let closeFails=closeFailure,nodeFails=nodeFailure;
  const node=key=>({disconnect(){call(key);if(key==='panner'&&nodeFails)throw new Error('Injected disconnect failure');}});
  const graph=Object.create(SpatialGraph.prototype),source={...node('source'),stop(){call('stop');}};
  const meter={...node('meter'),port:{postMessage(){call('port-message');},close(){call('port-close');},onmessage(){}}};
  const item={id:'test',source,meter,meterState:{history:[{}]},video:null,channels:[node('left'),node('right')]};
  for(const key of ['panner','distanceGain','gain','inputAnalyser','prePannerAnalyser','analyser','splitter'])item[key]=node(key);
  graph.sources=new Map([['test',item]]);graph.output=node('output');graph.closed=false;graph.context={state:'running',async close(){call('context');if(closeFails)throw new Error('Injected close failure');this.state='closed';}};
  return {graph,calls,repair(){closeFails=false;nodeFails=false;}};
}
test('audio cleanup attempts every owner and retries a failed close without repeating successful nodes',async()=>{
  const f=fakeGraph({closeFailure:true});await assert.rejects(()=>f.graph.dispose(),/incomplete/);assert.equal(f.calls.get('right'),1);assert.equal(f.calls.get('output'),1);assert.equal(f.graph.closed,false);assert.equal(f.graph.sources.size,1);
  f.repair();await f.graph.dispose();assert.equal(f.calls.get('context'),2);assert.equal(f.calls.get('source'),1);assert.equal(f.calls.get('port-close'),1);assert.equal(f.graph.closed,true);assert.equal(f.graph.sources.size,0);
});
test('audio node cleanup failure still closes context and only failed work repeats',async()=>{
  const f=fakeGraph({nodeFailure:true});await assert.rejects(()=>f.graph.dispose(),/incomplete/);assert.equal(f.graph.context.state,'closed');assert.equal(f.calls.get('right'),1);f.repair();await f.graph.dispose();assert.equal(f.calls.get('panner'),2);assert.equal(f.calls.get('context'),1);
});
test('concurrent audio cleanup callers share native work and final disposal is idempotent',async()=>{
  const f=fakeGraph();await Promise.all([f.graph.dispose(),f.graph.dispose()]);await f.graph.dispose();assert.equal(f.calls.get('context'),1);assert.equal(f.calls.get('source'),1);
});
