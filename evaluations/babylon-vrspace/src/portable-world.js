import { CONTRACT_VERSION, BUILTIN_COMPONENT_SCHEMAS, canonicalJson, digestJson, requireDocument, transformMatrix, multiplyMatrices, transformPoint } from '@bve-evaluation/contracts';
import { IMPORT_LIMITS, validateModelBytes } from './import-policy.js';
import { requireFrozenMedia } from './media-policy.js';

// Uncompressed, local evaluation carrier. This transports the complete authored
// document and every original, not live physics/media/session checkpoint state.
export const PORTABLE_LIMITS=Object.freeze({manifestBytes:2*1024*1024,payloadBytes:128*1024*1024,assets:128,entities:512,modelInstances:64,colliders:256,emitters:16,mediaSurfaces:4,animations:8,bufferBytes:128*1024*1024,accessorBytes:128*1024*1024,imagePixels:32*1024*1024,texturePixels:32*1024*1024,animationKeys:200000,nodes:8192,primitives:4096,drawVertices:4000000,drawElements:8000000});
export const PORTABLE_HEADER_BYTES=48;
const magic=new TextEncoder().encode('BVEF05W1');
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const fail=message=>{throw new Error(`Portable world: ${message}`);};
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
export { canonicalJson, transformMatrix, multiplyMatrices, transformPoint };

export function effectiveComponents(entity) {
  return Object.fromEntries(entity.components.filter(component=>component.version===CONTRACT_VERSION&&Object.hasOwn(BUILTIN_COMPONENT_SCHEMAS,component.type)).map(component=>[component.type,component.data]));
}
export function selectExactAnimationGroup(groups,clip) {
  const matches=groups.filter(group=>group.name===clip);
  if(matches.length!==1)fail(`decoded animation clip is missing or ambiguous: ${clip}`);
  return matches[0];
}
export async function authoredRevision(world) {
  // Frozen F03 derivation. Full metadata remains in the separately hashed carrier.
  return digestJson({id:world.id,coordinates:world.coordinates,assets:world.assets,entities:world.entities,requiredFeatures:world.requiredFeatures});
}
export function worldMatrices(world) {
  const entities=new Map(world.entities.map(entity=>[entity.id,entity])),result=new Map();
  const matrix=id=>{if(result.has(id))return result.get(id);const entity=entities.get(id),local=transformMatrix(entity.transform),value=entity.parentId?multiplyMatrices(matrix(entity.parentId),local):local;result.set(id,value);return value;};
  for(const entity of world.entities)matrix(entity.id);
  return result;
}

