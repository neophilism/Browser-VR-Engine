/** Test-only native allocation observer, installed before the evaluation module.
 * Live tables contain numeric/string IDs and plain metadata, never native nodes
 * or contexts. WeakMaps associate native context/port identities with those IDs.
 */
export function installLifecycleObserver(options,root=globalThis) {
  const glTypes=[['glBuffers','createBuffer','deleteBuffer'],['glFramebuffers','createFramebuffer','deleteFramebuffer'],['glPrograms','createProgram','deleteProgram'],['glRenderbuffers','createRenderbuffer','deleteRenderbuffer'],['glShaders','createShader','deleteShader'],['glTextures','createTexture','deleteTexture'],['glQueries','createQuery','deleteQuery'],['glSamplers','createSampler','deleteSampler'],['glSyncs','fenceSync','deleteSync'],['glTransformFeedbacks','createTransformFeedback','deleteTransformFeedback'],['glVertexArrays','createVertexArray','deleteVertexArray']];
  const categories=['objectUrls','audioContexts','workletPorts','timeouts','intervals','animationFrames',...glTypes.map(([category])=>category)];
  const live=Object.fromEntries(categories.map(key=>[key,new Map()]));
  const events=[],faults=[],contexts=new WeakMap(),ports=new WeakMap();
  let sequence=0,identity=0,overflow=0,cycle=0,phase='boot';
  const documentToken=root.crypto.randomUUID();
  const fault=message=>{if(faults.length<100)faults.push(String(message).slice(0,512));else overflow=Math.min(1000,overflow+1);};
  const record=(category,action,id,contextId)=>{
    const event={sequence:++sequence,cycle,phase,category,action,id};
    if(contextId!==undefined)event.contextId=contextId;
    if(events.length<options.maximumEvents)events.push(event);else overflow=Math.min(1000,overflow+1);
  };
  const add=(category,key,contextId)=>{
    if(live[category].size>=options.maximumLiveEntries){fault('Native live-entry budget exceeded for '+category);return null;}
    const id=category+':'+(++identity);live[category].set(key,{id,contextId});record(category,'allocate',id,contextId);return id;
  };
  const remove=(category,key,action)=>{
    const item=live[category].get(key);if(!item)return;
    live[category].delete(key);record(category,action,item.id,item.contextId);
  };
  const createURL=root.URL.createObjectURL,revokeURL=root.URL.revokeObjectURL;
  root.URL.createObjectURL=function(...args){const url=createURL.apply(this,args);add('objectUrls',url);return url;};
  root.URL.revokeObjectURL=function(url){const result=revokeURL.call(this,url);remove('objectUrls',url,'release');return result;};

  const NativeContext=root.AudioContext,closeContext=NativeContext.prototype.close;
  root.AudioContext=class extends NativeContext{
    constructor(...args){super(...args);const key=++identity,id=add('audioContexts',key);contexts.set(this,{key,id});}
  };
  NativeContext.prototype.close=function(...args){
    const context=contexts.get(this),result=closeContext.apply(this,args);
    return result.then(value=>{if(context)remove('audioContexts',context.key,'close');return value;});
  };
  const NativeWorklet=root.AudioWorkletNode,closePort=root.MessagePort.prototype.close;
  root.AudioWorkletNode=class extends NativeWorklet{
    constructor(context,...args){
      super(context,...args);const contextId=contexts.get(context)?.id;
      if(!contextId)fault('AudioWorkletNode used an unobserved AudioContext');
      const key=++identity;add('workletPorts',key,contextId||'unobserved');ports.set(this.port,key);
    }
  };
  root.MessagePort.prototype.close=function(...args){const result=closePort.apply(this,args);const key=ports.get(this);if(key!==undefined)remove('workletPorts',key,'close');return result;};

  // A weak handle map observes successful native release calls independently
  // of Babylon's collection clearing. No GPU byte lifetime is inferred.
  const glHandles=new WeakMap(),glContexts=new WeakMap();
  for(const NativeGL of [root.WebGLRenderingContext,root.WebGL2RenderingContext]){
    if(!NativeGL)continue;
    for(const [category,createName,deleteName] of glTypes){
      const prototype=NativeGL.prototype;
      if(!Object.hasOwn(prototype,createName)||!Object.hasOwn(prototype,deleteName))continue;
      const create=prototype[createName],release=prototype[deleteName];
      prototype[createName]=function(...args){const handle=create.apply(this,args);if(handle){if(!glContexts.has(this))glContexts.set(this,++identity);const key=++identity;add(category,key);glHandles.set(handle,{category,key,contextId:glContexts.get(this)});}return handle;};
      prototype[deleteName]=function(handle){const result=release.call(this,handle),owned=handle&&glHandles.get(handle);if(owned?.category===category&&owned.contextId===glContexts.get(this))remove(category,owned.key,'release');return result;};
    }
  }

  const setTimeoutNative=root.setTimeout,clearTimeoutNative=root.clearTimeout,setIntervalNative=root.setInterval,clearIntervalNative=root.clearInterval;
  root.setTimeout=function(callback,delay,...args){
    let key;
    if(typeof callback!=='function')fault('Unobservable string timer callback');
    const wrapped=typeof callback==='function'?function(...received){remove('timeouts',key,'fire');return callback.apply(this,received);}:callback;
    key=setTimeoutNative.call(this,wrapped,delay,...args);add('timeouts',key);return key;
  };
  root.setInterval=function(callback,delay,...args){
    if(typeof callback!=='function')fault('Unobservable string interval callback');
    const key=setIntervalNative.call(this,callback,delay,...args);add('intervals',key);return key;
  };
  const cleared=key=>{remove('timeouts',key,'clear');remove('intervals',key,'clear');};
  root.clearTimeout=function(key){const result=clearTimeoutNative.call(this,key);cleared(key);return result;};
  root.clearInterval=function(key){const result=clearIntervalNative.call(this,key);cleared(key);return result;};
  const requestFrame=root.requestAnimationFrame,cancelFrame=root.cancelAnimationFrame;
  root.requestAnimationFrame=function(callback){
    if(typeof callback!=='function')return requestFrame.call(this,callback);
    let key;
    const wrapped=function(timestamp){remove('animationFrames',key,'fire');return callback.call(this,timestamp);};
    key=requestFrame.call(this,wrapped);add('animationFrames',key);return key;
  };
  root.cancelAnimationFrame=function(key){const result=cancelFrame.call(this,key);remove('animationFrames',key,'clear');return result;};
  const snapshot=()=>({sequence,counters:Object.fromEntries(categories.map(key=>[key,live[key].size])),overflow,faults:[...faults],live:Object.fromEntries(categories.map(key=>[key,[...live[key].values()].map(item=>item.id).sort()]))});
  const api=Object.freeze({
    documentToken,
    mark(nextCycle,nextPhase){if(!Number.isInteger(nextCycle)||nextCycle<0||nextCycle>options.cycles||!options.phases.includes(nextPhase))throw new Error('Invalid lifecycle phase');cycle=nextCycle;phase=nextPhase;},
    snapshot,
    journal:()=>({events:events.map(event=>({...event})),overflow,faults:[...faults]}),
  });
  Object.defineProperty(root,'lifecycleObserver',{value:api,writable:false,configurable:false});
  return api;
}

