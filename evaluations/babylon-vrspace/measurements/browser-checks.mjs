import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { packageRoot, artifactRoot, chromeExecutable, softwareRendering } from '../config.mjs';
import { isolatedEnvironment } from '../environment.mjs';
import { startEvaluationServer } from '../server.mjs';
import { loadMeasurementProfile, currentMeasurementBinding, measurementCheckIds, validateCoordinateReadback, validateCenterAudio,
  validateDistanceTrace, validateCleanup, withinMeasurementDeadline, waitForNativeObservation, finalizeMeasurement } from './evidence.mjs';
import { readNativeAnchors, installAudioTrace, markAudioPhase, inspectAudioTrace, finishAudioTrace } from './probes.mjs';

const {profile,sha256:profileSha256}=await loadMeasurementProfile();
const binding=await currentMeasurementBinding();
await mkdir(join(artifactRoot,'measurement-runs'),{recursive:true});
const directory=await mkdtemp(join(artifactRoot,'measurement-runs/run-'));
const path=name=>join(directory,name),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const startedAt=new Date().toISOString();
const flags=[...(softwareRendering?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]),'--autoplay-policy=document-user-activation-required'];
const logs=[],failedRequests=[],checks=[],files=[],raw={};
let logOverflow=0,requestOverflow=0,server,browserServer,browser,page,stopTask,fatalError=null,browserVersion=null,renderer=null;
const stop=()=>{stopTask??=browserServer?.kill();return stopTask;};
const bounded=(operation,label,milliseconds=10000)=>withinMeasurementDeadline(operation,{milliseconds,label,stop});
const log=(type,message)=>{if(logs.length<profile.evidence.maximumLogs)logs.push({type,text:String(message).slice(0,2048)});else logOverflow++;};
const check=async(id,operation)=>{try{const detail=await operation();checks.push({id,status:'passed',method:'real-browser',detail});console.log('PASS '+id);}catch(error){checks.push({id,status:'failed',method:'real-browser',detail:String(error.stack||error).slice(0,8192)});console.log('FAIL '+id+': '+error.message);}};
const until=(read,accept,options)=>waitForNativeObservation(read,accept,{...options,stop});
const native=()=>page.evaluate(inspectAudioTrace);
const phase=name=>bounded(()=>page.evaluate(markAudioPhase,name),'phase '+name);
async function audioHold(seconds,label) {
  const before=await bounded(native,label+' start');
  assert.equal(before.contextState,'running');
  const after=await until(native,state=>state.contextState==='running'&&state.audioTime-before.audioTime>=seconds,{label,milliseconds:8000});
  return {before,after,minimumSeconds:seconds};
}
async function save(name,value) {
  const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value,null,2)+'\n');
  assert(bytes.length<=profile.evidence.maximumReportBytes,'Oversized measurement evidence '+name);
  await writeFile(path(name),bytes);files.push({path:name,bytes:bytes.length,sha256:sha(bytes)});return bytes;
}
try {
  server=await startEvaluationServer();assert.deepEqual(server.build,binding.build.metadata);
  browserServer=await chromium.launchServer({host:'127.0.0.1',executablePath:chromeExecutable,headless:true,args:flags,env:await isolatedEnvironment(),timeout:30000});
  browser=await chromium.connect(browserServer.wsEndpoint(),{timeout:20000});browserVersion=browser.version();
  const context=await bounded(()=>browser.newContext({viewport:{width:profile.viewport.width,height:profile.viewport.height},deviceScaleFactor:profile.viewport.deviceScaleFactor}),'browser context');
  await bounded(()=>context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(server.origin+'/')||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
    log('error','Blocked nonlocal request: '+url);return route.abort('blockedbyclient');
  }),'loopback request boundary');
  page=await bounded(()=>context.newPage(),'measurement page');page.setDefaultTimeout(10000);
  page.on('console',message=>{if(['error','warning','warn'].includes(message.type()))log(message.type(),message.text());});
  page.on('pageerror',error=>log('pageerror',error.message));
  page.on('requestfailed',request=>{if(failedRequests.length<profile.evidence.maximumFailedRequests)failedRequests.push({url:request.url(),error:request.failure()?.errorText??null});else requestOverflow++;});
  await bounded(()=>page.goto(server.origin,{waitUntil:'domcontentloaded',timeout:45000}),'initial navigation',45000);
  await bounded(()=>page.waitForFunction(()=>window.foundationReady&&foundationProbe.scene.getFrameId()>0,{},{polling:50,timeout:45000}),'native world load',45000);
  renderer=await bounded(()=>page.evaluate(()=>{const gl=foundationProbe.engine._gl,ext=gl?.getExtension('WEBGL_debug_renderer_info');return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),version:gl?.getParameter(gl.VERSION)};}),'renderer identity');

  await check(measurementCheckIds[0],async()=>{
    raw.coordinates=await bounded(()=>page.evaluate(readNativeAnchors,profile),'loaded vertex/world-matrix readback');
    const detail=validateCoordinateReadback(raw.coordinates,profile);
    await bounded(()=>page.evaluate(()=>{const p=foundationProbe;p.setPlayer([4,1.65,1]);p.camera.rotationQuaternion=null;p.camera.setTarget(new BABYLON.Vector3(4,.6,-2));p.updateListener();}),'marker viewing pose');
    const before=await bounded(()=>page.evaluate(()=>foundationProbe.scene.getFrameId()),'marker scene frame');
    await bounded(()=>page.waitForFunction(frame=>foundationProbe.scene.getFrameId()>frame,before,{polling:50,timeout:10000}),'marker rendered frame');
    const png=await bounded(()=>page.screenshot({type:'png',timeout:10000}),'marker screenshot');await save('coordinate-markers.png',png);
    return detail;
  });

  try {
    await bounded(()=>page.evaluate(position=>{const p=foundationProbe;p.setPlayer(position);p.camera.rotationQuaternion=null;p.camera.rotation.set(0,0,0);p.updateListener();},profile.audio.centerEye),'center calibration pose');
    await bounded(()=>page.evaluate(installAudioTrace,profile),'native observer installation');
    await phase('warmup');
    await bounded(()=>page.locator('#start').click(),'actual user activation');
    await until(native,state=>state.contextState==='running',{label:'native activation completion after the real click',milliseconds:8000});
    await audioHold(profile.audio.warmupAudioSeconds,'functional audio warmup');
    await phase('center');await audioHold(profile.audio.centerSampleAudioSeconds,'four-corner paired calibration');
    await phase('route-settle');
    await bounded(()=>page.evaluate(({eye,target})=>{const p=foundationProbe;p.setPlayer(eye);p.camera.rotationQuaternion=null;p.camera.setTarget(BABYLON.Vector3.FromArray(target));p.updateListener();},
      {eye:profile.audio.startEye,target:profile.audio.lookAt}),'continuous-route starting pose');
    await bounded(()=>page.locator('#scene').focus(),'focus actual movement input');
    await audioHold(profile.audio.routeSettleAudioSeconds,'route settling');
    await phase('outward');
    try {
      await bounded(()=>page.keyboard.down('KeyW'),'outward keydown');
      await until(native,state=>state.distance>=profile.audio.outwardDistanceMeters,{label:'outward native 10–14 m traversal',milliseconds:profile.audio.maximumLegWallMilliseconds});
    } finally {await bounded(()=>page.keyboard.up('KeyW'),'outward keyup');}
    await phase('outside');await audioHold(profile.audio.outsideHoldAudioSeconds,'native outside-cutoff hold');
    await phase('return');
    try {
      await bounded(()=>page.keyboard.down('KeyS'),'return keydown');
      await until(native,state=>state.distance<=profile.audio.returnDistanceMeters,{label:'return native 14–10 m traversal',milliseconds:profile.audio.maximumLegWallMilliseconds});
    } finally {await bounded(()=>page.keyboard.up('KeyS'),'return keyup');}
    await phase('returned');await audioHold(profile.audio.returnHoldAudioSeconds,'native returned hold');
    const last=await phase('finished');
    await until(()=>page.evaluate(()=>Object.values(__bveNativeMeasurement.report.windows).map(windows=>windows.at(-1)?.endFrame??-1)),
      frames=>frames.length===4&&frames.every(frame=>frame>=last.audioFrame),{label:'all four terminal sample windows',milliseconds:8000});
  } catch(error) {raw.audioCollectionError=String(error.stack||error).slice(0,8192);}
  finally {
    for(const key of ['KeyW','KeyS'])try{if(page&&!page.isClosed())await bounded(()=>page.keyboard.up(key),'final '+key+' release');}catch(error){raw.audioCollectionError??=String(error.stack||error);}
    try {if(page&&!page.isClosed())raw.audio=await bounded(()=>page.evaluate(finishAudioTrace),'native observer release and raw trace');}
    catch(error){raw.audioCollectionError??=String(error.stack||error);}
  }
  await check(measurementCheckIds[1],async()=>{assert.equal(raw.audioCollectionError,undefined,raw.audioCollectionError);return validateCenterAudio(raw.audio,profile);});
  await check(measurementCheckIds[2],async()=>{assert.equal(raw.audioCollectionError,undefined,raw.audioCollectionError);return validateDistanceTrace(raw.audio,profile);});
  await check(measurementCheckIds[3],async()=>{
    raw.cleanup=await bounded(()=>page.evaluate(async()=>{
      const app=foundationProbe;await app.dispose();
      return {observerPresent:!!window.__bveNativeMeasurement,state:app.state,nodes:app.nodes.size,bodies:app.bodies.size,urls:app.urls.length,sources:app.audio.sources.size,audio:app.audio.context.state,sceneDisposed:app.scene.isDisposed,physicsFreed:!app.physics,videos:document.querySelectorAll('video').length,keys:app.keys.size};
    }),'candidate disposal',20000);
    return validateCleanup(raw.cleanup);
  });
} catch(error) {fatalError=String(error.stack||error).slice(0,8192);console.error(error.message);}
finally {
  const finalized=await finalizeMeasurement({checks,fatalError,
    closeBrowser:async()=>{if(browserServer)await bounded(()=>browserServer.close(),'owned browser close',15000);},
    closeServer:()=>withinMeasurementDeadline(()=>server?.close(),{milliseconds:10000,label:'loopback server close'}),
    readBinding:async()=>{const current=await currentMeasurementBinding();assert.deepEqual(current,binding,'Source/build/fixture changed during browser observation');return current;},
    diagnostics:()=>({logs,failedRequests,logOverflow,requestOverflow})});
  await save('coordinate-anchors.json',raw.coordinates??{unavailable:true});
  await save('audio-trace.json',raw.audio??{unavailable:true,collectionError:raw.audioCollectionError??null});
  await save('build.json',await readFile(join(packageRoot,'dist/build.json')));
  const report={schemaVersion:1,scope:'Loaded native coordinate anchors and four-source continuous software audio measurement; incomplete F05 qualification',
    method:'real-browser',qualificationStatus:'incomplete',physicalHeadset:false,physicalAudio:false,performanceWorkloadExecuted:false,avTimingMeasured:false,
    startedAt,profile,profileSha256,binding,environment:{browser:browserVersion,playwright:'1.62.1',flags,renderer,graphicsMode:softwareRendering?'SwiftShader':'browser default; physical device not qualified',viewport:profile.viewport,physicalGPU:false},
    checks,cleanup:raw.cleanup??null,audioCollectionError:raw.audioCollectionError??null,files,...finalized,
    missingEvidence:['Unchanged 80 ms A/V timed-marker offset remains unmeasured; no zero or inferred passing offset.','Physical headset scale, headphones/output latency/localization and device-specific qualification.','Full frozen F03 performance workload and complete foundation comparison.']};
  const reportBytes=Buffer.from(JSON.stringify(report,null,2)+'\n');assert(reportBytes.length<=profile.evidence.maximumReportBytes);
  await writeFile(path('measurement-checks.json'),reportBytes);
  await writeFile(path('measurement-summary.json'),JSON.stringify({schemaVersion:1,runStatus:report.runStatus,counts:report.counts,qualificationStatus:'incomplete',profileSha256,
    report:{path:'measurement-checks.json',bytes:reportBytes.length,sha256:sha(reportBytes)},checks:checks.map(({id,status,method})=>({id,status,method})),physicalHeadset:false,physicalAudio:false,avTimingMeasured:false},null,2)+'\n');
  console.log(JSON.stringify({runStatus:report.runStatus,counts:report.counts,output:relative(packageRoot,directory)},null,2));
  if(report.runStatus!=='passed')process.exitCode=1;
}
