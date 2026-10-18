import { chromium } from 'playwright';
import { writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import assert from 'node:assert/strict';
import { packageRoot, artifactRoot, chromeExecutable, softwareRendering } from './config.mjs';
import { isolatedEnvironment } from './environment.mjs';
import { startEvaluationServer } from './server.mjs';
import { fingerprintFiles, buildInputPaths } from './fixtures.mjs';

await mkdir(join(artifactRoot, 'runs'), { recursive: true });
const outputDirectory = await mkdtemp(join(artifactRoot, 'runs/run-'));
const output = name => join(outputDirectory, name);
const startedAt = new Date().toISOString();
const flags = [...(softwareRendering ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []), '--autoplay-policy=document-user-activation-required'];
const logs = [], requests = [], audioEvents = [], checks = [], observed = {};
let server, browser, page;
async function check(id, fn) {
  try { const detail = await fn(); checks.push({id, status:'passed', method:'real-browser', detail}); console.log('PASS '+id); }
  catch (error) { checks.push({id, status:'failed', method:'real-browser', detail:error.stack}); console.log('FAIL '+id+': '+error.message); }
}
const inspect = () => page.evaluate(() => foundationProbe.inspect());
const wait = ms => page.waitForTimeout(ms);
const waitAudio = seconds => page.evaluate(async seconds=>{
  const context=foundationProbe.audio.context,start=context.currentTime,deadline=performance.now()+8000;
  while(context.currentTime-start<seconds) {
    if(context.state!=='running'||performance.now()>deadline)throw new Error('Audio clock did not advance through the required measurement window');
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  return {start,end:context.currentTime,requiredSeconds:seconds};
},seconds);
const missingEvidence = [
  'Physical headset/controller/recenter/seated/wall-adjacent/sleep-resume and actual output audio.',
  'Two real clients, SFU/spatial voice, reconnect/server-authoritative state.',
  'AV marker offset measurement below the 80ms threshold.',
  'Full F03 warmup60s+duration180s+3 repetitions; target-device p95/p99/thermal performance.',
  'Ten cleanup cycles and memory trend under target workload.',
  'Complete portable world export, source-original restoration, general importer/conversion and editor.',
];
try {
  server = await startEvaluationServer();
  browser = await chromium.launch({executablePath:chromeExecutable, headless:true, args:flags, env:await isolatedEnvironment()});
  const context = await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === server.origin || ['blob:', 'data:'].includes(url.protocol) ? route.continue() : route.abort('blockedbyclient');
  });
  page = await context.newPage();
  page.setDefaultTimeout(45000);
  const cdp = await context.newCDPSession(page);
  page.on('console', message => { if (['error','warning','warn'].includes(message.type())) logs.push({type:message.type(),text:message.text()}); });
  page.on('pageerror', error => logs.push({type:'pageerror',text:error.stack}));
  page.on('requestfailed', request => requests.push({url:request.url(),failure:request.failure()}));
  for (const name of ['contextCreated','contextChanged','contextWillBeDestroyed','audioNodeCreated','audioNodeWillBeDestroyed','audioListenerCreated','nodesConnected','nodesDisconnected']) cdp.on('WebAudio.'+name, payload => audioEvents.push({name,payload}));
  await cdp.send('WebAudio.enable');
 await page.goto(server.origin+'/',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.foundationReady||document.getElementById('fatal').textContent,{timeout:45000});
 const fatal=await page.locator('#fatal').textContent();if(fatal)throw new Error(fatal);
 observed.before=await inspect();observed.capabilities=await page.evaluate(()=>qualificationAdapter.probe());
 await page.screenshot({path:output('f03-before-activation.png')});
 await check('real-render-and-frozen-fixtures',async()=>{
   const state=observed.before;assert.equal(state.webglVersion,2);assert.equal(state.rightHanded,true);assert(state.meshes>=70);assert(state.vertices>1500);assert.equal(state.skeletons[0].bones,5);assert(state.animations[0].playing);
   const validation=await page.evaluate(()=>({entities:foundationProbe.world.entities.length,digests:foundationProbe.manifest.sourceFileDigests,assetCount:foundationProbe.assetCache.size}));
   assert.equal(validation.entities,55);return {...validation,canvas:state.canvas,meshes:state.meshes,vertices:state.vertices,renderer:state.renderer};
 });
 await check('user-start-activation',async()=>{
   assert.equal(observed.before.audio.state,'suspended');await page.locator('#start').click();await page.waitForFunction(()=>foundationProbe.audio.context.state==='running');await wait(300);
   const state=await inspect();assert(state.audio.activation.isActive);assert.equal(state.audio.activation.before,'suspended');assert.equal(state.audio.activation.after,'running');
   return {activation:state.audio.activation,note:'Application deliberately suspends audio until Start; this does not prove browser autoplay enforcement.'};
 });
 await check('animated-skinned-creature-and-attached-source',async()=>{
   const a=await inspect();await wait(300);const b=await inspect();assert.notDeepEqual(a.animations[0].position,b.animations[0].position);assert.notEqual(a.animations[0].frame,b.animations[0].frame);
   const sound=b.audio.sources.find(s=>s.id==='bird-playback');assert(Math.hypot(...sound.position.map((v,i)=>v-b.animations[0].position[i]))<.00001);
   return {before:a.animations[0],after:b.animations[0],soundPosition:sound.position};
 });
 await check('desktop-keyboard-movement',async()=>{
   // Measure a fixed amount of actual simulation progress, not the number of
   // frames a software-rendered CI machine happens to schedule in 350 ms.
   // This remains real DOM keyboard input through the running frame loop.
   const inputState=()=>page.evaluate(()=>({eye:foundationProbe.inspect().player.eye,steps:foundationProbe.physicsSteps,keys:[...foundationProbe.keys],focus:document.activeElement?.id,frames:foundationProbe.frames.length,time:performance.now()}));
   await page.evaluate(()=>{foundationProbe.setPlayer([5,1.65,0]);foundationProbe.camera.rotationQuaternion=null;foundationProbe.camera.rotation.set(0,0,0);});
   await page.locator('#scene').focus();
   const observation=observed.keyboardMovement={before:await inputState(),requiredPhysicsSteps:21,timeoutMs:10000};
   try {
     assert.equal(observation.before.focus,'scene');
     await page.keyboard.down('KeyW');observation.pressed=await inputState();
     assert(observation.pressed.keys.includes('KeyW'),'The actual keydown must reach the engine');
     await page.waitForFunction(start=>foundationProbe.physicsSteps>=start+21,observation.pressed.steps,{polling:50,timeout:10000});
     observation.moved=await inputState();
   } finally {
     await page.keyboard.up('KeyW');observation.released=await inputState();
   }
   assert(observation.moved.keys.includes('KeyW'),'The key must remain held during the measured simulation steps');
   assert(!observation.released.keys.includes('KeyW'),'The actual keyup must release engine input');
   assert(observation.moved.eye[2]<observation.before.eye[2]-.1);
   return observation;
 });
 await check('wall-solid-and-open-arch-traversal',async()=>{
   const result=await page.evaluate(()=>{
     const p=foundationProbe;p.setPlayer([-11,1.6,0]);for(let i=0;i<80;i++)p.stepPhysics(1/60,new BABYLON.Vector3(-.1,-.02,0));const wall=p.inspect().player;
     p.setPlayer([0,1.6,1.2]);for(let i=0;i<60;i++)p.stepPhysics(1/60,new BABYLON.Vector3(0,-.02,-.1));const arch=p.inspect().player;
     p.setPlayer([6,1.6,3.8]);for(let i=0;i<60;i++)p.stepPhysics(1/60,new BABYLON.Vector3(0,-.02,-.1));const thinBarrier=p.inspect().player;
     return {wall,arch,thinBarrier};
   });assert(result.wall.position[0]>-11.51);assert(result.wall.position[0]<-11.3);assert(result.arch.position[2]<-3.5);assert(result.thinBarrier.position[2]>3.34);
   return {...result,note:'Real browser Rapier controller steps, including 5cm barrier; single local actor, not server-authoritative multiplayer.'};
 });
 await check('visible-pick-grab-and-throw',async()=>{
   const pixel=await page.evaluate(()=>{
     const p=foundationProbe,node=p.nodes.get('prop-0');const at=node.getAbsolutePosition();p.setPlayer([at.x,1.6,at.z-3]);p.camera.setTarget(at);p.scene.render();const m=node.getChildMeshes().find(m=>m.getTotalVertices());const point=BABYLON.Vector3.Project(m.getBoundingInfo().boundingBox.centerWorld,BABYLON.Matrix.Identity(),p.scene.getTransformMatrix(),p.camera.viewport.toGlobal(p.canvas.width,p.canvas.height));return {x:point.x,y:point.y,id:node.name};
   });await page.mouse.click(pixel.x,pixel.y);assert.equal(await page.locator('#selection').textContent(),'prop-0');await page.keyboard.press('KeyE');assert.equal(await page.evaluate(()=>foundationProbe.held),'prop-0');await wait(150);await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>foundationProbe.held),null);
   const thrown=(await inspect()).bodies.find(b=>b.id==='prop-0');assert(Math.hypot(...thrown.velocity)>1);await wait(650);const after=(await inspect()).bodies.find(b=>b.id==='prop-0');assert(after.position[1]>-.01);
   return {pixel,thrown,after};
 });
 await check('four-simultaneous-corner-sources-and-calibrated-gain',async()=>{
   // The fixture's default 1.65 m eye height starts the capsule above the floor
   // with controller clearance; an already-penetrating pose is not a valid calibration.
   await page.evaluate(()=>{foundationProbe.setPlayer([0,1.65,0]);foundationProbe.camera.rotationQuaternion=null;foundationProbe.camera.rotation.set(0,0,0);});const settling=await waitAudio(.25);
   const center=(await inspect()).audio;const corners=center.sources.filter(s=>s.id.startsWith('corner-'));observed.centerAudio=center;
   assert(Math.hypot(center.listener.position[0],center.listener.position[2])<.001,'Listener must actually remain horizontally centered after collision stepping');
   assert.equal(corners.length,4);assert(corners.every(s=>s.meter.inputs===2&&s.meter.outputs===0&&s.meter.invalidMessages===0&&s.meter.window?.invalidFrames===0&&s.meter.window.droppedWindows===0&&s.meter.window.inputRms>.01&&s.meter.window.postGainRms>.001&&s.rms>0));
   const errors=corners.map(s=>({id:s.id,observedGain:s.meter.window.postGainRms/s.meter.window.inputRms,expectedGain:s.gain,errorDb:20*Math.log10((s.meter.window.postGainRms/s.meter.window.inputRms)/s.gain),window:s.meter.window}));observed.centerGainErrors=errors;assert(errors.every(e=>Math.abs(e.errorDb)<.1));
   assert(errors.every(e=>e.window.gainSamples>0&&Math.abs(20*Math.log10(e.window.gainMin/e.expectedGain))<.1&&Math.abs(20*Math.log10(e.window.gainMax/e.expectedGain))<.1),'Every paired sample must retain the expected gain, not just the window average');
   const calibrated=errors.map(item=>item.observedGain);assert(20*Math.log10(Math.max(...calibrated)/Math.min(...calibrated))<.1,'equal-distance corner gains remain balanced');
   const positions=[[0,1.65,0],[-2,1.65,-2],[-4,1.65,-4],[-5,1.65,-5]];const samples=[];
   for(const position of positions){await page.evaluate(p=>foundationProbe.setPlayer(p),position);await waitAudio(.13);samples.push({position,audio:(await inspect()).audio.sources.filter(s=>s.id.startsWith('corner-')).map(s=>({id:s.id,gain:s.gain,prePannerRms:s.meter.window.postGainRms,observedGain:s.meter.window.postGainRms/s.meter.window.inputRms,window:s.meter.window}))});}
   assert(samples.every(s=>s.audio[0].prePannerRms>0));for(let i=1;i<samples.length;i++){assert(samples[i].audio[0].gain>samples[i-1].audio[0].gain);assert(samples[i].audio[0].observedGain>samples[i-1].audio[0].observedGain);}
   observed.centerAudio=center;return {center:errors,settling,motion:samples,note:'Paired source/post-gain samples measured in the same zero-output AudioWorklet process block. Settled on the audio clock; bird/video are not included in calibration.'};
 });
 await check('listener-turn-changes-left-right-pan-with-fixed-source',async()=>{
   await page.evaluate(()=>{foundationProbe.setPlayer([0,1.65,0]);foundationProbe.camera.rotationQuaternion=null;foundationProbe.camera.rotation.set(0,0,0);});await waitAudio(.18);const before=(await inspect()).audio.sources.find(s=>s.id==='corner-playback-0');
   await page.evaluate(()=>{foundationProbe.camera.rotation.y=Math.PI;foundationProbe.updateListener();});await waitAudio(.25);const after=(await inspect()).audio.sources.find(s=>s.id==='corner-playback-0');
   assert.deepEqual(before.position,after.position);assert(before.stereoRms[0]>before.stereoRms[1]);assert(after.stereoRms[1]>after.stereoRms[0]);return {before,after,note:'Chromium analyser evidence of panning; no human headphones or perceptual test.'};
 });
 await check('video-single-source-play-pause-seek-loop',async()=>{
   await page.evaluate(()=>{foundationProbe.setPlayer([0,1.65,-8]);foundationProbe.camera.setTarget(new BABYLON.Vector3(0,2.2,-11.7));});await waitAudio(.25);
   let played=(await inspect()).audio.sources.find(s=>s.id==='wall-playback');assert.equal(played.mediaSourceCount,1);assert.equal(played.video.muted,false);assert.equal(played.video.volume,1);assert(played.video.currentTime>=0);assert(played.video.decodedFrames>0);
   // The frozen marker is audible for 100 ms of each second. Observe more than
   // one full period on the audio clock, in-page, rather than a short RPC window.
   observed.videoProbe=await page.evaluate(async()=>{
     const graph=foundationProbe.audio,context=graph.context,item=graph.sources.get('wall-playback'),startFrame=Math.ceil(context.currentTime*context.sampleRate),wallStart=performance.now();let samples=[],complete=false;
     while(performance.now()-wallStart<8000) {
       samples=item.meterState.history.filter(window=>window.startFrame>=startFrame);
       complete=context.state==='running'&&samples.length>1&&(samples.at(-1).endFrame-samples[0].startFrame)/context.sampleRate>=1.3;
       if(complete)break;
       await new Promise(resolve=>setTimeout(resolve,10));
     }
     return {startFrame,endFrame:samples.at(-1)?.endFrame,sampleRate:context.sampleRate,wallElapsedMs:performance.now()-wallStart,complete,invalidMessages:item.meterState.invalidMessages,samples};
   });
   assert(observed.videoProbe.complete,'A full audio marker period was not observed');
   assert.equal(observed.videoProbe.invalidMessages,0);assert(observed.videoProbe.samples.every((window,i)=>window.invalidFrames===0&&window.droppedWindows===0&&(i===0||window.startFrame===observed.videoProbe.samples[i-1].endFrame)),'The paired meter must cover consecutive complete audio windows without dropped measurements');
   const rms=observed.videoProbe.samples.map(sample=>sample.inputRms);assert(Math.max(...rms)>.01);
   await page.evaluate(()=>foundationProbe.video.pause());const pausedAt=await page.evaluate(()=>foundationProbe.video.currentTime);await waitAudio(.22);const paused=(await inspect()).audio.sources.find(s=>s.id==='wall-playback');assert(Math.abs(paused.video.currentTime-pausedAt)<.001);assert(paused.inputRms<.000001);
   const seek=await page.evaluate(async()=>{const v=foundationProbe.video;const ready=new Promise(resolve=>v.addEventListener('seeked',resolve,{once:true}));v.currentTime=1;await ready;return {time:v.currentTime,paused:v.paused,width:v.videoWidth,height:v.videoHeight};});assert(Math.abs(seek.time-1)<.05);assert(seek.paused);
   await page.evaluate(async()=>{foundationProbe.video.currentTime=1.85;await foundationProbe.video.play();});await waitAudio(.5);const loop=(await inspect()).audio.sources.find(s=>s.id==='wall-playback');assert(loop.video.currentTime<1.5);assert(loop.video.loop);assert.equal(loop.mediaSourceCount,1);
   observed.video={played,peakInputRms:Math.max(...rms),paused,seek,loop};return {...observed.video,note:'One native element owns both clocks. Timed-marker AV offset and physical playback latency are still unmeasured.'};
 });
 await check('actual-browser-prop-transform-editor',async()=>{
   await page.evaluate(()=>foundationProbe.select('prop-0'));await page.locator('#edit-x').fill('2');await page.locator('#edit-y').fill('1');await page.locator('#edit-z').fill('2');await page.locator('#apply-transform').click();const body=(await inspect()).bodies.find(b=>b.id==='prop-0');assert(Math.abs(body.position[0]-2)<.1);assert(Math.abs(body.position[2]-2)<.1);return {body,status:await page.locator('#status').textContent()};
 });
 await check('json-transform-snapshot-reload',async()=>{
   const value=await page.evaluate(()=>{const p=foundationProbe,snapshot=p.snapshotWorld();const saved=snapshot.entities.find(e=>e.id==='prop-0');p.nodes.get('prop-0').position.x=20;p.bodies.get('prop-0').body.setTranslation(p.nodes.get('prop-0').position,true);const identity=p.audio.mediaSources.get(p.video);p.restoreWorld(snapshot);return {saved,restored:p.nodes.get('prop-0').position.asArray(),sourceIdentityPreserved:identity===p.audio.mediaSources.get(p.video),assetIds:snapshot.assets.map(a=>a.id),entityIds:snapshot.entities.map(a=>a.id)};});assert(value.sourceIdentityPreserved);assert(Math.abs(value.restored[0]-value.saved.transform.translation[0])<.000001);return {...value,note:'In-session descriptor snapshot only. Full portable world bundle/original-byte reload remains unimplemented.'};
 });
 await check('scene-glb-export-reimport',async()=>{const result=await page.evaluate(()=>foundationProbe.checkGLBRoundTrip());assert(result.bytes>1000);assert(result.meshes>50);assert(result.skeletons>=1);return result;});
 await check('drop-glb-through-browser-dnd',async()=>{
   const gltf=JSON.parse(server.resources.get('models/prop.gltf').bytes);gltf.nodes[0].translation=[100,0,0];gltf.nodes[0].scale=[10,10,10];const binary=Buffer.from(gltf.buffers[0].uri.split(',')[1],'base64');delete gltf.buffers[0].uri;const jsonBytes=Buffer.from(JSON.stringify(gltf));const jsonPad=Buffer.concat([jsonBytes,Buffer.alloc((4-jsonBytes.length%4)%4,32)]);const binPad=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);const total=12+8+jsonPad.length+8+binPad.length;const out=Buffer.alloc(total);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(total,8);out.writeUInt32LE(jsonPad.length,12);out.writeUInt32LE(0x4e4f534a,16);jsonPad.copy(out,20);const offset=20+jsonPad.length;out.writeUInt32LE(binPad.length,offset);out.writeUInt32LE(0x004e4942,offset+4);binPad.copy(out,offset+8);await writeFile(output('derived-prop.glb'),out);
   const transfer=await page.evaluateHandle(bytes=>{const file=new File([new Uint8Array(bytes)],'derived-prop.glb',{type:'model/gltf-binary'});const transfer=new DataTransfer();transfer.items.add(file);return transfer;},[...out]);await page.dispatchEvent('body','drop',{dataTransfer:transfer});await page.waitForFunction(()=>foundationProbe.imports.length===1);const imported=(await inspect()).imports[0];assert(imported.vertices>0);assert.equal(imported.revision,createHash('sha256').update(out).digest('hex'));const alignment=await page.evaluate(id=>{const p=foundationProbe,node=p.nodes.get(id);node.computeWorldMatrix(true);const inverse=node.getWorldMatrix().clone().invert(),min=new BABYLON.Vector3(Infinity,Infinity,Infinity),max=new BABYLON.Vector3(-Infinity,-Infinity,-Infinity);for(const mesh of node.getChildMeshes()){if(!mesh.getTotalVertices())continue;mesh.computeWorldMatrix(true);for(const point of mesh.getBoundingInfo().boundingBox.vectorsWorld){const local=BABYLON.Vector3.TransformCoordinates(point,inverse);min.minimizeInPlace(local);max.maximizeInPlace(local);}}const center=min.add(max).scale(.5),body=p.bodies.get(id).body.translation();return {localCenter:center.asArray(),distance:center.length(),body:[body.x,body.y,body.z],node:node.position.asArray()};},imported.entityId);assert(alignment.distance<.01,JSON.stringify(alignment));assert(Math.hypot(...alignment.node.map((value,i)=>value-alignment.body[i]))<.00001);assert(imported.normalization.scale<1);return {...imported,alignment,note:'Off-center, oversized derivative of the frozen prop checks normalized geometry/collider alignment.'};
 });
 await check('untrusted-external-model-uri-rejected',async()=>{
   const response=await page.evaluate(async()=>{const before=foundationProbe.imports.length;try{await foundationProbe.importFile(new File([JSON.stringify({asset:{version:'2.0'},buffers:[{byteLength:1,uri:'https://example.invalid/should-not-fetch.bin'}]})],'external.gltf'));return {accepted:true};}catch(e){return {accepted:false,message:e.message,countBefore:before,countAfter:foundationProbe.imports.length};}});assert.equal(response.accepted,false);assert.equal(response.countBefore,response.countAfter);return response;
 });
 await check('failed-babylon-load-rolls-back-partial-resources',async()=>{
   const result=await page.evaluate(async()=>{
     const p=foundationProbe,before=p.importState(),fixture=await fetch('/fixtures/models/prop.gltf').then(response=>response.json());
     fixture.materials[0].alphaMode='INTENTIONAL_INVALID_ALPHA_MODE';
     const revoked=[],revoke=URL.revokeObjectURL;URL.revokeObjectURL=value=>{revoked.push(value);return revoke.call(URL,value);};
     try {await p.importFile(new File([JSON.stringify(fixture)],'invalid-material.gltf'));throw new Error('Invalid material unexpectedly loaded');}
     catch(error){return {before,after:p.importState(),message:error.message,rollback:p.lastImportRollback,revoked:revoked.length};}
     finally{URL.revokeObjectURL=revoke;}
   });assert.match(result.message,/alphaMode|alpha mode/i);assert.deepEqual(result.after,result.before);assert(result.rollback.created.meshes>0);assert(result.rollback.created.materials>0);assert.equal(result.revoked,1);assert.deepEqual(result.rollback.cleanupErrors,[]);return result;
 });
 await check('failed-collider-publication-rolls-back-real-body-and-model',async()=>{
   const result=await page.evaluate(async()=>{
     const p=foundationProbe,before=p.importState(),fixture=await fetch('/fixtures/models/prop.gltf').then(response=>response.text());
     const addBody=p.addBody;let created=false;p.addBody=function(...args){addBody.apply(this,args);created=true;throw new Error('Intentional collider publication failure');};
     const revoked=[],revoke=URL.revokeObjectURL;URL.revokeObjectURL=value=>{revoked.push(value);return revoke.call(URL,value);};
     try {await p.importFile(new File([fixture],'failed-collider.gltf'));throw new Error('Injected collider failure unexpectedly committed');}
     catch(error){return {before,after:p.importState(),created,message:error.message,rollback:p.lastImportRollback,revoked:revoked.length};}
     finally{p.addBody=addBody;URL.revokeObjectURL=revoke;}
   });assert.equal(result.created,true);assert.match(result.message,/Intentional collider publication failure/);assert.deepEqual(result.after,result.before);assert(result.rollback.created.meshes>0);assert.equal(result.revoked,1);assert.deepEqual(result.rollback.cleanupErrors,[]);return result;
 });
 await check('unmodified-vrspace-asset-loader-reuse',async()=>{const result=await page.evaluate(()=>foundationProbe.testVRSpaceAssetLoader());assert(result.loadedMeshes>0);assert(result.instancedRoots>0);assert.equal(result.instanceCount,2);assert(result.containerIdentity);assert.equal(result.meshesAfter,result.meshesBefore);assert.equal(result.remainingContainers,0);return result;});
 await check('devtools-observed-single-context-audio-routing',async()=>{
   const nodes=audioEvents.filter(e=>e.name==='audioNodeCreated').map(e=>e.payload.node),connections=audioEvents.filter(e=>e.name==='nodesConnected').map(e=>e.payload);
   const contexts=audioEvents.filter(e=>e.name==='contextCreated').map(e=>e.payload.context),listeners=audioEvents.filter(e=>e.name==='audioListenerCreated');
   const media=nodes.filter(n=>n.nodeType.includes('MediaElement'));const buffers=nodes.filter(n=>n.nodeType.includes('BufferSource'));const panners=nodes.filter(n=>n.nodeType==='Panner');
   assert.equal(contexts.length,1);assert.equal(listeners.length,1);assert.equal(media.length,1);assert.equal(buffers.length,5);assert.equal(panners.length,6);
   const meterState=(await inspect()).audio.sources.map(source=>({id:source.id,...source.meter}));assert(meterState.every(meter=>meter.inputs===2&&meter.outputs===0&&meter.invalidMessages===0&&meter.window?.invalidFrames===0&&meter.window.droppedWindows===0));
   const map=new Map(nodes.map(n=>[n.nodeId,n]));const next=id=>connections.filter(e=>e.sourceId===id).map(e=>map.get(e.destinationId));
   const routes=[...media,...buffers].map(source=>{const gain=next(source.nodeId).find(n=>n.nodeType==='Gain');const panner=gain&&next(gain.nodeId).find(n=>n.nodeType==='Panner');const volume=panner&&next(panner.nodeId).find(n=>n.nodeType==='Gain');const master=volume&&next(volume.nodeId).find(n=>n.nodeType==='Gain');const dest=master&&next(master.nodeId).find(n=>n.nodeType.includes('Destination'));assert(gain&&panner&&volume&&master&&dest);assert(!next(source.nodeId).some(n=>n.nodeType.includes('Destination')));return {source:source.nodeType,sourceId:source.nodeId,types:[gain.nodeType,panner.nodeType,volume.nodeType,master.nodeType,dest.nodeType]};});
   observed.audioGraph={contexts,listeners:listeners.length,nodeTypes:nodes.reduce((m,n)=>(m[n.nodeType]=(m[n.nodeType]||0)+1,m),{}),routes,analysisOnlyMeters:meterState};return observed.audioGraph;
 });
 observed.final=await inspect();await page.evaluate(()=>{foundationProbe.select(null);foundationProbe.setPlayer([0,1.6,8]);foundationProbe.camera.setTarget(new BABYLON.Vector3(0,1.8,-4));});await wait(150);await page.screenshot({path:output('courtyard-verified.png')});
 await check('dispose-releases-browser-resources-and-input-ownership',async()=>{
   const before=audioEvents.filter(e=>e.name==='contextCreated').length;await page.evaluate(()=>foundationProbe.dispose());
   const initial=await page.evaluate(()=>({status:document.getElementById('status').textContent,steps:foundationProbe.physicsSteps}));
   await page.evaluate(async()=>{
     const p=foundationProbe;window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE'}));window.dispatchEvent(new Event('resize'));
     document.getElementById('scene').dispatchEvent(new PointerEvent('pointerdown',{pointerId:999,clientX:10,clientY:10}));
     for(const button of document.querySelectorAll('button'))button.dispatchEvent(new MouseEvent('click'));
     const transfer=new DataTransfer();transfer.items.add(new File(['{}'],'after-dispose.gltf'));window.dispatchEvent(new DragEvent('drop',{dataTransfer:transfer}));
     try{await p.importFile(new File(['{}'],'direct-after-dispose.gltf'));throw new Error('Disposed import unexpectedly accepted');}catch(error){if(error.message!=='Evaluation is disposed')throw error;}
     await p.dispose();
   });await wait(150);
   const actual=await page.evaluate(()=>({state:foundationProbe.state,audioState:foundationProbe.audio.context.state,videoElements:document.querySelectorAll('video').length,sceneDisposed:foundationProbe.scene.isDisposed,keys:foundationProbe.keys.size,nodes:foundationProbe.nodes.size,bodies:foundationProbe.bodies.size,urls:foundationProbe.urls.length,aborted:foundationProbe.inputController.signal.aborted,allControlsDisabled:[...document.querySelectorAll('button,input')].every(element=>element.disabled&&element.onclick===null&&element.onchange===null),status:document.getElementById('status').textContent,steps:foundationProbe.physicsSteps}));
   assert.equal(actual.state,'disposed');assert.equal(actual.audioState,'closed');assert.equal(actual.videoElements,0);assert(actual.sceneDisposed);assert(actual.aborted);assert(actual.allControlsDisabled);for(const key of ['keys','nodes','bodies','urls'])assert.equal(actual[key],0);assert.equal(actual.status,initial.status);assert.equal(actual.steps,initial.steps);
   return {...actual,contextsCreated:before,note:'One disposal cycle, including actual post-dispose DOM input and an idempotent second disposal; the 10-cycle hardware/memory measurement is not claimed.'};
 });
 const errors=logs.filter(log=>['error','pageerror'].includes(log.type));
 const result={
   scope:'F05 local browser adaptation evidence; partial evaluation, not production-card or hardware acceptance',qualificationStatus:'incomplete',
   startedAt,timestamp:new Date().toISOString(),
   candidate:{babylon:'9.30.0',rapier:'0.21.0',vrspaceCommit:'61f840a3dd0133fc9d357891f37eb1670b147539'},
   environment:{browser:await browser.version(),playwright:'1.62.1',flags,viewport:{width:1280,height:720,dpr:1},graphicsMode:softwareRendering?'SwiftShader':'browser default; hardware not qualified',physicalGPU:softwareRendering?false:'unverified',physicalHeadset:false,physicalAudio:false,subprocessEnvironment:'Explicit evaluation allowlist; empty npm configuration and separate cache/browser paths; HOME/USERPROFILE are not overridden or forwarded.'},
   fixtureDigests:server.manifest.sourceFileDigests,comparison:server.manifest.comparison,build:server.build,
   sourceDigests:await fingerprintFiles([...buildInputPaths,'config.mjs','environment.mjs','fixtures.mjs','server.mjs','run.mjs','browser-checks.mjs','test/local-server.test.mjs','test/import-policy.test.mjs']),
   checks,observed,logs,failedRequests:requests,missingEvidence,audioEvents,
   counts:{passed:checks.filter(check=>check.status==='passed').length,failed:checks.filter(check=>check.status==='failed').length,pageErrors:errors.length,failedRequests:requests.length},
 };
 result.runStatus=result.counts.passed===19&&result.counts.failed===0&&errors.length===0&&requests.length===0?'passed':'failed';
 await writeFile(output('browser-checks.json'),JSON.stringify(result,null,2)+'\n');
 const summary={scope:result.scope,qualificationStatus:result.qualificationStatus,startedAt,timestamp:result.timestamp,candidate:result.candidate,environment:result.environment,fixtureDigests:result.fixtureDigests,comparison:result.comparison,runStatus:result.runStatus,counts:result.counts,checks:checks.map(({id,status,method})=>({id,status,method})),softwareRenderTiming:observed.final.renderTiming,missingEvidence,evidenceFile:'browser-checks.json'};
 await writeFile(output('f05-summary.json'),JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify({runStatus:result.runStatus,...result.counts,output:relative(packageRoot,outputDirectory)},null,2));
 if(result.runStatus!=='passed')process.exitCode=1;
} catch (error) {
 await writeFile(output('browser-checks-fatal.json'),JSON.stringify({scope:'F05 incomplete local run; not acceptance',startedAt,timestamp:new Date().toISOString(),runStatus:'failed',error:error.stack,logs,checks,audioEvents},null,2)+'\n');
 if(page)await page.screenshot({path:output('browser-checks-fatal.png')}).catch(()=>{});
 console.error(error.message);console.error('Failed-run evidence: '+relative(packageRoot,outputDirectory));process.exitCode=1;
} finally {
 try { await browser?.close(); }
 finally { await server?.close(); }
}