/** Exact live baseline comparison; clocks, event IDs and cumulative creation
 * totals are intentionally outside the live-resource counters. */
export function emptySnapshotDifferences(snapshot,baseline,profile) {
  const differences=[];
  const keysEqual=(actual,expected)=>JSON.stringify(Object.keys(actual).sort())===JSON.stringify([...expected].sort());
  if(!keysEqual(snapshot.runtime.counters,profile.runtimeCounters)||!keysEqual(snapshot.runtime.scene,profile.sceneCounters)||!keysEqual(snapshot.native.counters,profile.nativeCounters))differences.push('counter-schema');
  for(const group of ['counters','scene'])for(const [key,value] of Object.entries(snapshot.runtime[group]))if(value!==0)differences.push('runtime.'+group+'.'+key);
  for(const key of profile.nativeCounters)if(snapshot.native.counters[key]!==0)differences.push('native.'+key);
  for(const key of ['pendingHostTask','failedOwner','publishedInstance','publishedAdapter','foundationReady'])if(snapshot.runtime.host[key]!==false)differences.push('host.'+key);
  if(snapshot.runtime.host.phase!=='empty'||snapshot.runtime.state!=='empty'||snapshot.runtime.instanceId!==null)differences.push('host.empty');
  if(snapshot.dom.videoElements!==0)differences.push('dom.videoElements');
  if(snapshot.cdp.audioContexts.length!==0)differences.push('cdp.audioContexts');
  if(snapshot.native.overflow||snapshot.native.faults.length)differences.push('native.observer');
  if(baseline&&JSON.stringify(snapshot.listeners)!==JSON.stringify(baseline.listeners))differences.push('listeners');
  return differences;
}

/** Node-side only: a deadline aborts the owned browser instead of leaving a
 * pending page evaluation or native close running after a failed measurement. */
export async function withinLifecycleDeadline(operation,{deadlineMs,forcedCloseDeadlineMs,label,stop}) {
  let timer,expired=false;
  try{
    return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('Lifecycle deadline: '+label));},deadlineMs);})]);
  }catch(error){
    if(expired){
      let closeTimer;
      try{await Promise.race([Promise.resolve().then(stop),new Promise((_,reject)=>{closeTimer=setTimeout(()=>reject(new Error('Owned browser force-close deadline')),forcedCloseDeadlineMs);})]);}
      catch(cleanup){throw new AggregateError([error,cleanup],'Lifecycle deadline and browser cancellation failure');}
      finally{clearTimeout(closeTimer);}
    }
    throw error;
  }finally{clearTimeout(timer);}
}
