/** Narrow local-preview policy. This is not the production format/conversion service. */
export const IMPORT_LIMITS = Object.freeze({
  fileBytes: 32 * 1024 * 1024, jsonBytes: 4 * 1024 * 1024,
  decodedBufferBytes: 64 * 1024 * 1024, accessorBytes: 64 * 1024 * 1024,
  accessorCount: 1_000_000, accessors: 4096, objects: 250_000, depth: 64,
  nodes: 2048, meshes: 512, primitives: 2048, drawVertices:2_000_000, drawElements:4_000_000, animationKeys:100_000, images: 32,
  imageDimension: 4096, imagePixels: 16_777_216,
  sessionImports: 32, sessionOriginalBytes: 128 * 1024 * 1024,
});
const allowedExtensions = new Set(['KHR_materials_unlit', 'KHR_materials_emissive_strength', 'KHR_texture_transform']);
const componentBytes = new Map([[5120,1],[5121,1],[5122,2],[5123,2],[5125,4],[5126,4]]);
const components = new Map([['SCALAR',1],['VEC2',2],['VEC3',3],['VEC4',4],['MAT2',4],['MAT3',9],['MAT4',16]]);
const fail = message => { throw new Error(`Local import policy: ${message}`); };
const integer = (value, min, max, label) => { if (!Number.isSafeInteger(value) || value < min || value > max) fail(`invalid or excessive ${label}`); return value; };
const array = (value, max, label) => { if (value === undefined) return []; if (!Array.isArray(value) || value.length > max) fail(`invalid or excessive ${label}`); return value; };
const index = (value, values, label) => integer(value, 0, values.length - 1, label);

export async function readModelFile(file) {
  const extension = typeof file.name === 'string' && /\.(glb|gltf)$/i.exec(file.name)?.[0].toLowerCase();
  if (!extension) fail('only GLB2 or embedded glTF2 is supported by this preview');
  integer(file.size, 1, IMPORT_LIMITS.fileBytes, 'file size (maximum 32 MiB)');
  // The allocation gate precedes File.arrayBuffer(), including for multi-gigabyte drops.
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size) fail('file length changed while reading');
  const model = validateModelBytes(bytes, extension);
  return {bytes, extension, model};
}

function unpack(bytes, extension) {
  integer(bytes.byteLength, 1, IMPORT_LIMITS.fileBytes, 'file bytes');
  if (extension === '.gltf') return {jsonBytes:bytes, binary:null};
  if (extension !== '.glb' || bytes.byteLength < 20) fail('invalid GLB2 header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0,true) !== 0x46546c67 || view.getUint32(4,true) !== 2 || view.getUint32(8,true) !== bytes.byteLength) fail('invalid GLB2 header');
  let jsonBytes, binary = null, offset = 12;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) fail('truncated GLB chunk');
    const length = view.getUint32(offset,true), type = view.getUint32(offset+4,true);
    if (length % 4 || offset + 8 + length > bytes.byteLength) fail('invalid GLB chunk length');
    const chunk = bytes.subarray(offset+8,offset+8+length);
    if (!jsonBytes && offset === 12 && type === 0x4e4f534a) jsonBytes = chunk;
    else if (jsonBytes && !binary && type === 0x004e4942) binary = chunk;
    else fail('unexpected or repeated GLB chunk');
    offset += 8 + length;
  }
  if (!jsonBytes) fail('missing GLB JSON');
  return {jsonBytes,binary};
}

function embedded(uri, acceptedTypes) {
  if (typeof uri !== 'string') fail('resource URI must be a string');
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(uri);
  if (!match || !acceptedTypes.includes(match[1]) || match[2].length % 4) fail('only supported self-contained base64 resources are allowed');
  const text = atob(match[2]);
  if (text.length > IMPORT_LIMITS.fileBytes) fail('decoded resource exceeds preview budget');
  return {bytes:Uint8Array.from(text,c=>c.charCodeAt(0)),mediaType:match[1]};
}

function imageSize(bytes, mime) {
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if (mime === 'image/png' && bytes.length >= 33 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a && view.getUint32(8) === 13 && view.getUint32(12) === 0x49484452) {
    // Reject animation before handing the image to the browser decoder.
    for (let offset=8;offset+12<=bytes.length;) {
      const size=view.getUint32(offset),type=view.getUint32(offset+4);
      if (offset+12+size>bytes.length) fail('truncated PNG chunk');
      if (type===0x6163544c) fail('animated PNG is outside the local preview policy');
      offset+=12+size;
    }
    return [view.getUint32(16),view.getUint32(20)];
  }
  if (mime === 'image/jpeg' && bytes.length >= 4 && view.getUint16(0) === 0xffd8) {
    let offset=2;
    while (offset<bytes.length) {
      if (bytes[offset++]!==255) fail('invalid JPEG marker');
      while (bytes[offset]===255) offset++;
      const marker=bytes[offset++];
      if (marker===0xd9 || marker===0xda || offset+2>bytes.length) break;
      if (marker===0x01 || (marker>=0xd0 && marker<=0xd7)) continue;
      const size=view.getUint16(offset);
      if (size<2 || offset+size>bytes.length) fail('truncated JPEG segment');
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        if (size<8) fail('invalid JPEG size segment');
        return [view.getUint16(offset+5),view.getUint16(offset+3)];
      }
      offset+=size;
    }
  }
  fail('only bounded PNG/JPEG image payloads are supported');
}

