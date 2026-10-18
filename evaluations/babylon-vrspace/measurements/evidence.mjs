import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { packageRoot, fixtureRoot } from '../config.mjs';
import { fingerprintFiles, fingerprintWorkspaceFiles, evidenceSourcePaths, buildInputPaths, buildOutputPaths, loadFixtureSet } from '../fixtures.mjs';

export const PROFILE_SHA256='e86e58b943282bdf4f6becfb07a4309ffa0811dc96153066dc78e097103f1616';
export const measurementSourcePaths=['measurements/profile.json','measurements/README.md','measurements/probes.mjs','measurements/evidence.mjs','measurements/browser-checks.mjs','measurements/verify.mjs','measurements/run.mjs','measurements/test.mjs'];
export const measurementCheckIds=['native-loaded-coordinate-anchors','native-four-corner-equal-distance','native-continuous-distance-fade-cutoff','measurement-observers-and-candidate-cleanup'];
const digest=value=>createHash('sha256').update(value).digest('hex');
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const vector=value=>Array.isArray(value)&&value.length===3&&value.every(finite);
const exactKeys=(value,keys)=>{assert(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value).sort(),[...keys].sort());};
const bounded=(value,maximum,name)=>{assert(Array.isArray(value)&&value.length>0&&value.length<=maximum,`Invalid or excessive ${name}`);};
const distance=(a,b)=>Math.hypot(...a.map((value,index)=>value-b[index]));
const median=values=>{const ordered=[...values].sort((a,b)=>a-b),middle=Math.floor(ordered.length/2);return ordered.length%2?ordered[middle]:(ordered[middle-1]+ordered[middle])/2;};

export async function loadMeasurementProfile() {
  const bytes=await readFile(resolve(packageRoot,'measurements/profile.json'));
  assert.equal(digest(bytes),PROFILE_SHA256,'The pre-execution measurement profile changed');
  return {profile:JSON.parse(bytes),bytes,sha256:PROFILE_SHA256};
}

export async function currentMeasurementBinding() {
  const [{profile,sha256:profileSha256},baseSources,measurementSources,workspaceInputs,inputs,outputs,buildBytes,{manifest}]=await Promise.all([
    loadMeasurementProfile(),fingerprintFiles(evidenceSourcePaths),fingerprintFiles(measurementSourcePaths),fingerprintWorkspaceFiles(),
    fingerprintFiles(buildInputPaths),fingerprintFiles(buildOutputPaths),readFile(resolve(packageRoot,'dist/build.json')),loadFixtureSet(fixtureRoot),
  ]);
  const metadata=JSON.parse(buildBytes);verifyProfileFixtures(profile,manifest);
  assert.deepEqual(metadata.inputs,inputs,'Current renderer inputs differ from the built snapshot');
  assert.deepEqual(metadata.workspaceInputs,workspaceInputs,'Current workspace inputs differ from the built snapshot');
  assert.deepEqual(metadata.outputs,outputs,'Current renderer outputs differ from the built snapshot');
  assert.deepEqual(metadata.fixtureDigests,manifest.sourceFileDigests,'Current fixtures differ from the built snapshot');
  return {profileSha256,baseSources,measurementSources,workspaceInputs,fixtureDigests:manifest.sourceFileDigests,comparison:manifest.comparison,build:{sha256:digest(buildBytes),bytes:buildBytes.length,metadata}};
}

export function verifyProfileFixtures(profile,manifest) {
  for(const [id,expected] of Object.entries(profile.fixtureDigests))assert.equal(manifest.sourceFileDigests[id],expected,'Frozen fixture mismatch: '+id);
  assert.equal(manifest.thresholds.staticAnchorErrorMeters,profile.coordinates.maximumAnchorErrorMeters);
  assert.equal(manifest.thresholds.attenuationErrorDb,profile.audio.equalDistanceMaximumDifferenceDb);
  assert.equal(manifest.world.assets.find(asset=>asset.id===profile.coordinates.assetId)?.revision,profile.coordinates.assetRevision);
  for(const id of profile.audio.sourceIds){
    const matches=manifest.world.entities.flatMap(entity=>entity.components.filter(component=>component.type==='bve:audio-emitter'&&component.data.playbackId===id));
    assert.equal(matches.length,1);assert.deepEqual(matches[0].data.curve,profile.audio.curve);
  }
  assert.equal(profile.audio.referenceCurveErrorAcceptanceTolerance,null);
}

