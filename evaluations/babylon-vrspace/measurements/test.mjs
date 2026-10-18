import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fixtureRoot} from '../config.mjs';
import {loadFixtureSet} from '../fixtures.mjs';
import {loadMeasurementProfile,verifyProfileFixtures,validateCoordinateReadback,validateCenterAudio,validateDistanceTrace,validateCleanup,referenceGain,measurementCheckIds,withinMeasurementDeadline,waitForNativeObservation,finalizeMeasurement} from './evidence.mjs';
import {validateMeasurementRecord} from './verify.mjs';

const {profile}=await loadMeasurementProfile();

test('an unresolved native evaluation triggers bounded owned-browser cancellation',async()=>{
  let stops=0;
  await assert.rejects(withinMeasurementDeadline(()=>new Promise(()=>{}),{milliseconds:5,label:'held-native-operation',stop:async()=>{stops++;}}),/Measurement deadline/);
  assert.equal(stops,1);
});
test('owned-browser cancellation itself has a finite failure deadline',async()=>{
  await assert.rejects(withinMeasurementDeadline(()=>new Promise(()=>{}),{milliseconds:5,closeMilliseconds:5,label:'held-native-operation',stop:()=>new Promise(()=>{})}),AggregateError);
});
test('post-click native activation waits for asynchronous running before warmup',async()=>{
  const observed=[];
  const state=await waitForNativeObservation(async()=>{const contextState=observed.length?'running':'suspended';observed.push(contextState);return {contextState};},value=>value.contextState==='running',{label:'native activation',milliseconds:1000,stop:async()=>{assert.fail('A completed activation should not kill its owner');}});
  assert.deepEqual(observed,['suspended','running']);assert.equal(state.contextState,'running');
});
test('a context that remains suspended fails its native activation deadline',async()=>{
  await assert.rejects(waitForNativeObservation(async()=>({contextState:'suspended'}),value=>value.contextState==='running',{label:'native activation',milliseconds:5,stop:async()=>{}}),/native activation did not reach.*deadline/);
});
test('final status includes late error/request events and every owner cleanup failure',async()=>{
  const passed=measurementCheckIds.map(id=>({id,status:'passed',method:'real-browser'}));
  for(const fault of ['late-error','late-request','close-browser','close-server','binding','fatal']){
    const logs=[],failedRequests=[];let serverClosed=false;
    const result=await finalizeMeasurement({checks:passed,fatalError:fault==='fatal'?'failed native operation':null,
      closeBrowser:async()=>{if(fault==='late-error')logs.push({type:'pageerror',text:'late error'});if(fault==='late-request')failedRequests.push({url:'http://127.0.0.1/late'});if(fault==='close-browser')throw new Error('close');},
      closeServer:async()=>{serverClosed=true;if(fault==='close-server')throw new Error('close');},readBinding:async()=>{if(fault==='binding')throw new Error('changed bytes');return {};},diagnostics:()=>({logs,failedRequests})});
    assert.equal(result.runStatus,'failed',fault);assert.equal(serverClosed,true);
  }
  for(const fatalError of [false,0,'']){
    const result=await finalizeMeasurement({checks:passed,fatalError,closeBrowser:async()=>{},closeServer:async()=>{},readBinding:async()=>({}),diagnostics:()=>({logs:[],failedRequests:[]})});
    assert.equal(result.runStatus,'failed',`Malformed fatalError ${JSON.stringify(fatalError)}`);
  }
  const good=await finalizeMeasurement({checks:passed,closeBrowser:async()=>{},closeServer:async()=>{},readBinding:async()=>({checked:true}),diagnostics:()=>({logs:[],failedRequests:[]})});
  assert.equal(good.runStatus,'passed');assert.deepEqual(good.finalBinding,{checked:true});
});

