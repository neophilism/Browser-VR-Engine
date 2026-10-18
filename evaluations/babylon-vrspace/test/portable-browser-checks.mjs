import { chromium } from 'playwright';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import assert from 'node:assert/strict';
import { finalizeBrowserRun } from './browser-finalize.mjs';
import { packageRoot, artifactRoot, chromeExecutable, softwareRendering } from '../config.mjs';
import { isolatedEnvironment } from '../environment.mjs';
import { startEvaluationServer } from '../server.mjs';
import { evidenceSourcePaths, fingerprintFiles } from '../fixtures.mjs';
import { encodePortableWorld, decodePortableWorld, worldMatrices, transformPoint } from '../dist/portable-world.mjs';

// This is a fresh browser observation, not a portable format or device qualification.
await mkdir(join(artifactRoot,'portable-runs'),{recursive:true});
const directory=await mkdtemp(join(artifactRoot,'portable-runs/run-')),output=name=>join(directory,name),startedAt=new Date().toISOString();
const flags=[...(softwareRendering?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]),'--autoplay-policy=document-user-activation-required'];
const checks=[],logs=[],failedRequests=[],observed={},fixtureAttempts={author:0,fresh:0,rollback:0};
let server,browser,author,fresh,rollback,fatalError,logOverflow=0,imported,exported,reexported,variant;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const log=value=>{if(logs.length<500)logs.push(value);else logOverflow=Math.min(1000,logOverflow+1);};
const near=(actual,expected,tolerance=1e-5)=>{assert.equal(actual.length,expected.length);actual.forEach((value,index)=>assert(Number.isFinite(value)&&Math.abs(value-expected[index])<=tolerance,`coordinate ${index}: ${value} differs from ${expected[index]}`));};
const check=async(id,fn)=>{try{checks.push({id,status:'passed',method:'real-browser',detail:await fn()});console.log('PASS '+id);}catch(error){checks.push({id,status:'failed',method:'real-browser',detail:error.stack});console.log('FAIL '+id+': '+error.message);}};