function transform(matrix,point) {
  return [0,1,2].map(row=>matrix[row]*point[0]+matrix[4+row]*point[1]+matrix[8+row]*point[2]+matrix[12+row]);
}

export function validateCoordinateReadback(raw,profile) {
  const definition=profile.coordinates;
  assert.equal(raw?.method,'loaded-native-vertex-buffer-and-world-matrix');
  assert.equal(raw.rightHanded,true);assert(integer(raw.sceneFrame)&&raw.sceneFrame>0);assert(integer(raw.physicsSteps));
  assert.equal(raw.assetId,definition.assetId);assert.equal(raw.originalSha256,definition.assetRevision);
  assert(integer(raw.originalBytes)&&raw.originalBytes>0);assert.equal(raw.containerRegistered,true);
  assert(Array.isArray(raw.meshes)&&raw.meshes.length===definition.axes.length);
  const names=new Set(),nativeIds=new Set(),anchors=[];
  for(const expected of definition.axes){
    const found=raw.meshes.filter(mesh=>mesh.name===expected.name);assert.equal(found.length,1);
    const mesh=found[0];assert.equal(mesh.axis,expected.axis);assert.equal(mesh.inScene,true);
    assert(integer(mesh.uniqueId)&&!nativeIds.has(mesh.uniqueId));nativeIds.add(mesh.uniqueId);names.add(mesh.name);
    bounded(mesh.positions,definition.maximumPositionFloatsPerMesh,'native vertex buffer');
    assert.equal(mesh.positions.length%3,0);assert.equal(mesh.vertices,mesh.positions.length/3);assert(mesh.positions.every(finite));
    assert(Array.isArray(mesh.worldMatrix)&&mesh.worldMatrix.length===16&&mesh.worldMatrix.every(finite));
    assert.deepEqual([mesh.worldMatrix[3],mesh.worldMatrix[7],mesh.worldMatrix[11],mesh.worldMatrix[15]],[0,0,0,1]);
    bounded(mesh.parents,16,'native parent chain');assert(mesh.parents.some(parent=>parent.entityId===definition.entityId));
    const vertices=[];for(let index=0;index<mesh.positions.length;index+=3)vertices.push(mesh.positions.slice(index,index+3));
    const coordinates=vertices.map(point=>point[expected.axis]),minimum=Math.min(...coordinates),maximum=Math.max(...coordinates);
    assert(maximum>minimum,'Native reference bar has no longitudinal extent');
    const face=value=>{const points=vertices.filter(point=>point[expected.axis]===value);assert(points.length>=3);return [0,1,2].map(axis=>points.reduce((sum,point)=>sum+point[axis],0)/points.length);};
    const near=transform(mesh.worldMatrix,face(minimum)),far=transform(mesh.worldMatrix,face(maximum));
    const nearError=distance(near,definition.expectedOrigin),farError=distance(far,expected.endpoint);
    assert(nearError<=definition.maximumAnchorErrorMeters,`${expected.name} origin error ${nearError} m exceeds the frozen 1 mm limit`);
    assert(farError<=definition.maximumAnchorErrorMeters,`${expected.name} endpoint error ${farError} m exceeds the frozen 1 mm limit`);
    anchors.push({name:expected.name,nativeMeshId:mesh.uniqueId,near,far,expectedNear:definition.expectedOrigin,expectedFar:expected.endpoint,nearErrorMeters:nearError,farErrorMeters:farError,measuredLengthMeters:distance(near,far),declaredLengthMeters:1});
  }
  assert.equal(names.size,3);
  return {method:raw.method,maximumAllowedAnchorErrorMeters:definition.maximumAnchorErrorMeters,maximumObservedAnchorErrorMeters:Math.max(...anchors.flatMap(item=>[item.nearErrorMeters,item.farErrorMeters])),anchors,physicalScaleMeasured:false};
}

// Independent literal reference, rather than the candidate's gain or helper.
export function referenceGain(d) {
  assert(finite(d)&&d>=0);
  if(d>=14)return 0;
  const t=Math.max(0,(d-10)/4);
  return (1-3*t*t+2*t*t*t)/Math.max(1,d);
}