test('the independent report verifier recomputes raw readings and rejects forged success or scope',()=>{
  const coordinates=coordinateReadback(),audio=audioTrace(),binding={syntheticUnitTestOnly:true},cleanup={observerPresent:false,state:'disposed',nodes:0,bodies:0,urls:0,sources:0,audio:'closed',sceneDisposed:true,physicsFreed:true,videos:0,keys:0};
  const details=[validateCoordinateReadback(coordinates,profile),validateCenterAudio(audio,profile),validateDistanceTrace(audio,profile),validateCleanup(cleanup)];
  const checks=measurementCheckIds.map((id,index)=>({id,status:'passed',method:'real-browser',detail:details[index]}));
  const report={schemaVersion:1,method:'real-browser',runStatus:'passed',qualificationStatus:'incomplete',physicalHeadset:false,physicalAudio:false,avTimingMeasured:false,performanceWorkloadExecuted:false,
    environment:{physicalGPU:false,viewport:profile.viewport,browser:'synthetic-unit-input',playwright:'1.62.1'},profile,profileSha256:'synthetic',binding,finalBinding:binding,
    fatalError:null,audioCollectionError:null,finalizationErrors:[],failedRequests:[],logs:[],counts:{passed:4,failed:0,pageErrors:0,failedRequests:0,logOverflow:0,requestOverflow:0},checks,cleanup,
    startedAt:'2026-10-18T01:00:00Z',timestamp:'2026-10-18T01:01:00Z',missingEvidence:['Physical scale','Physical audio','A/V offset']};
  const summary={schemaVersion:1,runStatus:'passed',qualificationStatus:'incomplete',physicalHeadset:false,physicalAudio:false,avTimingMeasured:false,profileSha256:'synthetic',counts:report.counts,checks:checks.map(({id,status,method})=>({id,status,method}))};
  const verify=value=>validateMeasurementRecord(value,summary,{profile,profileSha256:'synthetic',binding,coordinates,audio});
  assert.equal(verify(report).qualificationStatus,'incomplete');
  for(const mutate of [value=>{value.fatalError=false;},value=>{value.audioCollectionError='late';},value=>{value.physicalAudio=true;},value=>{value.avTimingMeasured=true;},value=>{value.checks[0].detail.maximumObservedAnchorErrorMeters=0;},value=>{value.finalBinding={changed:true};},value=>{value.finalizationErrors.push({stage:'close',message:'failed'});}]){
    const changed=structuredClone(report);mutate(changed);assert.throws(()=>verify(changed));
  }
});

function coordinateReadback(){
  return {method:'loaded-native-vertex-buffer-and-world-matrix',rightHanded:true,sceneFrame:2,physicsSteps:1,assetId:profile.coordinates.assetId,originalSha256:profile.coordinates.assetRevision,originalBytes:5085,containerRegistered:true,meshes:profile.coordinates.axes.map(({axis,name})=>{
    const positions=[];for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5])positions.push(x,y,z);
    const scale=[.1,.1,.1];scale[axis]=1;const position=[...profile.coordinates.expectedOrigin];position[axis]+=.5;
    return {name,axis,uniqueId:axis+1,vertices:8,positions,worldMatrix:[scale[0],0,0,0,0,scale[1],0,0,0,0,scale[2],0,...position,1].map(Math.fround),parents:[{name:'coordinate-markers',entityId:'coordinate-markers'}],inScene:true};
  })};
}

function audioTrace(gainFunction=referenceGain){
  const sampleRate=48000,frames=896,phaseStarts=[0,60,84,108,288,312,492,516],phases=['warmup','center','route-settle','outward','outside','return','returned','finished'];
  const event=index=>({phase:phases[index],audioFrame:phaseStarts[index]*frames,performanceTime:phaseStarts[index]*frames/sampleRate*1000,sceneFrame:phaseStarts[index]+1,physicsSteps:phaseStarts[index]+1});
  const positions=profile.audio.expectedPositions.map(value=>value.map(Math.fround)),ids=profile.audio.sourceIds;
  const raw={sampleRate,phase:'finished',startedPerformanceTime:0,startedAudioFrame:0,events:phases.map((_,index)=>event(index)),overflow:{poses:0,renderFrames:0,windows:0},errors:[],poses:[],renderFrames:[],windows:Object.fromEntries(ids.map(id=>[id,[]])),initial:{contextState:'suspended',totalSources:6,listener:[0,Math.fround(1.65),0],sources:ids.map((id,index)=>({id,sourceType:'AudioBufferSourceNode',sameContext:true,loop:true,bufferLength:48000,bufferSampleRate:48000,position:positions[index],curve:{...profile.audio.curve},gain:1,meterInputs:2,meterOutputs:0,invalidMessages:0}))},final:{contextState:'running',totalSources:6,sameGraph:true,sameSources:true,singleWallElementSource:true,listenerMethodRestored:true,activation:{isActive:true,after:'running'},invalidMessages:ids.map(id=>({id,count:0}))}};
  for(let index=0;index<520;index++){
    let phaseIndex=0;for(let candidate=0;candidate<phaseStarts.length;candidate++)if(index>=phaseStarts[candidate])phaseIndex=candidate;
    const phase=phases[phaseIndex],eyeY=Math.fround(1.65);let listener=[0,eyeY,0];
    if(index>=84){
      const d=index<108?9.5:index<288?9.5+(index-108)/180*5:index<312?14.5:index<492?14.5-(index-312)/180*5:9.5;
      listener=[Math.fround(-6+Math.sqrt(d*d-(eyeY-positions[0][1])**2)),eyeY,-6];
    }
    const gains=positions.map(source=>gainFunction(Math.hypot(...listener.map((value,axis)=>value-source[axis]))));
    raw.poses.push({kind:'listener-update',phase,performanceTime:index*frames/sampleRate*1000,audioFrameBefore:index*frames,audioFrameAfter:index*frames,listener,sourcePositions:structuredClone(positions),distanceGains:gains,sceneFrame:index+1,physicsSteps:index+1,keys:phase==='outward'?['KeyW']:phase==='return'?['KeyS']:[]});
    raw.renderFrames.push({performanceTime:index*frames/sampleRate*1000,audioFrame:index*frames,sceneFrame:index+1,physicsSteps:index+1});
    for(let source=0;source<ids.length;source++)raw.windows[ids[source]].push({type:'paired-audio-window',startFrame:index*frames,endFrame:(index+1)*frames,frames,sampleRate,inputChannels:1,postChannels:1,invalidFrames:0,inputRms:.0625,postGainRms:.0625*gains[source],gainMin:gains[source],gainMax:gains[source],gainSamples:frames,droppedWindows:0,receivedPerformanceTime:(index+1)*frames/sampleRate*1000});
  }
  raw.final.finishedAudioFrame=520*frames;raw.final.finishedPerformanceTime=520*frames/sampleRate*1000;
  return raw;
}