export function validateModelBytes(bytes, extension) {
  const {jsonBytes,binary} = unpack(bytes,extension);
  integer(jsonBytes.length,1,IMPORT_LIMITS.jsonBytes,'JSON bytes (maximum 4 MiB)');
  const json = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(jsonBytes));
  if (!json || Array.isArray(json) || typeof json!=='object' || json.asset?.version!=='2.0') fail('a glTF2 object is required');
  const used = array(json.extensionsUsed,32,'extensionsUsed'), required = array(json.extensionsRequired,32,'extensionsRequired');
  for (const name of [...used,...required]) if (!allowedExtensions.has(name)) fail(`unsupported extension ${String(name)}`);
  for (const name of required) if (!used.includes(name)) fail('required extension is not declared used');
  const pending=[[json,0]]; let visited=0;
  while (pending.length) {
    const [value,depth]=pending.pop();
    if (++visited>IMPORT_LIMITS.objects || depth>IMPORT_LIMITS.depth) fail('JSON structure exceeds preview budget');
    if (typeof value==='number' && (!Number.isFinite(value) || Math.abs(value)>1e9)) fail('non-finite or excessive numeric declaration');
    if (!value || typeof value!=='object') continue;
    const entries=Object.entries(value);
    if(entries.length+pending.length+visited>IMPORT_LIMITS.objects)fail('JSON structure exceeds preview budget');
    for (const [key,child] of entries) {
      if (['__proto__','prototype','constructor'].includes(key)) fail('unsafe property name');
      if (key==='extensions') for (const name of Object.keys(child||{})) if (!allowedExtensions.has(name) || !used.includes(name)) fail(`unsupported or undeclared extension ${name}`);
      pending.push([child,depth+1]);
    }
  }
  const buffers=array(json.buffers,32,'buffers'), views=array(json.bufferViews,8192,'bufferViews');
  const resolved=[]; let bufferBytes=0;
  for (let i=0;i<buffers.length;i++) {
    const buffer=buffers[i];integer(buffer.byteLength,1,IMPORT_LIMITS.decodedBufferBytes,'buffer byteLength');
    const data=buffer.uri!==undefined?embedded(buffer.uri,['application/octet-stream','application/gltf-buffer']).bytes:(i===0?binary:null);
    if (!data || data.length<buffer.byteLength || data.length-buffer.byteLength>(buffer.uri===undefined?3:0)) fail('buffer length does not match embedded bytes');
    bufferBytes+=buffer.byteLength;if(bufferBytes>IMPORT_LIMITS.decodedBufferBytes)fail('aggregate decoded buffer budget exceeded');resolved.push(data);
  }
  for (const view of views) {
    index(view.buffer,buffers,'buffer reference');integer(view.byteOffset??0,0,IMPORT_LIMITS.decodedBufferBytes,'bufferView offset');integer(view.byteLength,1,IMPORT_LIMITS.decodedBufferBytes,'bufferView length');
    if ((view.byteOffset??0)+view.byteLength>buffers[view.buffer].byteLength) fail('bufferView escapes declared buffer');
    if (view.byteStride!==undefined) {integer(view.byteStride,4,252,'buffer stride');if(view.byteStride%4)fail('buffer stride must be aligned');}
  }
  const accessors=array(json.accessors,IMPORT_LIMITS.accessors,'accessors');let accessorBytes=0;
  for(const accessor of accessors) {
    integer(accessor.count,1,IMPORT_LIMITS.accessorCount,'accessor count');
    const width=componentBytes.get(accessor.componentType),count=components.get(accessor.type);if(!width||!count)fail('invalid accessor representation');
    accessorBytes+=accessor.count*count*Math.max(width,4);if(accessorBytes>IMPORT_LIMITS.accessorBytes)fail('aggregate accessor allocation budget exceeded');
    const offset=integer(accessor.byteOffset??0,0,IMPORT_LIMITS.decodedBufferBytes,'accessor offset');
    if(accessor.bufferView!==undefined) {
      const view=views[index(accessor.bufferView,views,'accessor bufferView')],element=width*count,stride=view.byteStride??element;
      if(stride<element || offset+(accessor.count-1)*stride+element>view.byteLength)fail('accessor escapes its bufferView');
    } else if(offset) fail('unbuffered accessor has an offset');
    if(accessor.sparse) {
      integer(accessor.sparse.count,1,accessor.count,'sparse count');
      for(const [name,widthOfElement] of [['indices',componentBytes.get(accessor.sparse.indices?.componentType)],['values',width*count]]) {
        const field=accessor.sparse[name];if(!field||!widthOfElement)fail('invalid sparse accessor');
        if(name==='indices'&&![5121,5123,5125].includes(field.componentType))fail('invalid sparse index type');
        const view=views[index(field.bufferView,views,'sparse bufferView')],start=integer(field.byteOffset??0,0,view.byteLength,'sparse offset');
        if(start+accessor.sparse.count*widthOfElement>view.byteLength)fail('sparse accessor escapes its bufferView');
      }
    }
  }
  const meshes=array(json.meshes,IMPORT_LIMITS.meshes,'meshes');let primitives=0;
  for(const mesh of meshes)for(const primitive of array(mesh.primitives,IMPORT_LIMITS.primitives,'mesh primitives')) {
    if(++primitives>IMPORT_LIMITS.primitives)fail('aggregate primitive budget exceeded');
    for(const ref of Object.values(primitive.attributes||{}))index(ref,accessors,'attribute accessor');
    if(primitive.indices!==undefined)index(primitive.indices,accessors,'index accessor');
    for(const target of array(primitive.targets,16,'morph targets'))for(const ref of Object.values(target))index(ref,accessors,'morph accessor');
  }
  const nodes=array(json.nodes,IMPORT_LIMITS.nodes,'nodes'),parents=new Map();let drawVertices=0,drawElements=0;
  for(let i=0;i<nodes.length;i++) {
    const node=nodes[i];if(node.mesh!==undefined) {
      index(node.mesh,meshes,'node mesh');
      for(const primitive of meshes[node.mesh].primitives) {const vertices=accessors[primitive.attributes?.POSITION]?.count??0;drawVertices+=vertices;drawElements+=primitive.indices===undefined?vertices:accessors[primitive.indices].count;}
      if(drawVertices>IMPORT_LIMITS.drawVertices||drawElements>IMPORT_LIMITS.drawElements)fail('instanced vertex/index budget exceeded');
    }
    for(const child of array(node.children,IMPORT_LIMITS.nodes,'node children')) {index(child,nodes,'child node');if(parents.has(child))fail('node has multiple parents');parents.set(child,i);}
  }
  for(let i=0;i<nodes.length;i++) {let current=i;const seen=new Set();while(parents.has(current)){if(seen.has(current)||seen.size>=IMPORT_LIMITS.depth)fail('cyclic or excessive node hierarchy');seen.add(current);current=parents.get(current);}}
  for(const scene of array(json.scenes,32,'scenes'))for(const node of array(scene.nodes,IMPORT_LIMITS.nodes,'scene nodes'))index(node,nodes,'scene node');
  for(const skin of array(json.skins,128,'skins'))for(const node of array(skin.joints,256,'skin joints'))index(node,nodes,'joint node');
  let animationKeys=0,channelCount=0;
  for(const animation of array(json.animations,128,'animations')) {
    const channels=array(animation.channels,1024,'animation channels'),samplers=array(animation.samplers,1024,'animation samplers');
    channelCount+=channels.length;if(channelCount>1024)fail('aggregate animation channel budget exceeded');
    for(const channel of channels) {
      const sampler=samplers[index(channel.sampler,samplers,'animation sampler')];index(sampler.input,accessors,'animation input');index(sampler.output,accessors,'animation output');
      if(channel.target?.node!==undefined)index(channel.target.node,nodes,'animation target node');
      animationKeys+=accessors[sampler.input].count;if(animationKeys>IMPORT_LIMITS.animationKeys)fail('aggregate animation key budget exceeded');
    }
  }
  array(json.materials,512,'materials');const textures=array(json.textures,64,'textures');
  let pixels=0;const imagePixels=[];
  for(const image of array(json.images,IMPORT_LIMITS.images,'images')) {
    let payload;
    if(image.uri!==undefined)payload=embedded(image.uri,['image/png','image/jpeg']);
    else {const view=views[index(image.bufferView,views,'image bufferView')];payload={bytes:resolved[view.buffer].subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength),mediaType:image.mimeType};}
    const [width,height]=imageSize(payload.bytes,payload.mediaType);integer(width,1,IMPORT_LIMITS.imageDimension,'image width');integer(height,1,IMPORT_LIMITS.imageDimension,'image height');pixels+=width*height;imagePixels.push(width*height);if(pixels>IMPORT_LIMITS.imagePixels)fail('aggregate image pixel budget exceeded');
  }
  let texturePixels=0;for(const texture of textures){texturePixels+=imagePixels[index(texture.source,imagePixels,'texture image')];if(texturePixels>IMPORT_LIMITS.imagePixels)fail('aggregate texture pixel budget exceeded');}
  return {json,budgets:{bufferBytes,accessorBytes,imagePixels:pixels,texturePixels,animationKeys,nodes:nodes.length,primitives,drawVertices,drawElements}};
}