function inspectTrace(raw,profile) {
  const definition=profile.audio,ids=definition.sourceIds;
  assert(raw&&typeof raw==='object');assert(integer(raw.sampleRate)&&raw.sampleRate>=8000&&raw.sampleRate<=384000);
  assert.equal(raw.phase,'finished');exactKeys(raw.overflow,['poses','renderFrames','windows']);assert(Object.values(raw.overflow).every(value=>value===0),'Measurement overflow invalidates coverage');
  assert.deepEqual(raw.errors,[]);assert.equal(raw.initial?.totalSources,6);assert.equal(raw.final?.totalSources,6);
  assert.equal(raw.final.contextState,'running');assert.equal(raw.final.sameGraph,true);assert.equal(raw.final.sameSources,true);assert.equal(raw.final.listenerMethodRestored,true);assert.equal(raw.final.singleWallElementSource,true);
  assert.equal(raw.final.activation?.isActive,true);assert.equal(raw.final.activation?.after,'running');
  assert(integer(raw.startedAudioFrame)&&finite(raw.startedPerformanceTime)&&raw.startedPerformanceTime>=0);
  assert(integer(raw.final.finishedAudioFrame)&&raw.final.finishedAudioFrame>=raw.startedAudioFrame);
  assert(finite(raw.final.finishedPerformanceTime)&&raw.final.finishedPerformanceTime>=raw.startedPerformanceTime);
  assert(raw.final.finishedPerformanceTime-raw.startedPerformanceTime<=definition.maximumTraceWallMilliseconds,'Native trace finish exceeded its predeclared wall-clock budget');
  const observed=(frame,time)=>{assert(integer(frame)&&frame>=raw.startedAudioFrame&&frame<=raw.final.finishedAudioFrame,'Observation extends beyond the native finish clock');assert(finite(time)&&time>=raw.startedPerformanceTime&&time<=raw.final.finishedPerformanceTime,'Observation lies outside the retained native interval');};
  assert(Array.isArray(raw.initial.sources)&&raw.initial.sources.length===ids.length);
  assert(Array.isArray(raw.final.invalidMessages)&&raw.final.invalidMessages.length===ids.length);
  for(let index=0;index<ids.length;index++){
    const initial=raw.initial.sources[index];assert.equal(initial.id,ids[index]);assert.equal(initial.sourceType,'AudioBufferSourceNode');assert.equal(initial.sameContext,true);assert.equal(initial.loop,true);
    assert(integer(initial.bufferLength)&&initial.bufferLength>0);assert(integer(initial.bufferSampleRate)&&initial.bufferSampleRate>0);
    assert.deepEqual(initial.position,definition.expectedPositions[index].map(Math.fround));assert.deepEqual(initial.curve,definition.curve);
    assert.equal(initial.meterInputs,2);assert.equal(initial.meterOutputs,0);assert.equal(initial.invalidMessages,0);
    assert.deepEqual(raw.final.invalidMessages[index],{id:ids[index],count:0});
  }
  bounded(raw.events,8,'phase records');
  const phases=['warmup','center','route-settle','outward','outside','return','returned','finished'];
  assert.deepEqual(raw.events.map(event=>event.phase),phases);
  for(let index=0;index<raw.events.length;index++){
    const event=raw.events[index];observed(event.audioFrame,event.performanceTime);assert(integer(event.physicsSteps)&&integer(event.sceneFrame));
    if(index){const previous=raw.events[index-1];assert(event.audioFrame>previous.audioFrame,'Audio clock must advance in every phase');assert(event.performanceTime>=previous.performanceTime&&event.physicsSteps>=previous.physicsSteps&&event.sceneFrame>=previous.sceneFrame,'Phase clock/counter sequence regressed');}
  }
  assert(raw.events.at(-1).performanceTime-raw.startedPerformanceTime<=definition.maximumTraceWallMilliseconds,'Trace exceeded its predeclared wall-clock budget');
  const events=Object.fromEntries(raw.events.map((event,index)=>[event.phase,{...event,end:raw.events[index+1]||event}]));
  const seconds=phase=>(events[phase].end.audioFrame-events[phase].audioFrame)/raw.sampleRate;
  assert(seconds('warmup')>=definition.warmupAudioSeconds);assert(seconds('center')>=definition.centerSampleAudioSeconds);
  assert(seconds('route-settle')>=definition.routeSettleAudioSeconds);assert(seconds('outside')>=definition.outsideHoldAudioSeconds);assert(seconds('returned')>=definition.returnHoldAudioSeconds);
  for(const phase of ['outward','return'])assert(events[phase].end.performanceTime-events[phase].performanceTime<=definition.maximumLegWallMilliseconds,'Motion leg exceeded its predeclared wall-clock budget');
  bounded(raw.poses,definition.maximumPoseSamples,'native poses');bounded(raw.renderFrames,definition.maximumFrameSamples,'native rendered frames');
  for(let index=0;index<raw.poses.length;index++){
    const pose=raw.poses[index];assert(vector(pose.listener));assert(integer(pose.audioFrameBefore)&&integer(pose.audioFrameAfter)&&pose.audioFrameAfter>=pose.audioFrameBefore);assert(finite(pose.performanceTime));
    observed(pose.audioFrameBefore,pose.performanceTime);observed(pose.audioFrameAfter,pose.performanceTime);
    assert(integer(pose.sceneFrame)&&integer(pose.physicsSteps));assert(Array.isArray(pose.keys)&&pose.keys.length<=16&&pose.keys.every(key=>typeof key==='string'&&key.length<=40));
    assert(Array.isArray(pose.sourcePositions)&&pose.sourcePositions.length===ids.length);assert(Array.isArray(pose.distanceGains)&&pose.distanceGains.length===ids.length&&pose.distanceGains.every(value=>finite(value)&&value>=0));
    pose.sourcePositions.forEach((position,sourceIndex)=>assert.deepEqual(position,definition.expectedPositions[sourceIndex].map(Math.fround)));
    if(index){const previous=raw.poses[index-1];assert(pose.audioFrameBefore>=previous.audioFrameAfter&&pose.performanceTime>=previous.performanceTime&&pose.physicsSteps>=previous.physicsSteps&&pose.sceneFrame>=previous.sceneFrame,'Native pose/clock sequence regressed');}
  }
  for(let index=0;index<raw.renderFrames.length;index++){
    const frame=raw.renderFrames[index];observed(frame.audioFrame,frame.performanceTime);assert(integer(frame.sceneFrame)&&integer(frame.physicsSteps));
    if(index){const previous=raw.renderFrames[index-1];assert(frame.sceneFrame>previous.sceneFrame&&frame.physicsSteps>=previous.physicsSteps&&frame.audioFrame>=previous.audioFrame&&frame.performanceTime>=previous.performanceTime);}
  }
  assert(raw.renderFrames.at(-1).physicsSteps>raw.renderFrames[0].physicsSteps,'No actual physics progression');
  exactKeys(raw.windows,ids);
  const windowFrames=Math.max(128,Math.floor(raw.sampleRate/50/128)*128);
  for(const id of ids){
    const windows=raw.windows[id];bounded(windows,definition.maximumWindowsPerSource,'paired windows');
    for(let index=0;index<windows.length;index++){
      const window=windows[index];exactKeys(window,['type','startFrame','endFrame','frames','sampleRate','inputChannels','postChannels','invalidFrames','inputRms','postGainRms','gainMin','gainMax','gainSamples','droppedWindows','receivedPerformanceTime']);
      assert.equal(window.type,'paired-audio-window');assert.equal(window.frames,windowFrames);assert.equal(window.sampleRate,raw.sampleRate);
      assert(integer(window.startFrame)&&window.endFrame===window.startFrame+windowFrames);assert.equal(window.inputChannels,1);assert.equal(window.postChannels,1);
      assert.equal(window.invalidFrames,0);assert.equal(window.droppedWindows,0);assert(integer(window.gainSamples)&&window.gainSamples>0&&window.gainSamples<=windowFrames);
      assert(finite(window.inputRms)&&window.inputRms>0,'Silent/stopped input cannot prove attenuation');
      assert(finite(window.postGainRms)&&window.postGainRms>=0&&finite(window.gainMin)&&finite(window.gainMax)&&window.gainMin>=0&&window.gainMax>=window.gainMin);assert(finite(window.receivedPerformanceTime));
      observed(window.startFrame,window.receivedPerformanceTime);observed(window.endFrame,window.receivedPerformanceTime);
      if(index){assert.equal(window.startFrame,windows[index-1].endFrame,'Missing or repeated paired sample windows');assert(window.receivedPerformanceTime>=windows[index-1].receivedPerformanceTime);}
    }
    assert(windows[0].startFrame<=events.center.audioFrame,'Trace misses the beginning of center calibration');
    assert(windows.at(-1).endFrame>=events.finished.audioFrame,'Trace ends before the final declared phase');
  }
  return {definition,ids,events,windowFrames,quantum:definition.audioRenderQuantumFrames};
}

