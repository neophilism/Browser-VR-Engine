import { chromium } from 'playwright';
import { finalizeBrowserRun } from './browser-finalize.mjs';
import { build } from 'esbuild';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import assert from 'node:assert/strict';
import { packageRoot, artifactRoot, chromeExecutable, softwareRendering } from '../config.mjs';
import { isolatedEnvironment } from '../environment.mjs';
import { startEvaluationServer } from '../server.mjs';
import { fingerprintFiles, evidenceSourcePaths } from '../fixtures.mjs';

// Only the test harness injects IWER. The served application never imports it.
const injection=await build({absWorkingDir:packageRoot,bundle:true,write:false,platform:'browser',format:'iife',target:'es2022',stdin:{resolveDir:packageRoot,contents:`
  import {XRDevice,metaQuest3,XRReferenceSpace,GlobalSpace,XRRigidTransform,P_SPACE} from 'iwer';
  // IWER2.6.0 passes a transform object to its matrix-copy constructor. Keep
  // this spec correction in test injection only; installed bytes stay intact.
  const base=new XRReferenceSpace('local-floor',new GlobalSpace()),offset=new XRRigidTransform({x:3,y:0,z:-7});
  const originalOffset=XRReferenceSpace.prototype.getOffsetReferenceSpace;
  const invalidBefore=[...originalOffset.call(base,offset)[P_SPACE].offsetMatrix].filter(value=>!Number.isFinite(value)).length;
  if(invalidBefore!==16)throw Error('The pinned IWER offset defect changed; review this test-only adapter.');
  XRReferenceSpace.prototype.getOffsetReferenceSpace=function(originOffset){return originalOffset.call(this,originOffset.matrix);};
  const corrected=[...base.getOffsetReferenceSpace(offset)[P_SPACE].offsetMatrix];
  const device=new XRDevice(metaQuest3,{stereoEnabled:true,visibilityMaskEnabled:false});
  device.controlMode='programmatic';device.position.set(0,1.6,0);device.quaternion.set(0,0,0,1);
  device.installRuntime({forceInstall:true,polyfillLayers:false});
  const original=navigator.xr.requestSession.bind(navigator.xr);
  const probe=window.xrTest={device,requests:[],fault:null,pending:null,lateSession:null,lateEndEvents:0,offsetAdapter:{invalidBefore,corrected}};
  navigator.xr.requestSession=(mode,options)=>{
    if(probe.requests.length>=20)throw Error('Test request budget exceeded');
    probe.requests.push({mode,options,activation:navigator.userActivation.isActive});
    if(probe.fault==='deny')return Promise.reject(new DOMException('Synthetic denial','NotAllowedError'));
    if(probe.fault==='hold')return new Promise((resolve,reject)=>{probe.pending=async()=>{try{const session=await original(mode,options);probe.lateSession=session;session.addEventListener('end',()=>probe.lateEndEvents++,{once:true});resolve(session);}catch(error){reject(error);}};});
    return original(mode,options);
  };
`}});
await mkdir(join(artifactRoot,'xr-runs'),{recursive:true});
const directory=await mkdtemp(join(artifactRoot,'xr-runs/run-')),output=name=>join(directory,name),startedAt=new Date().toISOString();
const checks=[],logs=[],failedRequests=[];
const flags=[...(softwareRendering?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]),'--autoplay-policy=document-user-activation-required'];
let browser,server,page,logOverflow=0;
const log=value=>{if(logs.length<200)logs.push(value);else logOverflow=Math.min(logOverflow+1,1000);};
const inspect=()=>page.evaluate(()=>({xr:foundationProbe.inspectXR(),player:foundationProbe.inspect().player,audio:foundationProbe.audio.inspect(),physicsSteps:foundationProbe.physicsSteps}));
const frameWindow=async(count=5)=>{
  const start=await page.evaluate(()=>foundationProbe.xr.frames);
  await page.waitForFunction(({start,count})=>foundationProbe.xr.frames>=start+count,{start,count},{timeout:15000});
  return {start,end:await page.evaluate(()=>foundationProbe.xr.frames)};
};
const physicsWindow=async(count=30)=>{
  const start=await page.evaluate(()=>foundationProbe.physicsSteps);
  await page.waitForFunction(({start,count})=>foundationProbe.physicsSteps>=start+count,{start,count},{timeout:15000});
  return {start,end:await page.evaluate(()=>foundationProbe.physicsSteps)};
};
async function check(id,action){
  try{const detail=await action();checks.push({id,status:'passed',method:'emulated-browser',detail});console.log('PASS '+id);}
  catch(error){checks.push({id,status:'failed',method:'emulated-browser',detail:error.stack,observed:page?await inspect().catch(()=>null):null});throw error;}
}
const closeEnough=(actual,expected,tolerance=.015)=>{assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i]-expected[i])<=tolerance,JSON.stringify({actual,expected,tolerance}));};
async function enterAt(position){
  await page.evaluate(position=>{const p=foundationProbe;p.setPlayer(position);p.camera.rotationQuaternion=null;p.camera.rotation.set(0,0,0);xrTest.device.position.set(0,1.6,0);xrTest.device.quaternion.set(0,0,0,1);},position);
  await page.locator('#xr').click();
  await page.waitForFunction(()=>foundationProbe.xr.phase==='immersive'||foundationProbe.xr.error);
  const state=await inspect();assert.equal(state.xr.phase,'immersive',JSON.stringify(state.xr));await frameWindow();
  const settled=await inspect();closeEnough([settled.xr.pose.position[0],settled.xr.pose.position[2]],[settled.player.position[0],settled.player.position[2]],.01);return settled;
}
async function desktopExit(){await page.keyboard.press('Escape');await page.waitForFunction(()=>!foundationProbe.xr.active&&!foundationProbe.xr.busy);}

