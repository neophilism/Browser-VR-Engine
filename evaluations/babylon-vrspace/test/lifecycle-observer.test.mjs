import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installLifecycleObserver,emptySnapshotDifferences,withinLifecycleDeadline} from './lifecycle-observer.mjs';

const profile=JSON.parse(await readFile(new URL('./lifecycle-profile.json',import.meta.url),'utf8'));
const options={...profile.observer,cycles:profile.cycles,phases:profile.eventPhases};
function environment(overrides={}) {
  let identity=0;
  const callbacks=new Map(),urls=new Set();
  class Context {constructor(){this.state='suspended';this.rejectClose=false;}close(){if(this.rejectClose)return Promise.reject(new Error('native close failure'));this.state='closed';return Promise.resolve();}}
  class Port {close(){if(this.rejectClose)throw new Error('native port failure');this.closed=true;}}
  class Worklet {constructor(context){this.context=context;this.port=new Port();}}
  class GL {createBuffer(){return {buffer:true};}deleteBuffer(handle){if(handle?.reject)throw new Error('native GL failure');}createTexture(){return {texture:true};}deleteTexture(){}}
  const register=(callback,args,repeat=false)=>{const id=++identity;callbacks.set(id,{callback,args,repeat});return id;};
  const root={crypto:{randomUUID:()=> 'test-document'},AudioContext:Context,AudioWorkletNode:Worklet,MessagePort:Port,WebGL2RenderingContext:GL,
    URL:{createObjectURL(){const id='blob:test/'+(++identity);urls.add(id);return id;},revokeObjectURL(id){urls.delete(id);}},
    setTimeout(callback,delay,...args){return register(callback,args);},clearTimeout(id){callbacks.delete(id);},
    setInterval(callback,delay,...args){return register(callback,args,true);},clearInterval(id){callbacks.delete(id);},
    requestAnimationFrame(callback){if(typeof callback!=='function')throw new TypeError('Native RAF requires function');return register(callback,[123.5]);},cancelAnimationFrame(id){callbacks.delete(id);},
  };
  const observer=installLifecycleObserver({...options,...overrides},root);
  const fire=id=>{const event=callbacks.get(id);if(!event)return;if(!event.repeat)callbacks.delete(id);return event.callback.apply(root,event.args);};
  return {root,observer,fire,callbacks,urls};
}
function emptySnapshot(){return {runtime:{instanceId:null,state:'empty',counters:Object.fromEntries(profile.runtimeCounters.map(key=>[key,0])),scene:Object.fromEntries(profile.sceneCounters.map(key=>[key,0])),host:{phase:'empty',pendingHostTask:false,failedOwner:false,publishedInstance:false,publishedAdapter:false,foundationReady:false}},native:{counters:Object.fromEntries(profile.nativeCounters.map(key=>[key,0])),overflow:0,faults:[]},listeners:{window:{available:true,counts:{}}},dom:{videoElements:0},cdp:{audioContexts:[]}};}