function inPhase(windows,event,quantum) {
  return windows.filter(window=>window.startFrame>=event.audioFrame+quantum&&window.endFrame<=event.end.audioFrame-quantum);
}

function poseRange(raw,window,sourceIndex,quantum) {
  const start=window.startFrame-quantum,end=window.endFrame+quantum;
  let previous=null;const selected=[];
  for(const pose of raw.poses){
    if(pose.audioFrameAfter<=start)previous=pose;
    if(pose.audioFrameAfter>=start&&pose.audioFrameBefore<=end)selected.push(pose);
    if(pose.audioFrameBefore>end)break;
  }
  assert(previous,'Paired window has no preceding native pose');selected.unshift(previous);
  const distances=selected.map(pose=>distance(pose.listener,pose.sourcePositions[sourceIndex]));
  return {minimum:Math.min(...distances),maximum:Math.max(...distances),poseSamples:selected.length};
}

export function validateCenterAudio(raw,profile) {
  const {ids,events,quantum}=inspectTrace(raw,profile),selected=ids.map(id=>inPhase(raw.windows[id],events.center,quantum));
  const byFrame=selected.map(windows=>new Map(windows.map(window=>[window.startFrame,window])));
  const frames=[...byFrame[0].keys()].filter(frame=>byFrame.every(map=>map.has(frame)));assert(frames.length>=2,'No overlapping four-source calibration windows');
  const poses=raw.poses.filter(pose=>pose.audioFrameBefore>=events.center.audioFrame&&pose.audioFrameAfter<events.center.end.audioFrame);
  assert(poses.length>=2);assert(poses.every(pose=>Math.hypot(pose.listener[0],pose.listener[2])<=profile.coordinates.maximumAnchorErrorMeters),'The listener did not remain natively centered');
  const measurements=frames.map(frame=>{
    const sources=ids.map((id,index)=>{const window=byFrame[index].get(frame);assert(window.postGainRms>0);return {id,gain:window.postGainRms/window.inputRms,inputRms:window.inputRms,postGainRms:window.postGainRms,gainMin:window.gainMin,gainMax:window.gainMax};});
    const gains=sources.map(source=>source.gain),differenceDb=20*Math.log10(Math.max(...gains)/Math.min(...gains));
    assert(differenceDb<=profile.audio.equalDistanceMaximumDifferenceDb,`Equal-distance difference ${differenceDb} dB exceeds frozen limit`);
    const sampleDifferenceDb=20*Math.log10(Math.max(...sources.map(source=>source.gainMax))/Math.min(...sources.map(source=>source.gainMin)));
    assert(finite(sampleDifferenceDb)&&sampleDifferenceDb<=profile.audio.equalDistanceMaximumDifferenceDb,'Per-sample calibrated gain bounds exceed the frozen balance limit');
    return {startFrame:frame,sources,differenceDb,sampleDifferenceDb};
  });
  return {overlappingWindows:frames.length,maximumDifferenceDb:Math.max(...measurements.map(value=>value.differenceDb)),maximumPerSampleDifferenceDb:Math.max(...measurements.map(value=>value.sampleDifferenceDb)),maximumAllowedDifferenceDb:profile.audio.equalDistanceMaximumDifferenceDb,measurements,physicalLocalizationMeasured:false};
}