try{
  server=await startEvaluationServer();
  browser=await chromium.launch({executablePath:chromeExecutable,headless:true,args:flags,env:await isolatedEnvironment()});
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
  await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===server.origin||['blob:','data:'].includes(url.protocol)?route.continue():route.abort('blockedbyclient');});
  await context.addInitScript({content:injection.outputFiles[0].text});
  page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',error=>log({type:'pageerror',text:error.stack}));
  page.on('console',message=>{if(['error','warning','warn'].includes(message.type()))log({type:message.type(),text:message.text()});});
  page.on('requestfailed',request=>{if(failedRequests.length<100)failedRequests.push({url:request.url(),failure:request.failure()});});
  await page.goto(server.origin+'/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.foundationReady||document.getElementById('fatal').textContent);
  assert.equal(await page.locator('#fatal').textContent(),'');
  await page.waitForFunction(()=>foundationProbe.xr.phase==='ready');

  await check('emulated-capability-does-not-request-session',async()=>{
    const state=await inspect(),requests=await page.evaluate(()=>xrTest.requests);
    assert.equal(state.xr.active,false);assert.equal(state.xr.supported,true);assert.equal(requests.length,0);assert.equal(state.xr.activeCamera,'desktop-camera');
    const offsetAdapter=await page.evaluate(()=>xrTest.offsetAdapter);assert.equal(offsetAdapter.invalidBefore,16);closeEnough(offsetAdapter.corrected,[1,0,0,0,0,1,0,0,0,0,1,0,3,0,-7,1],1e-6);
    assert.equal(state.audio.contextCount,1);return {xr:state.xr,requests,offsetAdapter};
  });
  await check('emulated-permission-denial-visible-and-dismissible',async()=>{
    await page.evaluate(()=>{xrTest.fault='deny';});await page.locator('#xr').click();
    await page.waitForFunction(()=>foundationProbe.xr.phase==='error'&&!foundationProbe.xr.busy);
    const state=await inspect();assert.equal(state.xr.error.code,'NotAllowedError');assert.equal(state.xr.active,false);assert.equal(state.xr.activeCamera,'desktop-camera');
    assert.equal(await page.locator('#xr-dismiss').isVisible(),true);assert.match(await page.locator('#xr-status').textContent(),/denied/);
    await page.locator('#xr-dismiss').click();assert.equal((await inspect()).xr.phase,'ready');await page.evaluate(()=>{xrTest.fault=null;});return {xr:state.xr,syntheticFault:'requestSession rejection'};
  });
  await check('emulated-cancelled-late-grant-never-starts-xr-renderer',async()=>{
    await page.evaluate(()=>{xrTest.fault='hold';});await page.locator('#xr').click();
    await page.waitForFunction(()=>!!xrTest.pending);await page.locator('#xr').click();assert.equal((await inspect()).xr.phase,'cancelling');
    await page.evaluate(()=>xrTest.pending());await page.waitForFunction(()=>foundationProbe.xr.phase==='ready'&&!foundationProbe.xr.busy);
    const state=await inspect();assert.equal(state.xr.active,false);assert.equal(state.xr.frames,0);assert.equal(state.xr.activeCamera,'desktop-camera');
    const lateEnd=await page.evaluate(()=>({events:xrTest.lateEndEvents,deviceActive:!!xrTest.device.activeSession}));assert.equal(lateEnd.events,1);assert.equal(lateEnd.deviceActive,false);
    await page.evaluate(()=>{xrTest.fault=null;xrTest.pending=null;});return {xr:state.xr,lateEnd,syntheticFault:'permission grant held until after cancellation'};
  });
  await check('emulated-session-renders-stereo-through-babylon',async()=>{
    const state=await enterAt([0,1.65,8]);assert.equal(state.xr.active,true);assert.equal(state.xr.referenceSpace,'local-floor');assert.equal(state.xr.rigCameras,2);assert.equal(state.xr.baseLayer,true);assert.notEqual(state.xr.activeCamera,'desktop-camera');assert.equal(state.xr.visuals.exitEnabled,true);
    const rendering=await page.evaluate(()=>{const p=foundationProbe,m=p.xr.experience.helper.sessionManager;return {customRequester:!!p.engine.customAnimationFrameRequester,inXRSession:m.inXRSession,framebuffer:[m.session.renderState.baseLayer.framebufferWidth,m.session.renderState.baseLayer.framebufferHeight],rigs:p.xr.experience.helper.camera.rigCameras.map(camera=>({projection:camera.getProjectionMatrix().asArray(),position:camera.globalPosition.asArray()})),request:xrTest.requests.at(-1)};});
    assert(rendering.customRequester&&rendering.inXRSession);assert(rendering.framebuffer.every(n=>n>0));assert(rendering.rigs.every(r=>r.projection.length===16&&r.projection.every(Number.isFinite)));assert(rendering.request.activation);assert.deepEqual(rendering.request.options.requiredFeatures,['local-floor']);
    await page.screenshot({path:output('emulated-stereo.png')});return {xr:state.xr,rendering};
  });
  await check('emulated-head-pose-drives-one-shared-spatial-listener',async()=>{
    const before=await inspect();await page.evaluate(()=>{xrTest.device.position.set(.4,1.75,.2);xrTest.device.quaternion.set(0,Math.sin(Math.PI/4),0,Math.cos(Math.PI/4));});const frames=await frameWindow();const after=await inspect();
    closeEnough(after.xr.pose.position.map((v,i)=>v-before.xr.pose.position[i]),[.4,.15,.2]);closeEnough(after.xr.pose.forward,[-1,0,0]);
    closeEnough(after.audio.listener.position,after.xr.pose.position,1e-6);closeEnough(after.audio.listener.forward,after.xr.pose.forward,1e-6);closeEnough(after.audio.listener.up,after.xr.pose.up,1e-6);
    assert.equal(after.audio.contextCount,1);assert.equal(after.audio.sources.length,6);assert.equal(after.audio.sources.find(source=>source.id==='wall-playback').mediaSourceCount,1);assert(after.audio.sources.every(source=>source.sameContext&&!source.directSourceToDestination));
    assert.equal(await page.locator('#home').isDisabled(),true);assert.equal(await page.locator('#center').isDisabled(),true);
    const blocked=await page.evaluate(async()=>{try{await foundationProbe.importFile(new File(['{}'],'during-xr.gltf'));return false;}catch(error){return error.message.includes('Leave VR');}});assert(blocked);
    return {frames,before:before.xr.pose,after:after.xr.pose,listener:after.audio.listener,contexts:after.audio.contextCount,wallMediaSources:1};
  });
  await check('emulated-visibility-mutes-pauses-input-and-restores-output',async()=>{
    const originalGain=(await inspect()).audio.outputGain;
    await page.evaluate(()=>{xrTest.device.controllers.left.updateAxes('thumbstick',0,-1);xrTest.device.updateVisibilityState('hidden');});
    await page.waitForFunction(()=>foundationProbe.xr.visibility==='hidden');const before=await inspect();const steps=await physicsWindow();const hidden=await inspect();
    assert.equal(hidden.audio.outputGain,0);closeEnough(hidden.player.position.filter((_,i)=>i!==1),before.player.position.filter((_,i)=>i!==1),.001);
    await page.evaluate(()=>{xrTest.device.controllers.left.updateAxes('thumbstick',0,0);xrTest.device.updateVisibilityState('visible');});await page.waitForFunction(()=>foundationProbe.xr.visibility==='visible');await frameWindow();const restored=await inspect();assert.equal(restored.audio.outputGain,originalGain);
    await desktopExit();const returned=await inspect();assert.equal(returned.xr.activeCamera,'desktop-camera');assert.equal(returned.xr.visuals,null);return {steps,hiddenGain:hidden.audio.outputGain,restoredGain:restored.audio.outputGain,returned:returned.xr};
  });
  await check('emulated-thumbstick-moves-and-collides-with-frozen-thin-barrier',async()=>{
    const before=await enterAt([6,1.65,3.8]);await page.evaluate(()=>xrTest.device.controllers.left.updateAxes('thumbstick',0,-1));const steps=await physicsWindow(90);await page.evaluate(()=>xrTest.device.controllers.left.updateAxes('thumbstick',0,0));await frameWindow();const after=await inspect();
    assert(after.player.position[2]<before.player.position[2]-.1,'Thumbstick must cause real collision-controller progress');assert(after.player.position[2]>3.34,'The 5 cm barrier must prevent artificial locomotion through it');closeEnough(after.audio.listener.position,after.xr.pose.position,1e-6);
    closeEnough([after.xr.pose.position[0],after.xr.pose.position[2]],[after.player.position[0],after.player.position[2]],.01);
    await desktopExit();return {steps,before:before.player,after:after.player,pose:after.xr.pose};
  });
  await check('emulated-physical-head-overlap-warns-without-clamping-tracking',async()=>{
    const before=await enterAt([6,1.65,3.8]);await page.evaluate(()=>xrTest.device.position.set(0,1.6,-.8));const frames=await frameWindow();const after=await inspect();
    closeEnough(after.xr.pose.position.map((v,i)=>v-before.xr.pose.position[i]),[0,0,-.8]);assert.equal(after.xr.pose.nearGeometry,true);assert.equal(after.xr.visuals.warningEnabled,true);
    closeEnough(after.player.position.filter((_,i)=>i!==1),before.player.position.filter((_,i)=>i!==1),.001);await desktopExit();return {frames,before:before.xr.pose,after:after.xr.pose,body:after.player.position};
  });
  await check('emulated-controller-ray-select-exits-with-renderer-cleanup',async()=>{
    await enterAt([0,1.65,8]);await page.evaluate(()=>{const c=xrTest.device.controllers.right,a=-Math.atan2(.32,1.1);c.position.set(0,1.6,0);c.quaternion.set(Math.sin(a/2),0,0,Math.cos(a/2));});await frameWindow();
    await page.evaluate(()=>xrTest.device.controllers.right.updateButtonValue('trigger',1));await page.waitForFunction(()=>!foundationProbe.xr.active&&!foundationProbe.xr.busy);await page.evaluate(()=>xrTest.device.controllers.right.updateButtonValue('trigger',0));
    const state=await inspect();assert.equal(state.xr.activeCamera,'desktop-camera');assert.equal(state.xr.visuals,null);assert.equal(await page.evaluate(()=>foundationProbe.engine.customAnimationFrameRequester),null);return {xr:state.xr,selection:'Actual IWER input-source select event reaches the Babylon ray/Exit VR plane'};
  });
  await check('emulated-dispose-ends-live-session-and-removes-controls',async()=>{
    // Keep the click handler's audio await alive beyond disposal, and hold the
    // actual audio cleanup briefly to prove concurrent disposal awaits it.
    await page.evaluate(()=>{foundationProbe.audio.activate=()=>new Promise(resolve=>{xrTest.releaseActivation=resolve;});});
    await enterAt([0,1.65,8]);
    await page.evaluate(()=>{
      const p=foundationProbe,disposeAudio=p.audio.dispose.bind(p.audio),gate=new Promise(resolve=>{xrTest.releaseCleanup=resolve;});
      p.audio.dispose=async()=>{xrTest.cleanupEntered=true;await gate;return disposeAudio();};
      xrTest.firstDisposal=p.dispose();
    });
    await page.waitForFunction(()=>foundationProbe.stopped&&xrTest.cleanupEntered);
    const early=await page.evaluate(async()=>{xrTest.secondSettled=false;xrTest.secondDisposal=foundationProbe.dispose().then(()=>{xrTest.secondSettled=true;});await Promise.resolve();await Promise.resolve();return xrTest.secondSettled;});assert.equal(early,false);
    await page.evaluate(async()=>{xrTest.releaseCleanup();await Promise.all([xrTest.firstDisposal,xrTest.secondDisposal]);xrTest.statusAfterDispose=document.getElementById('xr-status').textContent;xrTest.releaseActivation();await Promise.resolve();await Promise.resolve();});
    const state=await page.evaluate(()=>({state:foundationProbe.state,xr:foundationProbe.xr.inspect(),sceneDisposed:foundationProbe.scene.isDisposed,audioState:foundationProbe.audio.context.state,controlsDisabled:[...document.querySelectorAll('button,input')].every(element=>element.disabled&&element.onclick===null&&element.onchange===null),observers:foundationProbe.xr.observers.length,sessionListeners:foundationProbe.xr.sessionListeners.length,steps:foundationProbe.physicsSteps}));
    assert.equal(state.state,'disposed');assert.equal(state.xr.phase,'disposed');assert.equal(state.xr.active,false);assert(state.sceneDisposed&&state.controlsDisabled);assert.equal(state.audioState,'closed');assert.equal(state.observers,0);assert.equal(state.sessionListeners,0);
    assert.equal(await page.locator('#xr-status').textContent(),await page.evaluate(()=>xrTest.statusAfterDispose));
    await page.evaluate(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));for(const button of document.querySelectorAll('button'))button.dispatchEvent(new MouseEvent('click'));});assert.equal(await page.evaluate(()=>foundationProbe.physicsSteps),state.steps);return state;
  });
}catch(error){
  if(!checks.some(check=>check.status==='failed'))checks.push({id:'xr-run-infrastructure',status:'failed',method:'emulated-browser',detail:error.stack});
  console.error(error.message);if(page)await page.screenshot({path:output('emulated-failed.png')}).catch(()=>{});
}finally{
  const browserVersion=browser?await browser.version():null;
  const finalized=await finalizeBrowserRun({checks,expectedChecks:10,readSources:()=>fingerprintFiles(evidenceSourcePaths),closeBrowser:()=>browser?.close(),closeServer:()=>server?.close(),diagnostics:()=>({logs,failedRequests,logOverflow})});
  const report={scope:'F05 WebXR software lifecycle under test-only IWER; physical headset qualification remains pending',method:'emulated-browser',physicalHeadset:false,physicalAudio:false,qualificationStatus:'incomplete',startedAt,candidate:{babylon:'9.30.0',rapier:'0.21.0',iwer:'2.6.0',testOnlyAdapter:'IWER getOffsetReferenceSpace forwards originOffset.matrix; pre-patch negative control required'},environment:{browser:browserVersion,playwright:'1.62.1',flags,graphicsMode:softwareRendering?'SwiftShader':'browser default; hardware not qualified',physicalGPU:false,physicalHeadset:false,physicalAudio:false,viewport:{width:1280,height:720,dpr:1}},fixtureDigests:server?.manifest.sourceFileDigests,comparison:server?.manifest.comparison,build:server?.build,checks,...finalized,missingEvidence:['Actual supported headset/controller/browser, permission system UI and cancellation timing.','Headset audio output, perceptual direction, device suspend/resume, recenter and seated use.','XR grabbing/throwing, teleportation/snap turn, full authoring and multiuser networking.','Target-device frame budgets, memory trends, long sessions and ten repeated cleanup cycles.']};
  await writeFile(output('xr-browser-checks.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({runStatus:report.runStatus,...report.counts,output:relative(packageRoot,directory)},null,2));
  if(report.runStatus!=='passed')process.exitCode=1;
}