function derivedGLB(original){
  const json=JSON.parse(original.toString('utf8'));json.nodes[0].translation=[4,1,-2];json.nodes[0].scale=[8,8,8];
  const binary=Buffer.from(json.buffers[0].uri.split(',')[1],'base64');delete json.buffers[0].uri;
  const text=Buffer.from(JSON.stringify(json)),jsonBytes=Buffer.alloc(Math.ceil(text.length/4)*4,32),binBytes=Buffer.alloc(Math.ceil(binary.length/4)*4);text.copy(jsonBytes);binary.copy(binBytes);
  const bytes=Buffer.alloc(12+8+jsonBytes.length+8+binBytes.length);bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(jsonBytes.length,12);bytes.writeUInt32LE(0x4e4f534a,16);jsonBytes.copy(bytes,20);const offset=20+jsonBytes.length;bytes.writeUInt32LE(binBytes.length,offset);bytes.writeUInt32LE(0x004e4942,offset+4);binBytes.copy(bytes,offset+8);return bytes;
}
function affineEntities(){return [
  {id:'portable-affine-parent',name:'Signed affine parent',transform:{kind:'matrix',elements:[-1.2,0,0,0,0.4,1.1,0,0,0,0.2,0.8,0,-5,1.5,3,1]},components:[]},
  {id:'portable-affine-solid',name:'Affine static original prop',parentId:'portable-affine-parent',transform:{kind:'trs',translation:[1,.25,-.5],rotation:[0,Math.sin(Math.PI/12),0,Math.cos(Math.PI/12)],scale:[1.3,.8,.6]},components:[{type:'bve:mesh',version:'0.1.0',required:true,data:{asset:'prop-model'}},{type:'bve:collider',version:'0.1.0',required:true,data:{shape:'box',halfExtents:[.6,.5,.4],body:'static',massKg:0}}]},
];}
async function makePage(role,{empty=true,holdBoot=false,failBoot=false}={}){
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,acceptDownloads:true});
  const control={blockFixtures:empty};
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(control.blockFixtures&&url.origin===server.origin&&url.pathname.startsWith('/fixtures/')){fixtureAttempts[role]++;return route.abort('blockedbyclient');}
    return url.origin===server.origin||['blob:','data:'].includes(url.protocol)?route.continue():route.abort('blockedbyclient');
  });
  await context.addInitScript(({holdBoot,failBoot})=>{
    const Native=window.AudioContext,originalDecode=Native.prototype.decodeAudioData,originalClose=Native.prototype.close;
    const state=window.portableTest={contexts:[],urls:new Set(),holdBoot,bootFetchHeld:false,failDecode:failBoot,failClose:false,decodeEntered:0};
    // Retain native behavior; fault injection is confined to this test context.
    window.AudioContext=class extends Native{constructor(...args){super(...args);state.contexts.push(this);}};
    Native.prototype.decodeAudioData=function(...args){state.decodeEntered++;if(state.failDecode)return Promise.reject(new Error('Intentional portable decode failure'));if(state.holdDecode)return new Promise((resolve,reject)=>{state.releaseDecode=()=>originalDecode.apply(this,args).then(resolve,reject);});return originalDecode.apply(this,args);};
    Native.prototype.close=function(...args){if(state.failClose)return Promise.reject(new Error('Intentional portable audio close failure'));return originalClose.apply(this,args);};
    const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
    URL.createObjectURL=function(...args){const url=create.apply(this,args);state.urls.add(url);return url;};URL.revokeObjectURL=function(url){state.urls.delete(url);return revoke.call(this,url);};
    const fetch=window.fetch;window.fetch=async function(...args){const response=await fetch.apply(this,args);if(state.holdBoot&&new URL(String(args[0]),location.href).pathname==='/fixtures/evaluation.json'){state.bootFetchHeld=true;await new Promise(resolve=>{state.releaseBoot=()=>{state.holdBoot=false;resolve();};});}return response;};
  },{holdBoot,failBoot});
  const page=await context.newPage();page.setDefaultTimeout(45000);
  page.on('console',message=>{if(['error','warning','warn'].includes(message.type()))log({role,type:message.type(),text:message.text()});});
  page.on('pageerror',error=>log({role,type:'pageerror',text:error.stack}));
  page.on('requestfailed',request=>{if(failedRequests.length<200)failedRequests.push({role,url:request.url(),failure:request.failure()});else logOverflow=Math.min(1000,logOverflow+1);});
  await page.goto(server.origin+(empty?'/?world=empty':'/'),{waitUntil:'domcontentloaded',timeout:60000});
  if(empty)await page.waitForFunction(()=>window.portableHost?.inspect().phase==='empty');
  return {page,context,control};
}
async function chooseWorld(page,bytes){
  await page.locator('#world-file').setInputFiles({name:'checked-world.bveworld',mimeType:'application/octet-stream',buffer:Buffer.from(bytes)});
  await page.waitForFunction(()=>['ready','empty','cleanup-failed'].includes(portableHost.inspect().phase));
  return page.evaluate(()=>portableHost.inspect());
}
async function saveWorld(page,name){const promise=page.waitForEvent('download');await page.locator('#save').click();const download=await promise;await download.saveAs(output(name));const bytes=await readFile(output(name)),decoded=await decodePortableWorld(bytes);return {bytes,decoded};}
function receipt(name,value){return {file:name,bytes:value.bytes.length,sha256:sha(value.bytes),worldId:value.decoded.world.id,worldRevision:value.decoded.world.revision,manifestIntegrity:value.decoded.manifestIntegrity,assetReceipts:value.decoded.assetReceipts,authoredProp:value.decoded.world.entities.find(entity=>entity.id==='prop-0'),imported,entityCount:value.decoded.world.entities.length};}
const ownership=page=>page.evaluate(()=>({host:portableHost.inspect(),contexts:portableTest.contexts.map(context=>context.state),urls:portableTest.urls.size,videoElements:document.querySelectorAll('video').length,ready:!!window.foundationReady,hasApp:!!window.foundationProbe}));
const assertDisposed=value=>{assert.equal(value.state,'disposed');assert.equal(value.nodes,0);assert.equal(value.bodies,0);assert.equal(value.urls,0);assert.equal(value.sources,0);assert.equal(value.audio,'closed');assert.equal(value.sceneDisposed,true);assert.equal(value.physicsFreed,true);assert.equal(value.videos,0);};