export function validateEvaluationWorld(world,assets) {
  requireDocument('world',world);
  if(world.assets.length>PORTABLE_LIMITS.assets||world.entities.length>PORTABLE_LIMITS.entities)fail('evaluation entity/asset budget exceeded');
  if(!(assets instanceof Map)||assets.size!==world.assets.length)fail('asset table must contain exactly the declared originals');
  const matrices=worldMatrices(world),models=new Map(),playback=new Map(),entities=new Map(world.entities.map(entity=>[entity.id,entity]));
  const usage={modelInstances:0,colliders:0,emitters:0,mediaSurfaces:0,animations:0,bufferBytes:0,accessorBytes:0,imagePixels:0,texturePixels:0,animationKeys:0,nodes:0,primitives:0,drawVertices:0,drawElements:0};
  let payloadBytes=0;
  for(const reference of world.assets){
    const asset=assets.get(reference.id);
    if(!asset||canonicalJson(asset.reference)!==canonicalJson(reference)||!(asset.bytes instanceof Uint8Array)||!asset.bytes.length||asset.bytes.length>IMPORT_LIMITS.fileBytes||typeof asset.mediaType!=='string'||!/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(asset.mediaType)||asset.mediaType.length>128)fail(`invalid original asset descriptor: ${reference.id}`);
    payloadBytes+=asset.bytes.length;if(payloadBytes>PORTABLE_LIMITS.payloadBytes)fail('payload budget exceeded');
  }
  const consumeModel=id=>{
    if(!models.has(id)){
      const asset=assets.get(id),extension=asset.mediaType==='model/gltf-binary'?'.glb':asset.mediaType==='model/gltf+json'?'.gltf':null;
      if(!extension)fail('only self-contained glTF/GLB models are decoded in this evaluation');
      if(asset.reference.sourceCoordinates)fail('source-coordinate conversion metadata is preserved but requires a conversion adapter before model rendering');
      models.set(id,validateModelBytes(asset.bytes,extension));
    }
    const model=models.get(id);usage.modelInstances++;
    for(const [key,value] of Object.entries(model.budgets))usage[key]+=value;
    return model;
  };
  for(const entity of world.entities){
    const matrix=matrices.get(entity.id);
    if([...matrix,...transformMatrix(entity.transform)].some(value=>!Number.isFinite(value)||Math.abs(value)>100000))fail('local/world transform exceeds the finite evaluation coordinate range');
    const components=effectiveComponents(entity),mesh=components['bve:mesh'],animation=components['bve:animation'],body=components['bve:collider'],media=components['bve:media-surface'],emitter=components['bve:audio-emitter'];
    let model;if(mesh)model=consumeModel(mesh.asset);
    if(animation){
      usage.animations++;
      if(mesh&&mesh.asset!==animation.asset)fail('animation and mesh must refer to the same model on their entity');
      if(!model)model=consumeModel(animation.asset);
      if(model.json.animations?.filter(clip=>clip.name===animation.clip).length!==1)fail('animation clip is missing or ambiguous in its original model');
      if(entity.transform.kind!=='trs'||body||!animation.loop)fail('evaluation route animation requires a looping TRS entity without a rigid body');
      for(const point of animation.route){
        const projected=entity.parentId?transformPoint(matrices.get(entity.parentId),point):point;
        if([...point,...projected].some(value=>!Number.isFinite(value)||Math.abs(value)>100000))fail('local/projected animation route exceeds the evaluation coordinate range');
      }
    }
    if(body){
      usage.colliders++;
      if(body.halfExtents.some(value=>value>10000))fail('collider extent exceeds the evaluation range');
      if(body.body!=='static'&&(entity.parentId||entity.transform.kind!=='trs'))fail('dynamic/kinematic colliders currently require root TRS; affine/static visual data is preserved without approximation');
      if(body.body==='static')for(let ancestor=entities.get(entity.parentId);ancestor;ancestor=entities.get(ancestor.parentId)){
        const parentComponents=effectiveComponents(ancestor),parentBody=parentComponents['bve:collider'];
        if(parentComponents['bve:animation']||(parentBody&&parentBody.body!=='static'))fail('static colliders require stationary ancestors in this evaluation');
      }
      const corners=[];
      for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])corners.push(transformPoint(matrix,[x*body.halfExtents[0],y*body.halfExtents[1],z*body.halfExtents[2]]));
      if(corners.flat().some(value=>!Number.isFinite(value)||Math.abs(value)>100000))fail('projected collider exceeds the evaluation range');
    }
    for(const component of [media,emitter])if(component){
      const owner=playback.get(component.playbackId);
      if(owner&&owner!==entity.id)fail('one playback identity cannot be shared across distinct evaluation entities');
      playback.set(component.playbackId,entity.id);
      requireFrozenMedia(assets.get(component.sourceAsset));
    }
    if(media){
      usage.mediaSurfaces++;
      const asset=assets.get(media.sourceAsset);
      if(asset.reference.kind==='video'&&(!emitter||emitter.sourceAsset!==media.sourceAsset||emitter.playbackId!==media.playbackId))fail('video surfaces require their own same-element spatial emitter');
      if(emitter&&asset.reference.kind!=='video')fail('an image surface cannot own a media-element audio source');
    }
    if(emitter){
      usage.emitters++;
      if(!emitter.spatial||emitter.channels!=='mono')fail('this evaluation carrier replays spatial mono emitter descriptors only');
      if(assets.get(emitter.sourceAsset).reference.kind==='video'&&(!media||media.sourceAsset!==emitter.sourceAsset||media.playbackId!==emitter.playbackId))fail('video audio must be attached to its matching screen element');
      if(emitter.localOffset.some(value=>Math.abs(value)>100000)||emitter.curve.cutoff>100000)fail('audio geometry exceeds the evaluation range');
      if(transformPoint(matrix,emitter.localOffset).some(value=>!Number.isFinite(value)||Math.abs(value)>100000))fail('projected audio source exceeds the evaluation coordinate range');
    }
  }
  for(const [key,value] of Object.entries(usage))if(!Number.isSafeInteger(value)||value>PORTABLE_LIMITS[key])fail(`aggregate ${key} allocation budget exceeded`);
  return {usage,matrices,models};
}

async function checkedWorld(world,assets) {
  validateEvaluationWorld(world,assets);
  if(await authoredRevision(world)!==world.revision)fail('authored world revision does not match its content');
  for(const reference of world.assets)if(await hash(assets.get(reference.id).bytes)!==reference.revision)fail(`original asset hash mismatch: ${reference.id}`);
}

