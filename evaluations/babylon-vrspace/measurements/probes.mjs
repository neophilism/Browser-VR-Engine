// These functions are serialized into a real Playwright page. They only observe
// native candidate objects; the audio hook forwards the original method unchanged.
export async function readNativeAnchors(profile) {
  const app=window.foundationProbe,B=window.BABYLON,definition=profile.coordinates;
  if(!app||!B||!app.scene||app.scene.isDisposed)throw new Error('A live native evaluation is required');
  const entity=app.nodes.get(definition.entityId),container=entity?.metadata?.container;
  if(!container||entity.metadata.assetId!==definition.assetId)throw new Error('The imported coordinate container is missing');
  const original=app.originals.get(definition.assetId);
  if(!(original?.bytes instanceof Uint8Array))throw new Error('The actual loaded original bytes are missing');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',original.bytes)),value=>value.toString(16).padStart(2,'0')).join('');
  const meshes=definition.axes.map(axis=>{
    const found=container.meshes.filter(mesh=>mesh.name===axis.name&&mesh.getTotalVertices()>0);
    if(found.length!==1)throw new Error('Expected one native loaded mesh for '+axis.name);
    const mesh=found[0],positions=mesh.getVerticesData(B.VertexBuffer.PositionKind);
    if(!positions||positions.length<12||positions.length>definition.maximumPositionFloatsPerMesh||positions.length%3)throw new Error('Unexpected native vertex-buffer size');
    const parents=[];let parent=mesh.parent;
    while(parent){if(parents.length>=16)throw new Error('Unexpected coordinate hierarchy depth');parents.push({name:parent.name,entityId:parent.metadata?.entityId??null});parent=parent.parent;}
    return {name:mesh.name,axis:axis.axis,uniqueId:mesh.uniqueId,vertices:mesh.getTotalVertices(),positions:Array.from(positions),worldMatrix:Array.from(mesh.computeWorldMatrix(true).asArray()),parents,inScene:app.scene.meshes.includes(mesh)};
  });
  return {method:'loaded-native-vertex-buffer-and-world-matrix',rightHanded:app.scene.useRightHandedSystem,sceneFrame:app.scene.getFrameId(),physicsSteps:app.physicsSteps,assetId:entity.metadata.assetId,originalBytes:original.bytes.length,originalSha256:digest,containerRegistered:app.containers.includes(container),meshes};
}

export function installAudioTrace(profile) {
  if(window.__bveNativeMeasurement)throw new Error('A measurement observer already owns this page');
  const app=window.foundationProbe,graph=app?.audio,definition=profile.audio;
  if(!graph||graph.closed)throw new Error('A live native audio graph is required');
  const context=graph.context,ids=definition.sourceIds,owned=new Map(),handlers=new Map();
  for(const id of ids){const item=graph.sources.get(id);if(!item)throw new Error('Missing native corner source '+id);owned.set(id,item);}
  const vector=(owner,prefix)=>['X','Y','Z'].map(axis=>owner[prefix+axis].value);
  const sourceState=()=>ids.map(id=>{
    const item=graph.sources.get(id);
    return {id,sourceType:item.source.constructor.name,sameContext:item.source.context===context,loop:item.source.loop,bufferLength:item.source.buffer?.length??null,bufferSampleRate:item.source.buffer?.sampleRate??null,position:vector(item.panner,'position'),curve:{...item.descriptor.curve},gain:item.distanceGain.gain.value,meterInputs:item.meter.numberOfInputs,meterOutputs:item.meter.numberOfOutputs,invalidMessages:item.meterState.invalidMessages};
  });
  const report={sampleRate:context.sampleRate,phase:'installed',startedPerformanceTime:performance.now(),startedAudioFrame:Math.round(context.currentTime*context.sampleRate),poses:[],renderFrames:[],windows:Object.fromEntries(ids.map(id=>[id,[]])),events:[],overflow:{poses:0,renderFrames:0,windows:0},errors:[],initial:{contextState:context.state,sources:sourceState(),totalSources:graph.sources.size,listener:vector(context.listener,'position')}};
  const state={report,app,graph,context,owned,handlers,phase:'installed',stopped:false,previousSetListener:graph.setListener,observer:null,wrapped:null};
  const append=(array,value,maximum,kind)=>{if(array.length<maximum)array.push(value);else report.overflow[kind]=Math.min(1000,report.overflow[kind]+1);};
  const capture=(before,kind='listener-update')=>{
    if(state.stopped)return;
    const after=context.currentTime;
    append(report.poses,{kind,phase:state.phase,performanceTime:performance.now(),audioFrameBefore:Math.round(before*context.sampleRate),audioFrameAfter:Math.round(after*context.sampleRate),listener:vector(context.listener,'position'),sourcePositions:ids.map(id=>vector(graph.sources.get(id).panner,'position')),distanceGains:ids.map(id=>graph.sources.get(id).distanceGain.gain.value),sceneFrame:app.scene.getFrameId(),physicsSteps:app.physicsSteps,keys:[...app.keys].sort()},definition.maximumPoseSamples,'poses');
  };
  state.capture=capture;
  try{
    state.wrapped=function(...args){const before=context.currentTime,result=Reflect.apply(state.previousSetListener,this,args);if(this===graph)capture(before);return result;};
    graph.setListener=state.wrapped;
    for(const [id,item] of owned){
      const handler=event=>{if(state.stopped)return;append(report.windows[id],{...structuredClone(event.data),receivedPerformanceTime:performance.now()},definition.maximumWindowsPerSource,'windows');};
      handlers.set(id,handler);item.meter.port.addEventListener('message',handler);item.meter.port.start();
    }
    state.observer=app.scene.onAfterRenderObservable.add(()=>{
      if(state.stopped)return;
      append(report.renderFrames,{performanceTime:performance.now(),audioFrame:Math.round(context.currentTime*context.sampleRate),sceneFrame:app.scene.getFrameId(),physicsSteps:app.physicsSteps},definition.maximumFrameSamples,'renderFrames');
    });
    window.__bveNativeMeasurement=state;capture(context.currentTime,'initial');
    return report.initial;
  }catch(error){
    state.stopped=true;
    for(const [id,handler] of handlers)owned.get(id).meter.port.removeEventListener('message',handler);
    if(state.observer)app.scene.onAfterRenderObservable.remove(state.observer);
    if(graph.setListener===state.wrapped)graph.setListener=state.previousSetListener;
    throw error;
  }
}