try{
  server=await startEvaluationServer();browser=await chromium.launch({executablePath:chromeExecutable,headless:true,args:flags,env:await isolatedEnvironment()});
  const originals=new Map(server.manifest.world.assets.map(reference=>{const resource=server.manifest.catalog.resources.find(item=>item.id===reference.id);return [reference.id,{reference,bytes:new Uint8Array(server.resources.get(resource.path).bytes),mediaType:resource.mediaType}];}));
  const initial=await encodePortableWorld(server.manifest.world,reference=>originals.get(reference.id)),model=derivedGLB(server.resources.get('models/prop.gltf').bytes);
  author=await makePage('author',{empty:false,holdBoot:true});

  await check('portable-browser-export-includes-originals',async()=>{
    await author.page.waitForFunction(()=>portableTest.bootFetchHeld);
    const bootBefore=await ownership(author.page);assert.equal(bootBefore.host.createdInstances,0);assert.equal(bootBefore.host.phase,'starting');assert.equal(await author.page.locator('#world-file').isDisabled(),true);
    // A programmatic event must also be serialized, even though the UI is disabled.
    await author.page.locator('#world-file').setInputFiles({name:'during-boot.bveworld',mimeType:'application/octet-stream',buffer:Buffer.from(initial.bytes)});
    const bootAfter=await ownership(author.page);assert.equal(bootAfter.host.createdInstances,0);assert.equal(bootAfter.host.phase,'starting');assert.equal(bootAfter.contexts.length,0);
    await author.page.evaluate(()=>portableTest.releaseBoot());await author.page.waitForFunction(()=>window.foundationReady&&portableHost.inspect().phase==='ready');
    author.control.blockFixtures=true;assert.equal((await ownership(author.page)).host.createdInstances,1);
    const publicPreflight=await author.page.evaluate(async()=>{
      const p=foundationProbe,world=structuredClone(p.world),proto=Object.getPrototypeOf(p),base=()=>Object.assign(Object.create(proto),{state:'created',stopped:false,disposing:false});
      const outcomes=[];
      for(const kind of ['numeric-bytes','too-many-originals','getters']){
        const candidate=base(),assets=new Map(p.originals),copy=structuredClone(world);let getters=0;
        if(kind==='numeric-bytes'){const first=copy.assets[0];assets.set(first.id,{...assets.get(first.id),bytes:2**30});}
        if(kind==='too-many-originals')assets.set('extra',assets.values().next().value);
        if(kind==='getters')Object.defineProperty(copy,'id',{enumerable:true,get(){getters++;return world.id;}});
        let error=null;try{await candidate.load(copy,{originals:assets});}catch(value){error=value.message;}
        outcomes.push({kind,error,getters,physics:!!candidate.physics,audio:!!candidate.audio});
      }
      const candidate=base();let release,entered=false;const gate=new Promise(resolve=>{release=resolve;});
      const loading=candidate.load(world,{assets:{resolve:async reference=>{entered=true;await gate;return p.originals.get(reference.id);}}});
      let duplicate=null;try{await candidate.load(world,{originals:p.originals});}catch(error){duplicate=error.message;}
      candidate.disposing=true;release();let cancelled=null;try{await loading;}catch(error){cancelled=error.message;}
      return {outcomes,concurrent:{entered,duplicate,cancelled,physics:!!candidate.physics,audio:!!candidate.audio}};
    });
    for(const value of publicPreflight.outcomes){assert(value.error);assert.equal(value.getters,0);assert.equal(value.physics,false);assert.equal(value.audio,false);}
    assert(publicPreflight.concurrent.entered);assert.match(publicPreflight.concurrent.duplicate,/fresh evaluation/);assert.match(publicPreflight.concurrent.cancelled,/disposed/);assert.equal(publicPreflight.concurrent.audio,false);
    await author.page.evaluate(()=>{foundationProbe.select('prop-0');});
    for(const [axis,value] of [['x','2'],['y','4'],['z','2']])await author.page.locator('#edit-'+axis).fill(value);
    await author.page.locator('#apply-transform').click();
    const authoredProp=await author.page.evaluate(()=>structuredClone(foundationProbe.world.entities.find(entity=>entity.id==='prop-0')));assert.deepEqual(authoredProp.transform.translation,[2,4,2]);
    await author.page.evaluate(()=>{
      const p=foundationProbe;p.setPlayer([0,1.65,8]);p.camera.rotationQuaternion=null;p.camera.rotation.set(0,0,0);
      const original=File.prototype.arrayBuffer;portableTest.releaseFile=null;
      File.prototype.arrayBuffer=function(...args){if(this.name!=='off-center-scaled-prop.glb')return original.apply(this,args);portableTest.fileHeld=true;return new Promise((resolve,reject)=>{portableTest.releaseFile=()=>{File.prototype.arrayBuffer=original;original.apply(this,args).then(resolve,reject);};});};
    });
    await author.page.locator('#file').setInputFiles({name:'off-center-scaled-prop.glb',mimeType:'model/gltf-binary',buffer:model});await author.page.waitForFunction(()=>portableTest.fileHeld&&!!foundationProbe.importTask);
    const importRace=await author.page.evaluate(()=>{const p=foundationProbe,before=structuredClone(p.world.entities.find(entity=>entity.id==='prop-0'));let error=null;try{p.authorTransform('prop-0',{...before.transform,translation:[99,99,99]});}catch(value){error=value.message;}return {error,before,after:structuredClone(p.world.entities.find(entity=>entity.id==='prop-0'))};});
    assert.match(importRace.error,/stable evaluation/);assert.deepEqual(importRace.after,importRace.before);await author.page.evaluate(()=>portableTest.releaseFile());
    await author.page.waitForFunction(()=>foundationProbe.imports.length===1&&!foundationProbe.importTask);imported=await author.page.evaluate(()=>structuredClone(foundationProbe.imports[0]));assert.equal(imported.vertices,72);assert.equal(imported.revision,sha(model));
    exported=await saveWorld(author.page,'exported-world.bveworld');observed.exported=receipt('exported-world.bveworld',exported);assert.equal(exported.decoded.assets.size,12);assert.equal(exported.decoded.world.entities.length,57);
    for(const [id,asset] of originals){assert.deepEqual(exported.decoded.assets.get(id).bytes,asset.bytes);assert.deepEqual(exported.decoded.assets.get(id).reference,asset.reference);}
    assert.deepEqual(exported.decoded.world.entities.find(entity=>entity.id==='prop-0'),authoredProp);assert.deepEqual(exported.decoded.assets.get(imported.assetId).bytes,new Uint8Array(model));
    await author.context.close();return {bootBefore,bootAfter,publicPreflight,importRace,export:observed.exported,authorContextClosed:true};
  });

  fresh=await makePage('fresh');
  await check('portable-invalid-carrier-no-allocation',async()=>{
    const before=await ownership(fresh.page),bad=new Uint8Array(exported.bytes);bad[0]^=1;const state=await chooseWorld(fresh.page,bad),after=await ownership(fresh.page);
    assert.equal(state.phase,'empty');assert.match(state.error,/header/);assert.equal(after.host.createdInstances,0);assert.equal(after.contexts.length,0);assert.equal(after.urls,0);assert.equal(after.hasApp,false);assert.deepEqual(before.contexts,after.contexts);return {before,after};
  });
  await check('portable-fresh-world-with-no-fixture-fallback',async()=>{
    const host=await chooseWorld(fresh.page,exported.bytes);assert.equal(host.phase,'ready');assert.equal(host.source,'portable');assert.equal(host.createdInstances,1);assert.equal(host.receipt.authoredReload,true);assert.equal(host.receipt.liveSessionResume,false);
    const state=await fresh.page.evaluate(()=>({world:structuredClone(foundationProbe.world),originals:[...foundationProbe.originals].map(([id,asset])=>({id,bytes:asset.bytes.length,revision:asset.reference.revision})),imports:foundationProbe.imports.length,audio:foundationProbe.audio.sources.size}));
    assert.deepEqual(state.world,exported.decoded.world);assert.equal(state.originals.length,12);assert.equal(state.imports,0);assert.equal(state.audio,6);assert.equal(fixtureAttempts.fresh,0);return {host,originals:state.originals,sideTableImports:state.imports,sources:state.audio};
  });
  await check('portable-normalization-hierarchy-and-collider',async()=>{
    const state=await fresh.page.evaluate(({bodyId,meshId})=>{
      const p=foundationProbe,body=p.nodes.get(bodyId),mesh=p.nodes.get(meshId),item=p.bodies.get(bodyId),roots=mesh.metadata.container.rootNodes;
      return {parent:mesh.parent.metadata.entityId,offset:mesh.position.asArray(),scale:mesh.scaling.asArray(),half:item.collider.halfExtents(),body:item.body.translation(),visual:body.getAbsolutePosition().asArray(),vertices:body.getChildMeshes().reduce((sum,value)=>sum+value.getTotalVertices(),0),roots:roots.map(root=>({name:root.name,translation:root.position.asArray(),scale:root.scaling.asArray(),children:root.getChildren().map(child=>({name:child.name,translation:child.position.asArray(),scale:child.scaling.asArray()}))})),solidCenter:item.collider.containsPoint(item.body.translation())};
    },{bodyId:imported.entityId,meshId:imported.meshEntityId});
    assert.equal(state.parent,imported.entityId);near(state.offset,[5.2,.5,-2].map(value=>-value*5/9));near(state.scale,[5/9,5/9,5/9]);near(Object.values(state.half),[2,35/18,4/3]);near(state.visual,[state.body.x,state.body.y,state.body.z],.001);assert.equal(state.vertices,72);assert(state.solidCenter);
    const nativeNodes=state.roots.flatMap(root=>[root,...root.children]);assert(nativeNodes.some(node=>node.translation.every((value,index)=>Math.abs(value-[4,1,-2][index])<1e-5)&&node.scale.every(value=>Math.abs(value-8)<1e-5)),'Original model-local transform must be preserved below the normalization child');return state;
  });
  await check('portable-media-and-animation-bindings',async()=>{
    const before=await fresh.page.evaluate(()=>({steps:foundationProbe.physicsSteps,animation:foundationProbe.inspect().animations[0],clock:foundationProbe.audio.context.currentTime,video:foundationProbe.video.currentTime}));
    await fresh.page.locator('#start').click();
    await fresh.page.waitForFunction(before=>{const p=foundationProbe,a=p.inspect().animations[0],wall=p.audio.sources.get('wall-playback');return p.audio.context.state==='running'&&p.audio.context.currentTime>before.clock+.2&&p.physicsSteps>before.steps&&a.frame!==before.animation.frame&&a.position.some((value,index)=>Math.abs(value-before.animation.position[index])>.001)&&p.video.currentTime>before.video+.1&&(wall.meterState.history.at(-1)?.inputRms||0)>.01;},before,{timeout:12000});
    const after=await fresh.page.evaluate(()=>{const p=foundationProbe,wall=p.audio.sources.get('wall-playback'),bird=p.nodes.get('bird'),offset=bird.metadata.emitter.localOffset,position=BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.FromArray(offset),bird.getWorldMatrix()).asArray();return {steps:p.physicsSteps,animation:p.inspect().animations[0],audio:p.audio.inspect(),sameElement:wall.source.mediaElement===p.video&&wall.video===p.video,expectedBird:position,descriptors:p.world.entities.flatMap(entity=>entity.components.filter(component=>component.type==='bve:audio-emitter').map(component=>({entityId:entity.id,data:component.data}))),sourceDescriptors:[...p.audio.sources.values()].map(item=>({id:item.id,data:item.descriptor}))};});
    assert.equal(after.audio.contextCount,1);assert.equal(after.audio.sources.length,6);assert(after.sameElement);const wall=after.audio.sources.find(source=>source.id==='wall-playback');assert.equal(wall.mediaSourceCount,1);assert.equal(wall.video.loop,true);assert.equal(wall.video.muted,false);assert(wall.meter.window.inputRms>.01);assert(after.audio.sources.every(source=>source.sameContext&&!source.directSourceToDestination));
    for(const item of after.descriptors)assert.deepEqual(after.sourceDescriptors.find(source=>source.id===item.data.playbackId).data,item.data);
    near(after.audio.sources.find(source=>source.id==='bird-playback').position,after.expectedBird,.00001);return {before,after};
  });
  await check('portable-authored-reexport-restarts-live-state',async()=>{
    const live=await fresh.page.evaluate(()=>({steps:foundationProbe.physicsSteps,videoTime:foundationProbe.video.currentTime,animation:foundationProbe.inspect().animations[0],prop:foundationProbe.nodes.get('prop-0').position.asArray()}));assert(live.steps>0);assert(live.videoTime>0);assert.notDeepEqual(live.prop,[2,4,2]);
    reexported=await saveWorld(fresh.page,'reexported-world.bveworld');observed.reexported=receipt('reexported-world.bveworld',reexported);assert.deepEqual(reexported.bytes,exported.bytes);assert.deepEqual(reexported.decoded.world,exported.decoded.world);return {live,reexport:observed.reexported,authoredReload:true,liveSessionResume:false};
  });
  await check('portable-affine-static-projection',async()=>{
    const world=structuredClone(exported.decoded.world);world.entities.push(...affineEntities());const encoded=await encodePortableWorld(world,reference=>exported.decoded.assets.get(reference.id));await writeFile(output('authored-world.bveworld'),encoded.bytes);variant={bytes:Buffer.from(encoded.bytes),decoded:await decodePortableWorld(encoded.bytes)};observed.variant=receipt('authored-world.bveworld',variant);
    const host=await chooseWorld(fresh.page,variant.bytes);assert.equal(host.phase,'ready');const expected=worldMatrices(variant.decoded.world).get('portable-affine-solid'),corners=[];for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])corners.push(transformPoint(expected,[x*.6,y*.5,z*.4]));
    const result=await fresh.page.evaluate(()=>{const p=foundationProbe,read=()=>{const node=p.nodes.get('portable-affine-solid'),item=p.bodies.get('portable-affine-solid');node.computeWorldMatrix(true);const vertices=Array.from(item.collider.shape.vertices),body=item.body.translation(),points=[];for(let i=0;i<vertices.length;i+=3)points.push([vertices[i]+body.x,vertices[i+1]+body.y,vertices[i+2]+body.z]);return {matrix:node.getWorldMatrix().asArray(),points,position:body,rotation:item.body.rotation()};};const before=read(),snapshot=p.snapshotWorld();p.restoreWorld(snapshot);return {before,after:read(),parent:p.world.entities.find(entity=>entity.id==='portable-affine-parent')};});
    for(const state of [result.before,result.after]){near(state.matrix,expected,.00001);assert.equal(state.points.length,8);for(const point of corners)assert(state.points.some(actual=>Math.hypot(...actual.map((value,index)=>value-point[index]))<.001),'Every authored affine corner must remain in the native hull');near(Object.values(state.rotation),[0,0,0,1]);}
    assert.deepEqual(result.parent,affineEntities()[0]);await fresh.page.screenshot({path:output('portable-world.png')});return {host,expectedMatrix:expected,expectedCorners:corners,...result,variant:observed.variant};
  });
  rollback=await makePage('rollback',{empty:false,failBoot:true});
  await check('portable-native-load-failure-rollback',async()=>{
    // Startup native failure must release ownership and restore the file control.
    await rollback.page.waitForFunction(()=>portableHost.inspect().phase==='empty'&&!!portableHost.inspect().error);const bootFailed=await ownership(rollback.page);assert.equal(bootFailed.host.createdInstances,1);assert(bootFailed.contexts.every(state=>state==='closed'));assert.equal(bootFailed.urls,0);assert.equal(await rollback.page.locator('#world-file').isDisabled(),false);rollback.control.blockFixtures=true;
    const failed=await chooseWorld(rollback.page,exported.bytes);assert.equal(failed.phase,'empty');assert.equal(failed.createdInstances,2);assert.equal(failed.lastFailure.disposed,true);assert.equal(failed.lastFailure.audioClosed,true);assert.equal(failed.lastFailure.nodes,0);assert.equal(failed.lastFailure.urls,0);
    await rollback.page.evaluate(()=>{portableTest.failClose=true;});const retained=await chooseWorld(rollback.page,exported.bytes);assert.equal(retained.phase,'cleanup-failed');assert.equal(retained.createdInstances,3);assert.equal(retained.pendingCleanup.state,'cleanup-failed');assert.equal(retained.pendingCleanup.nodes,0);assert.equal(retained.pendingCleanup.physicsFreed,true);assert.equal(retained.pendingCleanup.sceneDisposed,true);
    const refused=await chooseWorld(rollback.page,exported.bytes);assert.equal(refused.phase,'cleanup-failed');assert.equal(refused.createdInstances,3);
    await rollback.page.evaluate(()=>{portableTest.failClose=false;portableTest.failDecode=false;});const recovered=await chooseWorld(rollback.page,exported.bytes);assert.equal(recovered.phase,'ready');assert.equal(recovered.createdInstances,4);assert.equal(recovered.pendingCleanup,null);const state=await ownership(rollback.page);assert.equal(state.contexts.filter(value=>value!=='closed').length,1);assert.equal(fixtureAttempts.rollback,0);
    return {bootFailed,failed,retained,refused,recovered,ownership:state};
  });
  await check('portable-disposal-releases-instance-resources',async()=>{
    const disposed=[];
    for(const owner of [fresh,rollback]){
      const state=await owner.page.evaluate(async()=>{const p=foundationProbe;portableTest.ownedWorld=structuredClone(p.world);portableTest.ownedOriginals=new Map([...p.allOriginalAssets()].map(([id,asset])=>[id,{reference:structuredClone(asset.reference),mediaType:asset.mediaType,bytes:new Uint8Array(asset.bytes)}]));portableTest.Evaluation=p.constructor;await p.dispose();window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));return {state:p.state,nodes:p.nodes.size,bodies:p.bodies.size,urls:p.urls.length,sources:p.audio.sources.size,audio:p.audio.context.state,sceneDisposed:p.scene.isDisposed,physicsFreed:!p.physics,videos:document.querySelectorAll('video').length,keys:p.keys.size,contexts:portableTest.contexts.map(context=>context.state)};});assertDisposed(state);assert.equal(state.keys,0);assert(state.contexts.every(value=>value==='closed'));disposed.push(state);
    }
    // Direct adapter disposal must wait for a held native decoder, then release
    // the partial scene. It cannot return early or allow another public load.
    await rollback.page.evaluate(()=>{
      portableTest.holdDecode=true;portableTest.releaseDecode=null;const app=portableTest.loadingApp=new portableTest.Evaluation();
      portableTest.loading=app.load(portableTest.ownedWorld,{originals:portableTest.ownedOriginals}).then(()=>{portableTest.loadResult='resolved';},error=>{portableTest.loadResult=error.message;});
    });
    await rollback.page.waitForFunction(()=>typeof portableTest.releaseDecode==='function');
    const pending=await rollback.page.evaluate(async()=>{const app=portableTest.loadingApp;portableTest.disposeSettled=false;portableTest.disposal=app.dispose().then(()=>{portableTest.disposeSettled=true;});let duplicate=null;try{await app.load(portableTest.ownedWorld,{originals:portableTest.ownedOriginals});}catch(error){duplicate=error.message;}await Promise.resolve();return {settled:portableTest.disposeSettled,state:app.state,disposing:app.disposing,duplicate};});
    assert.equal(pending.settled,false);assert.equal(pending.disposing,true);assert.match(pending.duplicate,/fresh evaluation/);
    const cancelled=await rollback.page.evaluate(async()=>{portableTest.holdDecode=false;portableTest.releaseDecode();await Promise.all([portableTest.loading,portableTest.disposal]);const p=portableTest.loadingApp;return {state:p.state,nodes:p.nodes.size,bodies:p.bodies.size,urls:p.urls.length,sources:p.audio.sources.size,audio:p.audio.context.state,sceneDisposed:p.scene.isDisposed,physicsFreed:!p.physics,videos:document.querySelectorAll('video').length,loadResult:portableTest.loadResult};});
    assert.match(cancelled.loadResult,/disposed/);assertDisposed(cancelled);
    return {disposed,pending,cancelled,note:'Two opened-instance disposals and a held native load cancellation; longer repeated-cycle and device-memory qualification remain pending.'};
  });
}catch(error){fatalError=error.stack||String(error);console.error(error.message);}
finally{
  const browserVersion=browser?await browser.version():null;
  const finalized=await finalizeBrowserRun({checks,expectedChecks:9,readSources:()=>fingerprintFiles(evidenceSourcePaths),closeBrowser:()=>browser?.close(),closeServer:()=>server?.close(),diagnostics:()=>({logs,failedRequests,logOverflow})});
  const report={scope:'F05 bounded portable authored-world carrier with exact originals and fresh browser contexts; evaluation only',method:'real-browser',physicalHeadset:false,physicalAudio:false,qualificationStatus:'incomplete',startedAt,candidate:{babylon:'9.30.0',rapier:'0.21.0',typebox:'0.34.52'},environment:{browser:browserVersion,playwright:'1.62.1',flags,graphicsMode:softwareRendering?'SwiftShader':'browser default; hardware not qualified',physicalGPU:false,physicalHeadset:false,physicalAudio:false,viewport:{width:1280,height:720,dpr:1}},fixtureDigests:server?.manifest.sourceFileDigests,comparison:server?.manifest.comparison,build:server?.build,checks,observed,fixtureAttempts,...finalized,missingEvidence:['Production publication, service persistence and authorized multiuser edits.','Generic media upload/transcode and unsupported model conversion.','Live physics, animation or playback session resume; this carrier restores authored state.','Physical headset/audio and target-device performance, memory trend and ten cleanup cycles.']};
  if(fatalError){report.fatalError=fatalError;report.runStatus='failed';}
  await writeFile(output('portable-browser-checks.json'),JSON.stringify(report,null,2)+'\n');await writeFile(output('portable-summary.json'),JSON.stringify({qualificationStatus:'incomplete',evidenceFile:'portable-browser-checks.json',checks:checks.map(({id,status,method})=>({id,status,method})),counts:report.counts,runStatus:report.runStatus},null,2)+'\n');if(server)await writeFile(output('build.json'),JSON.stringify(server.build,null,2)+'\n');
  console.log(JSON.stringify({runStatus:report.runStatus,...report.counts,output:relative(packageRoot,directory)},null,2));if(report.runStatus!=='passed')process.exitCode=1;
}