export async function encodePortableWorld(source,resolveAsset) {
  requireDocument('world',source);
  const world=structuredClone(source);world.revision=await authoredRevision(world);
  const assets=new Map(),descriptors=[];let payloadLength=0;
  for(const reference of world.assets){
    const resolved=await resolveAsset(reference);
    if(!(resolved?.bytes instanceof Uint8Array)||resolved.bytes.length===0||resolved.bytes.length>IMPORT_LIMITS.fileBytes)fail('invalid or excessive original asset bytes');
    payloadLength+=resolved.bytes.length;if(payloadLength>PORTABLE_LIMITS.payloadBytes)fail('payload budget exceeded');
    const asset={reference:structuredClone(reference),mediaType:resolved.mediaType,bytes:new Uint8Array(resolved.bytes)};assets.set(reference.id,asset);
    descriptors.push({id:reference.id,mediaType:asset.mediaType,byteLength:asset.bytes.length});
  }
  await checkedWorld(world,assets);
  const manifest={kind:'f05-evaluation-world',version:1,world,assets:descriptors},manifestBytes=encoder.encode(canonicalJson(manifest));
  if(manifestBytes.length>PORTABLE_LIMITS.manifestBytes)fail('manifest budget exceeded');
  const bytes=new Uint8Array(PORTABLE_HEADER_BYTES+manifestBytes.length+payloadLength),view=new DataView(bytes.buffer);
  bytes.set(magic);view.setUint32(8,manifestBytes.length,true);view.setUint32(12,payloadLength,true);bytes.set(manifestBytes,PORTABLE_HEADER_BYTES);
  let offset=PORTABLE_HEADER_BYTES+manifestBytes.length;
  for(const descriptor of descriptors){bytes.set(assets.get(descriptor.id).bytes,offset);offset+=descriptor.byteLength;}
  bytes.set(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.subarray(PORTABLE_HEADER_BYTES))),16);
  return {bytes,world,integrity:await hash(bytes),manifestIntegrity:await hash(manifestBytes),bodyIntegrity:[...bytes.subarray(16,48)].map(value=>value.toString(16).padStart(2,'0')).join(''),assetReceipts:descriptors.map((descriptor,index)=>({...descriptor,revision:world.assets[index].revision}))};
}

export async function readPortableFile(file) {
  const maximum=PORTABLE_HEADER_BYTES+PORTABLE_LIMITS.manifestBytes+PORTABLE_LIMITS.payloadBytes;
  if(!file||!Number.isSafeInteger(file.size)||file.size<PORTABLE_HEADER_BYTES||file.size>maximum)fail('file size exceeds the bounded carrier limit');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.length!==file.size)fail('file size changed while reading');
  return decodePortableWorld(bytes);
}

export async function decodePortableWorld(input) {
  const maximum=PORTABLE_HEADER_BYTES+PORTABLE_LIMITS.manifestBytes+PORTABLE_LIMITS.payloadBytes;
  if(!(input instanceof Uint8Array)||input.length<PORTABLE_HEADER_BYTES||input.length>maximum)fail('invalid carrier byte length');
  // Buffer.slice shares storage: deliberately make an ordinary owned copy first.
  const bytes=new Uint8Array(input),view=new DataView(bytes.buffer);
  if(!magic.every((value,index)=>bytes[index]===value))fail('unknown carrier header');
  const manifestLength=view.getUint32(8,true),payloadLength=view.getUint32(12,true);
  if(!manifestLength||manifestLength>PORTABLE_LIMITS.manifestBytes||payloadLength>PORTABLE_LIMITS.payloadBytes||PORTABLE_HEADER_BYTES+manifestLength+payloadLength!==bytes.length)fail('truncated, trailing or excessive carrier lengths');
  const actual=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.subarray(PORTABLE_HEADER_BYTES)));
  if(!actual.every((value,index)=>bytes[16+index]===value))fail('complete carrier content integrity mismatch');
  const manifestBytes=bytes.subarray(PORTABLE_HEADER_BYTES,PORTABLE_HEADER_BYTES+manifestLength);
  let text,manifest;try{text=decoder.decode(manifestBytes);manifest=JSON.parse(text);}catch{fail('invalid UTF-8/JSON manifest');}
  if(!exactKeys(manifest,['kind','version','world','assets'])||manifest.kind!=='f05-evaluation-world'||manifest.version!==1||!Array.isArray(manifest.assets)||manifest.assets.length>PORTABLE_LIMITS.assets)fail('unsupported or malformed carrier manifest');
  requireDocument('world',manifest.world);
  if(canonicalJson(manifest)!==text)fail('manifest must use unique keys and exact canonical JSON');
  if(manifest.assets.length!==manifest.world.assets.length)fail('missing or extra original asset records');
  const assets=new Map();let offset=PORTABLE_HEADER_BYTES+manifestLength;
  for(let index=0;index<manifest.assets.length;index++){
    const descriptor=manifest.assets[index],reference=manifest.world.assets[index];
    if(!exactKeys(descriptor,['id','mediaType','byteLength'])||descriptor.id!==reference.id||assets.has(descriptor.id)||!Number.isSafeInteger(descriptor.byteLength)||descriptor.byteLength<1||descriptor.byteLength>IMPORT_LIMITS.fileBytes||offset+descriptor.byteLength>bytes.length)fail('duplicate, missing, reordered or excessive original asset record');
    assets.set(descriptor.id,{reference,mediaType:descriptor.mediaType,bytes:bytes.subarray(offset,offset+descriptor.byteLength)});offset+=descriptor.byteLength;
  }
  if(offset!==bytes.length)fail('unclaimed payload bytes');
  await checkedWorld(manifest.world,assets);
  return {world:manifest.world,assets,integrity:await hash(bytes),manifestIntegrity:await hash(manifestBytes),assetReceipts:manifest.assets.map((descriptor,index)=>({...descriptor,revision:manifest.world.assets[index].revision})),usage:validateEvaluationWorld(manifest.world,assets).usage};
}