test('future or post-finish native evidence cannot inflate an otherwise complete trace',()=>{
  for(const mutate of [
    value=>{for(const windows of Object.values(value.windows)){const last=structuredClone(windows.at(-1));last.startFrame=last.endFrame;last.endFrame+=last.frames;windows.push(last);}},
    value=>{value.windows['corner-playback-0'].at(-1).receivedPerformanceTime=value.final.finishedPerformanceTime+1;},
    value=>{value.poses.at(-1).audioFrameAfter=value.final.finishedAudioFrame+128;},
    value=>{value.poses.at(-2).audioFrameAfter=value.poses.at(-1).audioFrameBefore+128;},
    value=>{value.renderFrames.at(-1).performanceTime=value.final.finishedPerformanceTime+1;},
    value=>{value.events.at(-1).audioFrame=value.final.finishedAudioFrame+128;},
    value=>{value.startedAudioFrame=-1;},
    value=>{value.startedPerformanceTime=-1;},
    value=>{value.final.finishedPerformanceTime=NaN;},
    value=>{value.final.finishedPerformanceTime=profile.audio.maximumTraceWallMilliseconds+1;},
    value=>{value.final.finishedAudioFrame=null;},
  ]){const raw=audioTrace();mutate(raw);assert.throws(()=>validateCenterAudio(raw,profile));}
});

