import test from 'node:test';
import assert from 'node:assert/strict';
import {IMPORT_LIMITS,readModelFile,validateModelBytes} from '../src/import-policy.js';

const model=()=>({asset:{version:'2.0'},buffers:[{byteLength:36,uri:`data:application/octet-stream;base64,${Buffer.alloc(36).toString('base64')}`}],bufferViews:[{buffer:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0});
const bytes=value=>new TextEncoder().encode(JSON.stringify(value));
const validate=value=>validateModelBytes(bytes(value),'.gltf');
function glb(json,binary=null) {
  const text=Buffer.from(JSON.stringify(json)),padded=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]);
  const bin=binary&&Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
  const out=Buffer.alloc(20+padded.length+(bin?8+bin.length:0));
  out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded.length,12);out.writeUInt32LE(0x4e4f534a,16);padded.copy(out,20);
  if(bin){const offset=20+padded.length;out.writeUInt32LE(bin.length,offset);out.writeUInt32LE(0x004e4942,offset+4);bin.copy(out,offset+8);}return out;
}

test('oversized File is rejected before arrayBuffer is called',async()=>{
  let read=false;
  await assert.rejects(readModelFile({name:'huge.glb',size:IMPORT_LIMITS.fileBytes+1,arrayBuffer(){read=true;throw new Error('must not read');}}),/file size/);
  assert.equal(read,false);
});
test('File length mismatch is rejected before decoding',async()=>{
  await assert.rejects(readModelFile({name:'changed.gltf',size:2,async arrayBuffer(){return new ArrayBuffer(3);}}),/length changed/);
});
test('ordinary embedded triangle and equivalent GLB retain explicit allocation budgets',async()=>{
  const value=model(),data=bytes(value);assert.equal(validate(value).budgets.accessorBytes,36);
  const binary=Buffer.alloc(36);delete value.buffers[0].uri;
  assert.equal(validateModelBytes(glb(value,binary),'.glb').budgets.bufferBytes,36);
  assert.equal((await readModelFile(new File([data],'triangle.gltf'))).bytes.length,data.length);
});
test('tiny unbuffered accessors cannot request huge or non-integer allocations',()=>{
  for(const count of [1e9,-1,0,1.5,Number.MAX_SAFE_INTEGER]) {
    const value=model();delete value.accessors[0].bufferView;value.accessors[0].count=count;
    assert.throws(()=>validate(value),/accessor count|numeric declaration/);
  }
});
test('aggregate accessor allocation budget applies across individually valid declarations',()=>{
  const value=model();value.accessors=Array.from({length:2},()=>({count:600000,type:'MAT4',componentType:5126}));
  assert.throws(()=>validate(value),/aggregate accessor allocation/);
});
test('buffer declarations and spans must fit actual embedded bytes',()=>{
  for(const mutate of [value=>value.buffers[0].byteLength=37,value=>value.buffers[0].byteLength=1e9,value=>value.bufferViews[0].byteOffset=1,value=>value.accessors[0].count=4,value=>value.accessors[0].byteOffset=-1]) {
    const value=model();mutate(value);assert.throws(()=>validate(value),/buffer|accessor/);
  }
});
test('sparse allocations and ranges are checked before loader allocation',()=>{
  const value=model();value.accessors[0].sparse={count:4,indices:{bufferView:0,componentType:5121},values:{bufferView:0}};
  assert.throws(()=>validate(value),/sparse count/);
  value.accessors[0].sparse.count=3;value.accessors[0].sparse.values.byteOffset=8;assert.throws(()=>validate(value),/sparse accessor escapes/);
});
test('external and disguised resource URIs are rejected in both GLB and glTF',()=>{
  for(const uri of ['https://example.invalid/mesh.bin','/fixtures/models/prop.gltf','blob:http://127.0.0.1/other','data:text/html;base64,AAAA','data:application/octet-stream;base64,AA_A']) {
    const value=model();value.buffers[0].uri=uri;assert.throws(()=>validate(value),/self-contained/);assert.throws(()=>validateModelBytes(glb(value),'.glb'),/self-contained/);
  }
});
test('optional decoders and URI/media extensions are rejected as well as required extensions',()=>{
  for(const name of ['EXT_meshopt_compression','KHR_draco_mesh_compression','EXT_lights_ies','MSFT_audio_emitter'])for(const field of ['extensionsUsed','extensionsRequired']) {
    const value=model();value[field]=[name];assert.throws(()=>validate(value),/unsupported extension/);
  }
  const value=model();value.nodes[0].extensions={MSFT_audio_emitter:{emitters:[0]}};assert.throws(()=>validate(value),/unsupported or undeclared extension/);
});
test('allowed material extension remains usable but must be declared',()=>{
  const value=model();value.materials=[{extensions:{KHR_materials_unlit:{}}}];assert.throws(()=>validate(value),/undeclared extension/);
  value.extensionsUsed=['KHR_materials_unlit'];assert.equal(validate(value).budgets.nodes,1);
});
test('cyclic, multiply-parented, and deeply nested node graphs are rejected',()=>{
  const cycle=model();cycle.nodes[0].children=[0];assert.throws(()=>validate(cycle),/cyclic/);
  const shared=model();shared.nodes=[{children:[2]},{children:[2]},{}];assert.throws(()=>validate(shared),/multiple parents/);
  const deep=model();deep.nodes=Array.from({length:66},(_,i)=>i===65?{}:{children:[i+1]});assert.throws(()=>validate(deep),/excessive node hierarchy/);
});
test('repeated mesh references have a separate rendered vertex budget',()=>{
  const value=model();value.accessors[0]={componentType:5126,count:500000,type:'VEC3'};value.nodes=Array.from({length:5},()=>({mesh:0}));assert.throws(()=>validate(value),/instanced vertex/);
});
test('reused index accessors cannot multiply draw work without a bound',()=>{
  const value=model();value.accessors.push({count:200000,type:'SCALAR',componentType:5121});value.meshes[0].primitives=Array.from({length:21},()=>({attributes:{POSITION:0},indices:1}));assert.throws(()=>validate(value),/instanced vertex\/index budget/);
});
test('reused animation input cannot multiply allocated key objects without a bound',()=>{
  const value=model();value.accessors.push({count:60000,type:'SCALAR',componentType:5126},{count:60000,type:'VEC3',componentType:5126});value.animations=[{samplers:[{input:1,output:2}],channels:[{sampler:0,target:{node:0,path:'translation'}},{sampler:0,target:{node:0,path:'scale'}}]}];assert.throws(()=>validate(value),/aggregate animation key budget/);
});
test('duplicate texture references count their separate pixel allocations',()=>{
  const png=Buffer.alloc(33);png.writeUInt32BE(0x89504e47,0);png.writeUInt32BE(0x0d0a1a0a,4);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(3000,16);png.writeUInt32BE(2000,20);
  const value=model();value.images=[{uri:'data:image/png;base64,'+png.toString('base64')}];value.textures=Array.from({length:3},()=>({source:0}));assert.throws(()=>validate(value),/aggregate texture pixel budget/);
});
test('oversized compressed-image dimensions are rejected before browser decoding',()=>{
  const png=Buffer.alloc(33);png.writeUInt32BE(0x89504e47,0);png.writeUInt32BE(0x0d0a1a0a,4);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(100000,16);png.writeUInt32BE(10,20);
  const value=model();value.images=[{uri:'data:image/png;base64,'+png.toString('base64')}];assert.throws(()=>validate(value),/image width/);
  value.images=[{uri:'data:image/svg+xml;base64,'+Buffer.from('<svg/>').toString('base64')}];assert.throws(()=>validate(value),/self-contained/);
});
test('large JSON and unsafe object keys fail without loader invocation',()=>{
  const value=model();value.extras={text:'x'.repeat(IMPORT_LIMITS.jsonBytes)};assert.throws(()=>validate(value),/JSON bytes/);
  assert.throws(()=>validateModelBytes(new TextEncoder().encode('{"asset":{"version":"2.0"},"__proto__":{}}'),'.gltf'),/unsafe property/);
});
test('truncated, misaligned, extra and duplicate GLB chunks are rejected',()=>{
  const valid=glb(model());const invalid=Buffer.from(valid);invalid.writeUInt32LE(3,12);assert.throws(()=>validateModelBytes(invalid,'.glb'),/chunk length/);
  assert.throws(()=>validateModelBytes(valid.subarray(0,19),'.glb'),/header/);
  const extra=Buffer.concat([valid,valid.subarray(12)]);extra.writeUInt32LE(extra.length,8);assert.throws(()=>validateModelBytes(extra,'.glb'),/unexpected or repeated/);
});