test('native URLs are observed independently of any candidate asset map and release exactly once',()=>{
  const {root,observer}=environment();observer.mark(0,'negative-allocated');const url=root.URL.createObjectURL({});
  assert.equal(observer.snapshot().counters.objectUrls,1);root.URL.revokeObjectURL(url);root.URL.revokeObjectURL(url);
  assert.equal(observer.snapshot().counters.objectUrls,0);assert.deepEqual(observer.journal().events.map(event=>event.action),['allocate','release']);
});
test('one-shot timer wrapping preserves receiver, arguments and return while releasing before callback',()=>{
  const {root,observer,fire}=environment();const id=root.setTimeout(function(a,b){assert.equal(this,root);assert.equal(observer.snapshot().counters.timeouts,0);return a+b;},5,2,4);
  assert.equal(observer.snapshot().counters.timeouts,1);assert.equal(fire(id),6);assert.equal(observer.snapshot().counters.timeouts,0);
});
test('interval callbacks remain live and browser-interchangeable clearTimeout releases them',()=>{
  const {root,observer,fire}=environment();let ticks=0;const id=root.setInterval(()=>++ticks,5);fire(id);fire(id);
  assert.equal(ticks,2);assert.equal(observer.snapshot().counters.intervals,1);assert.equal(observer.journal().events.length,1);
  root.clearTimeout(id);assert.equal(observer.snapshot().counters.intervals,0);assert.equal(observer.journal().events.at(-1).action,'clear');
});
test('clearInterval also clears a timeout, and no removed callback executes',()=>{
  const {root,observer,fire}=environment();let called=false;const id=root.setTimeout(()=>{called=true;},5);root.clearInterval(id);fire(id);
  assert.equal(called,false);assert.equal(observer.snapshot().counters.timeouts,0);
});
test('animation-frame callback preserves timestamp and cancellation releases the remaining request',()=>{
  const {root,observer,fire}=environment();let at=null;const first=root.requestAnimationFrame(value=>{at=value;}),second=root.requestAnimationFrame(()=>assert.fail('cancelled callback'));
  fire(first);root.cancelAnimationFrame(second);fire(second);assert.equal(at,123.5);assert.equal(observer.snapshot().counters.animationFrames,0);
});
test('invalid RAF callback preserves the native synchronous rejection',()=>{
  const {root,observer}=environment();assert.throws(()=>root.requestAnimationFrame(null),/Native RAF/);assert.equal(observer.snapshot().counters.animationFrames,0);
});
test('native GL allocations are weakly identified and release only after successful native deletion',()=>{
  const {root,observer}=environment(),gl=new root.WebGL2RenderingContext(),buffer=gl.createBuffer(),texture=gl.createTexture();
  assert.equal(observer.snapshot().counters.glBuffers,1);assert.equal(observer.snapshot().counters.glTextures,1);buffer.reject=true;
  assert.throws(()=>gl.deleteBuffer(buffer),/native GL failure/);assert.equal(observer.snapshot().counters.glBuffers,1);
  buffer.reject=false;gl.deleteBuffer(buffer);gl.deleteBuffer(buffer);gl.deleteTexture(texture);assert.equal(observer.snapshot().counters.glBuffers,0);assert.equal(observer.snapshot().counters.glTextures,0);
  assert.equal(observer.journal().events.filter(event=>event.category==='glBuffers'&&event.action==='release').length,1);
});
test('native AudioContext close failure stays live and successful retry is the only release',async()=>{
  const {root,observer}=environment();const context=new root.AudioContext();context.rejectClose=true;
  await assert.rejects(context.close(),/native close failure/);assert.equal(observer.snapshot().counters.audioContexts,1);
  context.rejectClose=false;await context.close();await context.close();assert.equal(observer.snapshot().counters.audioContexts,0);
  assert.equal(observer.journal().events.filter(event=>event.category==='audioContexts'&&event.action==='close').length,1);
});
test('worklet port identity is associated with its context and failed native close remains visible',async()=>{
  const {root,observer}=environment();const context=new root.AudioContext(),node=new root.AudioWorkletNode(context);node.port.rejectClose=true;
  assert.throws(()=>node.port.close(),/native port failure/);assert.equal(observer.snapshot().counters.workletPorts,1);
  node.port.rejectClose=false;node.port.close();await context.close();assert.equal(observer.snapshot().counters.workletPorts,0);
  const allocations=observer.journal().events.filter(event=>event.action==='allocate');assert.equal(allocations[1].contextId,allocations[0].id);
});
test('observer has bounded plain event history, independent snapshots and fatal overflow',()=>{
  const {root,observer}=environment({maximumEvents:2});const a=root.URL.createObjectURL({});root.URL.revokeObjectURL(a);root.URL.createObjectURL({});
  const record=observer.journal();assert.equal(record.events.length,2);assert(record.overflow>0);record.events[0].id='changed';assert.notEqual(observer.journal().events[0].id,'changed');
  const snapshot=observer.snapshot();snapshot.live.objectUrls.length=0;assert.equal(observer.snapshot().live.objectUrls.length,1);assert.doesNotThrow(()=>JSON.stringify(record));
});
test('live table limits and unobservable string callbacks fail closed without changing native timer scheduling',()=>{
  const {root,observer,callbacks}=environment({maximumLiveEntries:1});root.URL.createObjectURL({});root.URL.createObjectURL({});root.setTimeout('void 0',5);
  assert.equal(observer.snapshot().counters.objectUrls,1);assert.equal(callbacks.size,1);assert.equal(observer.snapshot().faults.length,2);
});
test('phase identity is fixed to the frozen cycle and phase protocol',()=>{
  const {root,observer}=environment();assert.throws(()=>observer.mark(11,'loaded'),/Invalid lifecycle/);assert.throws(()=>observer.mark(1,'ignored'),/Invalid lifecycle/);
  observer.mark(10,'final');root.URL.createObjectURL({});assert.equal(observer.journal().events[0].cycle,10);assert.equal(observer.journal().events[0].phase,'final');
});
test('empty comparison rejects native allocation with entirely empty runtime maps and accepts its release',()=>{
  const before=emptySnapshot(),allocated=structuredClone(before);allocated.native.counters.objectUrls=1;
  assert.deepEqual(emptySnapshotDifferences(before,before,profile),[]);assert.deepEqual(emptySnapshotDifferences(allocated,before,profile),['native.objectUrls']);
  allocated.native.counters.objectUrls=0;assert.deepEqual(emptySnapshotDifferences(allocated,before,profile),[]);
});
test('empty comparison catches retained ownership, native ports, scene members, listeners and omitted counters',()=>{
  const baseline=emptySnapshot(),bad=structuredClone(baseline);bad.runtime.host.failedOwner=true;bad.runtime.scene.meshes=1;bad.native.counters.workletPorts=1;bad.listeners.window.counts.click=1;delete bad.runtime.counters.engines;
  const differences=emptySnapshotDifferences(bad,baseline,profile);for(const expected of ['counter-schema','runtime.scene.meshes','native.workletPorts','host.failedOwner','listeners'])assert(differences.includes(expected));
});
test('stalled native observation stops its browser before reporting the bounded failure',async()=>{
  let stopped=false;
  await assert.rejects(withinLifecycleDeadline(()=>new Promise(()=>{}),{deadlineMs:5,forcedCloseDeadlineMs:20,label:'held native close',stop:async()=>{stopped=true;}}),/Lifecycle deadline: held native close/);
  assert.equal(stopped,true);
});
test('observation cancellation itself is bounded and a successful observation does not stop the browser',async()=>{
  await assert.rejects(withinLifecycleDeadline(()=>new Promise(()=>{}),{deadlineMs:5,forcedCloseDeadlineMs:5,label:'held process',stop:()=>new Promise(()=>{})}),/browser cancellation failure/);
  let stopped=false;assert.equal(await withinLifecycleDeadline(()=>42,{deadlineMs:20,forcedCloseDeadlineMs:20,label:'complete',stop:()=>{stopped=true;}}),42);assert.equal(stopped,false);
});