export function validateDistanceTrace(raw,profile) {
  const {definition,ids,events,quantum}=inspectTrace(raw,profile),sourceIndex=ids.indexOf(definition.primarySourceId),windows=raw.windows[definition.primarySourceId];
  const annotated=windows.filter(window=>window.startFrame>=raw.poses[0].audioFrameAfter+quantum).map(window=>({window,range:poseRange(raw,window,sourceIndex,quantum)}));
  const legs=[];
  for(const phase of ['outward','return']){
    const event=events[phase],poses=raw.poses.filter(pose=>pose.phase===phase),key=phase==='outward'?'KeyW':'KeyS';
    assert(poses.length>=2&&poses.some(pose=>pose.keys.includes(key)),'Native movement key was not observed');
    assert(poses.at(-1).physicsSteps>poses[0].physicsSteps&&poses.at(-1).sceneFrame>poses[0].sceneFrame,'No native movement/render progress');
    const distances=poses.map(pose=>distance(pose.listener,pose.sourcePositions[sourceIndex]));
    assert(Math.min(...distances)<10&&Math.max(...distances)>=14,'Native listener did not traverse the full fade range');
    const eligible=annotated.filter(item=>item.window.startFrame>=event.audioFrame+quantum&&item.window.endFrame<=event.end.audioFrame-quantum);
    const bins=definition.distanceBinsMeters.map(([lower,upper])=>{
      const members=eligible.filter(item=>item.range.minimum>=lower&&item.range.maximum<upper);assert(members.length>=2,`${phase} lacks complete windows within ${lower}–${upper} m`);
      const samples=members.map(({window,range})=>{
        const measuredGain=window.postGainRms/window.inputRms,d=(range.minimum+range.maximum)/2,expected=referenceGain(d);
        assert(measuredGain>0&&window.gainMin>0,'A complete inside-cutoff window became silent');
        return {startFrame:window.startFrame,endFrame:window.endFrame,distanceRangeMeters:range,measuredGain,distanceNormalizedGain:measuredGain*d,distanceNormalizedBounds:[window.gainMin*range.minimum,window.gainMax*range.maximum],referenceGainAtRangeMidpoint:expected,referenceResidualDbAtRangeMidpoint:20*Math.log10(measuredGain/expected)};
      });
      const representative=samples[Math.floor(samples.length/2)];
      return {lowerMeters:lower,upperMeters:upper,windows:samples.length,medianDistanceNormalizedGain:median(samples.map(sample=>sample.distanceNormalizedGain)),representativeFrame:representative.startFrame,representativeDistanceNormalizedBounds:representative.distanceNormalizedBounds,firstFrame:samples[0].startFrame,lastFrame:samples.at(-1).endFrame,samples};
    });
    for(let index=1;index<bins.length;index++){
      assert(bins[index-1].representativeDistanceNormalizedBounds[0]>bins[index].representativeDistanceNormalizedBounds[1],'The observed fade envelope is not resolved as decreasing across the declared distance bins');
      assert(phase==='outward'?bins[index-1].lastFrame<bins[index].firstFrame:bins[index].lastFrame<bins[index-1].firstFrame,'Distance bins were not crossed in the prescribed direction');
    }
    const steps=distances.slice(1).map((value,index)=>Math.abs(value-distances[index]));
    legs.push({phase,observedKey:key,minimumDistanceMeters:Math.min(...distances),maximumDistanceMeters:Math.max(...distances),maximumNativeDistanceStepMeters:Math.max(...steps),poseSamples:poses.length,physicsSteps:poses.at(-1).physicsSteps-poses[0].physicsSteps,sceneFrames:poses.at(-1).sceneFrame-poses[0].sceneFrame,bins});
  }
  const outside=annotated.filter(item=>item.window.startFrame>=events.outside.audioFrame+quantum&&item.window.endFrame<=events.outside.end.audioFrame-quantum&&item.range.minimum>=14);
  assert(outside.length>=2,'No complete outside-cutoff hold windows');
  const routeWindows=annotated.filter(item=>item.window.startFrame>=events.outward.audioFrame+quantum&&item.window.endFrame<=events.returned.audioFrame-quantum);
  let zeroWindows=0,positiveWindows=0,boundaryWindows=0;
  for(const {window,range} of routeWindows){
    if(range.minimum>=14){assert.equal(window.postGainRms,0,'Sound remains in a complete outside-cutoff window');assert.equal(window.gainMin,0);assert.equal(window.gainMax,0);zeroWindows++;}
    else if(range.maximum<14){assert(window.postGainRms>0&&window.gainMin>0,'Premature digital silence before cutoff');positiveWindows++;}
    else boundaryWindows++;
  }
  assert(zeroWindows>=2&&positiveWindows>=2);
  return {legs,outsideHoldWindows:outside.length,zeroWindows,positiveWindows,boundaryWindows,sourceWindowCounts:Object.fromEntries(ids.map(id=>[id,raw.windows[id].length])),referenceCurveErrorAcceptanceTolerance:null,physicalSmoothnessMeasured:false,note:'Every paired window is retained. Midpoint reference residuals and native update steps are diagnostics; no new numerical curve-error tolerance is applied.'};
}

