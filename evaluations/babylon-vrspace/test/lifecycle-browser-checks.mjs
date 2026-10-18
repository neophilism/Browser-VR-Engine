import {chromium} from 'playwright';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,relative} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {packageRoot,artifactRoot,chromeExecutable,softwareRendering} from '../config.mjs';
import {isolatedEnvironment} from '../environment.mjs';
import {startEvaluationServer} from '../server.mjs';
import {evidenceSourcePaths,fingerprintFiles} from '../fixtures.mjs';
import {encodePortableWorld} from '../dist/portable-world.mjs';
import {finalizeBrowserRun} from './browser-finalize.mjs';
import {installLifecycleObserver,emptySnapshotDifferences,withinLifecycleDeadline} from './lifecycle-observer.mjs';
import {observeMediaProgress} from './media-progress.mjs';

const profileBytes=await readFile(new URL('./lifecycle-profile.json',import.meta.url)),profile=JSON.parse(profileBytes),sha=bytes=>createHash('sha256').update(bytes).digest('hex'),profileSha256=sha(profileBytes);
await mkdir(join(artifactRoot,'lifecycle-runs'),{recursive:true});
const directory=await mkdtemp(join(artifactRoot,'lifecycle-runs/run-')),output=name=>join(directory,name),startedAt=new Date().toISOString();
const flags=[...(softwareRendering?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]),'--autoplay-policy=document-user-activation-required'];
const checks=[],logs=[],failedRequests=[],cycles=[],fixtureAttempts=[],cdpEvents=[];
let server,browser,browserServer,stopTask,context,page,cdp,baseline,final,negativeControl,input,documentToken,targetId,contextId,fatalError,nativeJournal={events:[],overflow:0,faults:[]},logOverflow=0,cdpOverflow=0,cdpSequence=0,currentCycle=0,currentPhase='boot',createdContexts=0,destroyedContexts=0;
const audioContexts=new Set(),closedAudioContexts=new Set();
const log=value=>{if(logs.length<500)logs.push(value);else logOverflow=Math.min(1000,logOverflow+1);};
const check=async(id,fn)=>{try{checks.push({id,status:'passed',method:'real-browser',detail:await fn()});console.log('PASS '+id);}catch(error){checks.push({id,status:'failed',method:'real-browser',detail:error.stack});console.log('FAIL '+id+': '+error.message);}};
const stop=()=>{stopTask??=browserServer?.kill();return stopTask;};
const bounded=(operation,label,deadlineMs=profile.settle.deadlineMs)=>withinLifecycleDeadline(operation,{deadlineMs,forcedCloseDeadlineMs:profile.settle.forcedCloseDeadlineMs,label,stop});
const mark=async(cycle,phase)=>{currentCycle=cycle;currentPhase=phase;await bounded(()=>page.evaluate(({cycle,phase})=>lifecycleObserver.mark(cycle,phase),{cycle,phase}),'phase mark');};
async function poll(read,predicate,deadlineMs=profile.settle.deadlineMs){
  const until=Date.now()+deadlineMs;let value;
  do{value=await bounded(read,'observation read',Math.max(1,until-Date.now()));if(predicate(value))return value;await wait(profile.settle.pollMs);}while(Date.now()<until);
  throw new Error('Bounded lifecycle observation did not settle: '+JSON.stringify(value).slice(0,3000));
}
async function listenerCensus(){
  const group='lifecycle-listeners',result={},handles=new Set();
  try{
    for(const target of profile.listenerTargets){
      const expression=target==='window'?'window':target==='document'?'document':target==='body'?'document.body':target==='navigator.xr'?'navigator.xr||null':`document.getElementById(${JSON.stringify(target)})`;
      const remote=await cdp.send('Runtime.evaluate',{expression,objectGroup:group,returnByValue:false,silent:true});
      if(remote.exceptionDetails)throw new Error('Listener target evaluation failed');
      if(!remote.result.objectId){result[target]={available:false,counts:{}};continue;}
      const data=await cdp.send('DOMDebugger.getEventListeners',{objectId:remote.result.objectId,depth:0,pierce:false}),counts={};
      for(const listener of data.listeners){
        const key=[listener.type,!!listener.useCapture,!!listener.passive,!!listener.once].join('|');counts[key]=(counts[key]||0)+1;
        for(const property of ['handler','originalHandler'])if(listener[property]?.objectId)handles.add(listener[property].objectId);
      }
      result[target]={available:true,counts:Object.fromEntries(Object.entries(counts).sort(([a],[b])=>a.localeCompare(b)))};
    }
  }finally{
    const errors=[];
    for(const objectId of handles)try{await cdp.send('Runtime.releaseObject',{objectId});}catch(error){errors.push(error);}
    try{await cdp.send('Runtime.releaseObjectGroup',{objectGroup:group});}catch(error){errors.push(error);}
    if(errors.length)throw new AggregateError(errors,'Listener census handle cleanup failed');
  }
  return result;
}
async function memorySnapshot(){
  let jsHeap,domCounters;
  try{const data=await cdp.send('Performance.getMetrics'),metrics=Object.fromEntries(data.metrics.map(item=>[item.name,item.value]));jsHeap=Number.isFinite(metrics.JSHeapUsedSize)&&Number.isFinite(metrics.JSHeapTotalSize)?{status:'available',usedBytes:metrics.JSHeapUsedSize,totalBytes:metrics.JSHeapTotalSize}:{status:'unavailable',reason:'CDP did not return finite JS heap byte counters'};}catch(error){jsHeap={status:'unavailable',reason:error.message};}
  try{domCounters={status:'available',...await cdp.send('Memory.getDOMCounters')};}catch(error){domCounters={status:'unavailable',reason:error.message};}
  return {policy:'diagnostic-only',jsHeap,domCounters,userAgentSpecific:{status:'not-measured',reason:'No asynchronous process-memory sample or physical-device memory qualification is part of this live-resource test'},gpu:{status:'unavailable',reason:'No portable per-instance GPU allocation byte counter is exposed by this evaluated browser path'}};
}
async function snapshot(cycle,phase){
  return bounded(async()=>{
    await mark(cycle,phase);const listeners=await listenerCensus(),memory=await memorySnapshot();
    const value=await page.evaluate(()=>({documentToken:lifecycleObserver.documentToken,runtime:portableHost.lifecycleSnapshot(),native:lifecycleObserver.snapshot(),dom:{videoElements:document.querySelectorAll('video').length}}));
    return {...value,targetId,contextId,at:new Date().toISOString(),cycle,phase,listeners,memory,cdp:{sequence:cdpSequence,audioContexts:[...audioContexts].sort(),createdContexts,closedContexts:closedAudioContexts.size,destroyedContexts}};
  },'resource snapshot');
}
async function empty(cycle,phase){
  let stable=0;
  return poll(()=>snapshot(cycle,phase),value=>{const differences=emptySnapshotDifferences(value,baseline,profile);stable=differences.length===0?stable+1:0;return stable>=profile.settle.stableSamples;});
}
function assertEmpty(value){assert.deepEqual(emptySnapshotDifferences(value,baseline,profile),[]);assert.equal(value.documentToken,documentToken);assert.equal(value.targetId,targetId);assert.equal(value.contextId,contextId);}
function assertLoaded(value,index){
  assert.equal(value.runtime.instanceId,index);assert.equal(value.runtime.host.createdInstances,index);assert.equal(value.runtime.host.pendingHostTask,false);assert.equal(value.runtime.host.failedOwner,false);assert.equal(value.runtime.host.publishedInstance,true);assert.equal(value.runtime.host.publishedAdapter,true);assert.equal(value.runtime.host.foundationReady,true);
  for(const [key,expected] of Object.entries(profile.loadedExpectations))assert.equal(value.runtime.counters[key],expected,'loaded '+key);
  for(const key of ['meshes','transformNodes','textures','geometries','cameras','lights','animationGroups','skeletons'])assert(value.runtime.scene[key]>0,'actual loaded scene '+key);
  assert.equal(value.native.counters.audioContexts,1);assert.equal(value.native.counters.workletPorts,6);assert(value.native.counters.objectUrls>0);for(const key of ['glBuffers','glTextures','glPrograms'])assert(value.native.counters[key]>0,'native renderer '+key);assert.equal(value.dom.videoElements,1);assert.equal(value.cdp.audioContexts.length,1);
}
function mediaSample(snapshot){
  const a=snapshot.runtime.activity,wall=a.audio.sources.find(item=>item.id==='wall-playback');
  return {at:a.at,steps:a.physicsSteps,animation:a.animations.find(item=>item.entityId==='bird'),audioState:a.audio.state,clock:a.audio.time,sampleRate:a.audio.sampleRate,video:a.video,invalidMessages:wall.invalidMessages,wallWindows:wall.windows};
}
function activated(after,before,progress){
  const a=after.runtime.activity,b=before.runtime.activity;
  const ready=observeMediaProgress({state:progress,sample:mediaSample(after)});
  return !!ready&&a.sceneFrame>b.sceneFrame&&a.audio.activation?.isActive===true&&a.audio.activation.after==='running'&&
    JSON.stringify(a.audio.sources.map(item=>item.id))===JSON.stringify(profile.sourceIds)&&a.audio.sources.every(item=>{
      const prior=b.audio.sources.find(value=>value.id===item.id),baselineFrame=Math.max(b.audio.time*b.audio.sampleRate,prior.endFrame??0);
      return item.invalidMessages===0&&item.windows.some(window=>window.startFrame>=baselineFrame&&window.endFrame>baselineFrame&&window.sampleRate===a.audio.sampleRate&&window.invalidFrames===0&&window.droppedWindows===0&&window.inputRms>profile.activation.minimumInputRms);
    });
}