test('pre-execution profile matches the frozen comparison and thresholds',async()=>{
  const {manifest}=await loadFixtureSet(fixtureRoot);verifyProfileFixtures(profile,manifest);
  const changed=structuredClone(manifest);changed.thresholds.staticAnchorErrorMeters=.01;
  assert.throws(()=>verifyProfileFixtures(profile,changed));
  assert.equal((await readFile(resolve(fixtureRoot,'media/screen-marker.webm'))).length,116192);
});
test('loaded native vertex and matrix readings resolve all six one-meter anchors',()=>{
  const result=validateCoordinateReadback(coordinateReadback(),profile);assert.equal(result.anchors.length,3);assert(result.maximumObservedAnchorErrorMeters<.000001);assert(result.anchors.every(anchor=>Math.abs(anchor.measuredLengthMeters-1)<.000001));
});
test('a two-millimeter native translation is rejected by the frozen one-millimeter gate',()=>{
  const raw=coordinateReadback();raw.meshes[0].worldMatrix[12]+=.002;assert.throws(()=>validateCoordinateReadback(raw,profile),/1 mm/);
});
test('centimeter-scale import and handedness reflection cannot pass via entity metadata',()=>{
  for(const scale of [.01,-1]){const raw=coordinateReadback();raw.meshes[2].worldMatrix[10]=scale;assert.throws(()=>validateCoordinateReadback(raw,profile),/1 mm/);}
});
test('missing, duplicate and unrelated native mesh identities are rejected',()=>{
  for(const change of [raw=>raw.meshes.pop(),raw=>{raw.meshes[1].name=raw.meshes[0].name;},raw=>{raw.meshes[2].uniqueId=raw.meshes[1].uniqueId;},raw=>{raw.meshes[0].parents=[];},raw=>{raw.originalSha256='0'.repeat(64);}]){const raw=coordinateReadback();change(raw);assert.throws(()=>validateCoordinateReadback(raw,profile));}
});
test('nonfinite, projective and excessive native buffers fail before measurement',()=>{
  for(const change of [raw=>{raw.meshes[0].positions[0]=NaN;},raw=>{raw.meshes[0].worldMatrix[3]=1;},raw=>{raw.meshes[0].positions=Array(4098).fill(0);}]){const raw=coordinateReadback();change(raw);assert.throws(()=>validateCoordinateReadback(raw,profile));}
});
test('four simultaneous paired corner windows preserve the 0.1 dB balance gate',()=>{
  const result=validateCenterAudio(audioTrace(),profile);assert(result.overlappingWindows>=2);assert.equal(result.maximumDifferenceDb,0);
});
test('a calibrated corner mismatch above 0.1 dB fails despite all four sources existing',()=>{
  const raw=audioTrace();for(const window of raw.windows['corner-playback-2']){window.postGainRms*=1.05;window.gainMin*=1.05;window.gainMax*=1.05;}
  assert.throws(()=>validateCenterAudio(raw,profile),/frozen limit/);
});
test('silent source input cannot masquerade as attenuation or cutoff',()=>{
  const raw=audioTrace();raw.windows['corner-playback-1'][80].inputRms=0;assert.throws(()=>validateCenterAudio(raw,profile),/Silent/);assert.throws(()=>validateDistanceTrace(raw,profile),/Silent/);
});
test('missing, duplicated, reordered and dropped sample windows fail coverage',()=>{
  for(const change of [raw=>raw.windows['corner-playback-0'].splice(180,1),raw=>raw.windows['corner-playback-0'].splice(180,0,raw.windows['corner-playback-0'][179]),raw=>{raw.windows['corner-playback-0'][180].droppedWindows=1;},raw=>{raw.windows['corner-playback-0'][180].invalidFrames=1;}]){const raw=audioTrace();change(raw);assert.throws(()=>validateDistanceTrace(raw,profile));}
});
test('outward and return native traces cover each fade bin and exact digital cutoff',()=>{
  const result=validateDistanceTrace(audioTrace(),profile);assert.equal(result.legs.length,2);assert(result.legs.every(leg=>leg.bins.length===4));assert(result.zeroWindows>=2);assert(result.outsideHoldWindows>=2);assert.equal(result.referenceCurveErrorAcceptanceTolerance,null);
});
test('an inverse-only hard cutoff cannot replace the resolved fade envelope',()=>{
  const raw=audioTrace(d=>d>=14?0:1/Math.max(1,d));assert.throws(()=>validateDistanceTrace(raw,profile),/resolved as decreasing/);
});
test('nonzero digital output beyond cutoff is rejected without a noise tolerance',()=>{
  const raw=audioTrace();for(let index=289;index<310;index++){const window=raw.windows['corner-playback-0'][index];window.postGainRms=.000001;window.gainMin=window.gainMax=.000016;}
  assert.throws(()=>validateDistanceTrace(raw,profile),/outside-cutoff/);
});
test('premature silence before fourteen meters fails the actual inside-region trace',()=>{
  const raw=audioTrace(d=>d>=13?0:referenceGain(d));assert.throws(()=>validateDistanceTrace(raw,profile),/inside-cutoff/);
});
test('a stationary listener or missing native movement key cannot supply route evidence',()=>{
  for(const change of [raw=>{for(const pose of raw.poses)pose.listener=[0,Math.fround(1.65),0];},raw=>{for(const pose of raw.poses)pose.keys=[];}]){const raw=audioTrace();change(raw);assert.throws(()=>validateDistanceTrace(raw,profile));}
});
test('changed source identity, restored-hook failure and observer overflow fail closed',()=>{
  for(const change of [raw=>{raw.final.sameSources=false;},raw=>{raw.final.listenerMethodRestored=false;},raw=>{raw.overflow.poses=1;},raw=>{raw.final.singleWallElementSource=false;}]){const raw=audioTrace();change(raw);assert.throws(()=>validateDistanceTrace(raw,profile));}
});
test('excessive samples, incomplete terminal coverage and missing user activation are rejected',()=>{
  for(const change of [raw=>{raw.windows['corner-playback-0']=Array(2401).fill(raw.windows['corner-playback-0'][0]);},raw=>{raw.windows['corner-playback-1']=raw.windows['corner-playback-1'].slice(0,510);},raw=>{raw.final.activation.isActive=false;}]){const raw=audioTrace();change(raw);assert.throws(()=>validateDistanceTrace(raw,profile));}
});
test('native cleanup must release the observer, context, physics, scene and retained keys',()=>{
  const clean={observerPresent:false,state:'disposed',nodes:0,bodies:0,urls:0,sources:0,audio:'closed',sceneDisposed:true,physicsFreed:true,videos:0,keys:0};assert.deepEqual(validateCleanup(clean),clean);
  for(const [key,value] of [['observerPresent',true],['audio','running'],['physicsFreed',false],['keys',1]])assert.throws(()=>validateCleanup({...clean,[key]:value}));
});