export function markAudioPhase(phase) {
  const state=window.__bveNativeMeasurement;
  if(!state||state.stopped)throw new Error('The native measurement observer is not active');
  const allowed=['warmup','center','route-settle','outward','outside','return','returned','finished'];
  if(!allowed.includes(phase)||state.report.events.length>=allowed.length)throw new Error('Unexpected or excessive measurement phase');
  state.phase=phase;state.report.phase=phase;
  const event={phase,performanceTime:performance.now(),audioFrame:Math.round(state.context.currentTime*state.context.sampleRate),sceneFrame:state.app.scene.getFrameId(),physicsSteps:state.app.physicsSteps};
  state.report.events.push(event);state.capture(state.context.currentTime,'phase');return event;
}

export function inspectAudioTrace() {
  const state=window.__bveNativeMeasurement;
  if(!state||state.stopped)throw new Error('The native measurement observer is not active');
  const listener=['X','Y','Z'].map(axis=>state.context.listener['position'+axis].value),source=state.graph.sources.get('corner-playback-0');
  const position=['X','Y','Z'].map(axis=>source.panner['position'+axis].value);
  return {phase:state.phase,audioFrame:Math.round(state.context.currentTime*state.context.sampleRate),audioTime:state.context.currentTime,contextState:state.context.state,performanceTime:performance.now(),distance:Math.hypot(...listener.map((value,index)=>value-position[index])),listener,keys:[...state.app.keys].sort(),physicsSteps:state.app.physicsSteps,sceneFrame:state.app.scene.getFrameId(),overflow:{...state.report.overflow}};
}

export function finishAudioTrace() {
  const state=window.__bveNativeMeasurement;if(!state)throw new Error('No measurement observer remains owned');
  state.stopped=true;
  const errors=state.report.errors,attempt=action=>{try{action();}catch(error){errors.push(String(error.message||error));}};
  for(const [id,handler] of state.handlers)attempt(()=>state.owned.get(id).meter.port.removeEventListener('message',handler));
  attempt(()=>{if(!state.app.scene.onAfterRenderObservable.remove(state.observer))throw new Error('Render observer ownership was lost');});
  attempt(()=>{if(state.graph.setListener!==state.wrapped)throw new Error('Listener hook ownership was lost');state.graph.setListener=state.previousSetListener;});
  const wall=state.graph.sources.get('wall-playback');
  state.report.final={contextState:state.context.state,finishedPerformanceTime:performance.now(),finishedAudioFrame:Math.round(state.context.currentTime*state.context.sampleRate),activation:state.graph.activation?structuredClone(state.graph.activation):null,totalSources:state.graph.sources.size,sameGraph:state.app.audio===state.graph,sameSources:[...state.owned].every(([id,item])=>state.graph.sources.get(id)===item),singleWallElementSource:!!wall&&wall.video===state.app.video&&wall.source.mediaElement===state.app.video&&state.graph.mediaSources.get(state.app.video)===wall.source,invalidMessages:[...state.owned].map(([id,item])=>({id,count:item.meterState.invalidMessages})),listenerMethodRestored:state.graph.setListener===state.previousSetListener};
  delete window.__bveNativeMeasurement;
  return state.report;
}