try{
  server=await startEvaluationServer();
  const originals=new Map(server.manifest.world.assets.map(reference=>{const resource=server.manifest.catalog.resources.find(item=>item.id===reference.id);return [reference.id,{reference,bytes:new Uint8Array(server.resources.get(resource.path).bytes),mediaType:resource.mediaType}];}));
  const encoded=await encodePortableWorld(server.manifest.world,reference=>originals.get(reference.id));
  input={worldId:encoded.world.id,worldRevision:encoded.world.revision,bytes:encoded.bytes.length,sha256:sha(encoded.bytes),assetReceipts:encoded.assetReceipts};
  // The public BrowserServer force-kill API gives an actual cancellation path
  // for a page/native operation that exceeds its declared observation bound.
  browserServer=await chromium.launchServer({host:'127.0.0.1',executablePath:chromeExecutable,headless:true,args:flags,env:await isolatedEnvironment()});
  browser=await chromium.connect(browserServer.wsEndpoint(),{timeout:profile.settle.deadlineMs});
  context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===server.origin&&url.pathname.startsWith('/fixtures/')){if(fixtureAttempts.length<200)fixtureAttempts.push({url:url.pathname,cycle:currentCycle,phase:currentPhase});else logOverflow++;return route.abort('blockedbyclient');}return url.origin===server.origin||['blob:','data:'].includes(url.protocol)?route.continue():route.abort('blockedbyclient');});
  await context.addInitScript(installLifecycleObserver,{...profile.observer,cycles:profile.cycles,phases:profile.eventPhases});
  page=await context.newPage();page.setDefaultTimeout(45000);
  page.on('console',message=>{if(['error','warning','warn'].includes(message.type()))log({type:message.type(),text:message.text(),cycle:currentCycle,phase:currentPhase});});
  page.on('pageerror',error=>log({type:'pageerror',text:error.stack,cycle:currentCycle,phase:currentPhase}));
  page.on('requestfailed',request=>{if(failedRequests.length<200)failedRequests.push({url:request.url(),failure:request.failure(),cycle:currentCycle,phase:currentPhase});else logOverflow++;});
  cdp=await context.newCDPSession(page);
  for(const event of ['contextCreated','contextChanged','contextWillBeDestroyed','audioListenerCreated','audioListenerWillBeDestroyed','audioNodeCreated','audioNodeWillBeDestroyed','audioParamCreated','audioParamWillBeDestroyed','nodesConnected','nodesDisconnected','nodeParamConnected','nodeParamDisconnected'])cdp.on('WebAudio.'+event,data=>{
    if(event==='contextCreated'){audioContexts.add(data.context.contextId);createdContexts++;}
    if(event==='contextChanged'&&data.context.contextState==='closed'){audioContexts.delete(data.context.contextId);closedAudioContexts.add(data.context.contextId);}
    if(event==='contextWillBeDestroyed'){audioContexts.delete(data.contextId);destroyedContexts++;}
    const item={sequence:++cdpSequence,cycle:currentCycle,phase:currentPhase,event,data};if(cdpEvents.length<profile.observer.maximumCDPEvents)cdpEvents.push(item);else cdpOverflow++;
  });
  await bounded(()=>cdp.send('WebAudio.enable'),'CDP audio setup');await bounded(()=>cdp.send('Performance.enable'),'CDP performance setup');
  const target=await bounded(()=>cdp.send('Target.getTargetInfo'),'CDP target identity');targetId=target.targetInfo.targetId;contextId=target.targetInfo.browserContextId;assert(targetId&&contextId);
  await page.goto(server.origin+'/?world=empty',{waitUntil:'domcontentloaded',timeout:60000});
  await poll(()=>page.evaluate(()=>window.portableHost?.lifecycleSnapshot().host||null),value=>value?.phase==='empty'&&!value.pendingHostTask);
  documentToken=await bounded(()=>page.evaluate(()=>lifecycleObserver.documentToken),'document identity');
  await check('lifecycle-empty-host-baseline',async()=>{baseline=await empty(0,'baseline');assertEmpty(baseline);assert.equal(baseline.runtime.host.createdInstances,0);return {snapshot:'baseline',strictLiveBaseline:true};});
  await check('lifecycle-observer-negative-control',async()=>{
    const before=await snapshot(0,'negative-before');assertEmpty(before);
    await mark(0,'negative-allocated');await bounded(()=>page.evaluate(()=>{window.__lifecycleNegativeURL=URL.createObjectURL(new Blob(['lifecycle-observer-negative-control']));}),'negative native allocation');
    const allocated=await snapshot(0,'negative-allocated'),differences=emptySnapshotDifferences(allocated,baseline,profile);assert(differences.includes('native.objectUrls'));assert.equal(allocated.native.counters.objectUrls,1);assert.equal(allocated.runtime.counters.objectUrls,0);assert.equal(allocated.runtime.host.createdInstances,0);
    await mark(0,'negative-released');await bounded(()=>page.evaluate(()=>{URL.revokeObjectURL(window.__lifecycleNegativeURL);delete window.__lifecycleNegativeURL;}),'negative native release');const released=await empty(0,'negative-released');assertEmpty(released);
    negativeControl={before,allocated,released,id:allocated.native.live.objectUrls[0],comparisonRejected:true};return {nativeAllocationDetected:true,runtimeAssetMapsEmpty:true,releasedToBaseline:true};
  });
  await check('lifecycle-ten-activated-cycles',async()=>{
    assert(baseline,'Baseline must be observed before loading');
    for(let index=1;index<=profile.cycles;index++){
      const cycle={index};cycles.push(cycle);await mark(index,'loading');
      await page.locator('#world-file').setInputFiles({name:'lifecycle-world.bveworld',mimeType:'application/octet-stream',buffer:Buffer.from(encoded.bytes)});
      await poll(()=>page.evaluate(()=>portableHost.lifecycleSnapshot().host),value=>!value.pendingHostTask&&['ready','empty','cleanup-failed'].includes(value.phase));
      cycle.loaded=await snapshot(index,'loaded');cycle.instanceId=cycle.loaded.runtime.instanceId;assertLoaded(cycle.loaded,index);
      const before=await poll(()=>snapshot(index,'activation-before'),value=>{const video=value.runtime.activity?.video;return video&&Number.isFinite(video.duration)&&video.duration>0&&video.readyState>=profile.activation.minimumVideoReadyState;}),progress={};cycle.activation={before,mediaProgress:progress};observeMediaProgress({state:progress,sample:mediaSample(before)});await mark(index,'activating');await page.locator('#start').click();
      const after=await poll(async()=>{const value=await snapshot(index,'activation-after');cycle.activation.after=value;return value;},value=>activated(value,before,progress),profile.activation.deadlineMs);assertLoaded(after,index);
      await mark(index,'unloading');cycle.unloadReceipt=await bounded(()=>page.evaluate(()=>portableHost.unload()),'native world unload');
      assert.equal(cycle.unloadReceipt.state,'disposed');assert.equal(cycle.unloadReceipt.instanceId,index);assert(Object.values(cycle.unloadReceipt.counters).every(value=>value===0));assert(Object.values(cycle.unloadReceipt.scene).every(value=>value===0));assert.equal(cycle.unloadReceipt.activity,null);
      cycle.unloaded=await empty(index,'unloaded');assertEmpty(cycle.unloaded);assert.equal(cycle.unloaded.runtime.host.createdInstances,index);
      const inputBefore=await snapshot(index,'post-input-before');
      await page.locator('#scene').focus();await page.keyboard.down('KeyW');await page.keyboard.up('KeyW');await page.mouse.move(600,450);await page.mouse.down();await page.mouse.up();
      await bounded(()=>page.evaluate(()=>{window.dispatchEvent(new Event('resize'));document.getElementById('start').click();}),'unloaded input');
      const inputAfter=await empty(index,'post-input-after');assertEmpty(inputAfter);assert.equal(inputAfter.runtime.host.createdInstances,index);cycle.postInput={before:inputBefore,after:inputAfter,actions:[...profile.postInputActions]};
      console.log('CYCLE '+index+' activated and returned to the empty baseline');
    }
    return {cycleCount:cycles.length,sameDocument:true,sameContext:true};
  });
  await check('lifecycle-native-resource-release',async()=>{
    assert.equal(cycles.length,10);for(const cycle of cycles){assert(cycle.unloaded);assertEmpty(cycle.unloaded);assert.equal(cycle.unloaded.cdp.createdContexts,cycle.index);}
    assert.equal(createdContexts,10);assert.equal(cdpOverflow,0);return {createdContexts,closedContexts:closedAudioContexts.size,destroyedContexts,liveNativeContexts:audioContexts.size,note:'Closed/native released resources are distinct from eventual wrapper destruction; no GC deadline is imposed.'};
  });
  await check('lifecycle-unloaded-input-inert',async()=>{for(const cycle of cycles){assert(cycle.postInput);assertEmpty(cycle.postInput.before);assertEmpty(cycle.postInput.after);assert.deepEqual(cycle.postInput.actions,profile.postInputActions);assert.equal(cycle.postInput.before.runtime.host.createdInstances,cycle.postInput.after.runtime.host.createdInstances);}assert.equal(cycles.length,10);return {cycles:10,actions:[...profile.postInputActions]};});
  await check('lifecycle-final-empty-host',async()=>{final=await empty(10,'final');assertEmpty(final);assert.equal(final.runtime.host.createdInstances,10);assert.equal(fixtureAttempts.length,0);assert.equal(cdpOverflow,0);return {snapshot:'final',createdInstances:10,fixtureAttempts:0};});
}catch(error){fatalError=error.stack||String(error);console.error(error.message);}
finally{
  const browserVersion=browser?await browser.version():null;
  const finalized=await finalizeBrowserRun({checks,expectedChecks:6,readSources:()=>fingerprintFiles(evidenceSourcePaths),closeBrowser:async()=>{try{if(page&&!page.isClosed())nativeJournal=await bounded(()=>page.evaluate(()=>lifecycleObserver.journal()),'final native journal');}finally{if(browserServer)await bounded(()=>browserServer.close(),'browser finalization');}},closeServer:()=>server?.close(),diagnostics:()=>({logs,failedRequests,logOverflow})});
  const eventBytes=Buffer.from(JSON.stringify({schemaVersion:1,profileSha256,documentToken,targetId,contextId,native:nativeJournal,cdp:{events:cdpEvents,overflow:cdpOverflow},fixtureAttempts},null,2)+'\n');
  await writeFile(output('lifecycle-resource-events.json'),eventBytes);
  const report={scope:'F05 ten same-page native resource lifecycle cycles; diagnostic memory only, incomplete foundation qualification',method:'real-browser',physicalHeadset:false,physicalAudio:false,qualificationStatus:'incomplete',startedAt,candidate:{babylon:'9.30.0',rapier:'0.21.0',typebox:'0.34.52'},environment:{browser:browserVersion,playwright:'1.62.1',flags,graphicsMode:softwareRendering?'SwiftShader':'browser default; hardware not qualified',physicalGPU:false,physicalHeadset:false,physicalAudio:false,viewport:{width:1280,height:720,dpr:1}},fixtureDigests:server?.manifest.sourceFileDigests,comparison:server?.manifest.comparison,build:server?.build,profile,profileSha256,eventsSha256:sha(eventBytes),documentToken,targetId,contextId,input,baseline,cycles,final,negativeControl,fixtureAttempts:fixtureAttempts.length,memory:{policy:'diagnostic-only',byteOrPercentAcceptanceTolerance:null,physicalDeviceQualified:false,qualificationStatus:'incomplete'},checks,...finalized,missingEvidence:['Physical target-device memory and graphics/audio qualification.','Long-duration heap/GPU memory trends, real shared state/media and complete foundation comparison.']};
  if(fatalError||nativeJournal.overflow||nativeJournal.faults.length||cdpOverflow){report.fatalError=fatalError||'Lifecycle observer overflow or unsupported native observation';report.runStatus='failed';}
  await writeFile(output('lifecycle-browser-checks.json'),JSON.stringify(report,null,2)+'\n');await writeFile(output('lifecycle-summary.json'),JSON.stringify({qualificationStatus:'incomplete',evidenceFile:'lifecycle-browser-checks.json',checks:checks.map(({id,status,method})=>({id,status,method})),counts:report.counts,runStatus:report.runStatus},null,2)+'\n');if(server)await writeFile(output('build.json'),JSON.stringify(server.build,null,2)+'\n');
  console.log(JSON.stringify({runStatus:report.runStatus,...report.counts,output:relative(packageRoot,directory)},null,2));if(report.runStatus!=='passed')process.exitCode=1;
}