export function validateCleanup(raw) {
  assert.equal(raw?.observerPresent,false);assert.equal(raw?.state,'disposed');assert.equal(raw.nodes,0);assert.equal(raw.bodies,0);assert.equal(raw.urls,0);assert.equal(raw.sources,0);assert.equal(raw.audio,'closed');assert.equal(raw.sceneDisposed,true);assert.equal(raw.physicsFreed,true);assert.equal(raw.videos,0);assert.equal(raw.keys,0);
  return raw;
}

/** A stalled browser evaluation must not outlive its failed measurement. The
 * caller supplies the public BrowserServer.kill() operation for its own child. */
export async function withinMeasurementDeadline(operation,{milliseconds,label,stop,closeMilliseconds=10000}) {
  let timer,expired=false;
  try {
    return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('Measurement deadline: '+label));},milliseconds);})]);
  } catch(error) {
    if(expired&&stop){
      let closeTimer;
      try { await Promise.race([Promise.resolve().then(stop),new Promise((_,reject)=>{closeTimer=setTimeout(()=>reject(new Error('Owned browser cancellation deadline')),closeMilliseconds);})]); }
      catch(cleanup){throw new AggregateError([error,cleanup],'Measurement and owned-browser cancellation failed');}
      finally { clearTimeout(closeTimer); }
    }
    throw error;
  } finally { clearTimeout(timer); }
}

/** Wait for native state without treating an unresolved async UI handler as a
 * completed activation; retain the same bounded read and owner-cancellation path. */
export async function waitForNativeObservation(read,accept,{label,milliseconds=10000,stop}) {
  const end=performance.now()+milliseconds;let last;
  while(performance.now()<end){
    last=await withinMeasurementDeadline(read,{milliseconds:Math.max(1,end-performance.now()),label,stop});
    if(accept(last))return last;
    await new Promise(resolve=>setTimeout(resolve,Math.min(25,Math.max(0,end-performance.now()))));
  }
  throw new Error(label+' did not reach the declared native observation before its deadline; last='+JSON.stringify(last));
}

/** Snapshot final status only after both owners close and current files are
 * checked again. Late page errors, requests and any cleanup failure invalidate
 * a formerly passing check list. */
export async function finalizeMeasurement({checks,closeBrowser,closeServer,readBinding,diagnostics,fatalError=null}) {
  const finalizationErrors=[];
  const attempt=async(stage,action)=>{try{return await action();}catch(error){finalizationErrors.push({stage,message:String(error?.message||error).slice(0,2048)});return null;}};
  await attempt('browser-close',closeBrowser);await attempt('server-close',closeServer);
  const finalBinding=await attempt('current-source-build-binding',readBinding);
  const {logs,failedRequests,logOverflow=0,requestOverflow=0}=structuredClone(diagnostics());
  const counts={passed:checks.filter(check=>check.status==='passed').length,failed:checks.filter(check=>check.status==='failed').length,pageErrors:logs.filter(log=>['error','pageerror'].includes(log.type)).length,failedRequests:failedRequests.length,logOverflow,requestOverflow};
  const complete=checks.length===measurementCheckIds.length&&checks.every((check,index)=>check.id===measurementCheckIds[index]&&check.status==='passed'&&check.method==='real-browser');
  const runStatus=complete&&fatalError===null&&counts.pageErrors===0&&counts.failedRequests===0&&counts.logOverflow===0&&counts.requestOverflow===0&&finalizationErrors.length===0?'passed':'failed';
  return {finalBinding,logs,failedRequests,finalizationErrors,counts,runStatus,fatalError,timestamp:new Date().toISOString()};
}
