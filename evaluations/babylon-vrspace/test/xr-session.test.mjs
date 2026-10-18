import test from 'node:test';
import assert from 'node:assert/strict';
import { Observable } from '@babylonjs/core/Misc/observable.js';
import { XRReferenceSpace, GlobalSpace, P_SPACE } from 'iwer';
import { XRSessionController, requireNativeFloorAndConfirmedEnd, xrMovementAxes } from '../src/xr-session.js';
import { finalizeBrowserRun } from './browser-finalize.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; }); return {promise,resolve,reject}; };
const denied = () => new DOMException('Synthetic permission denial', 'NotAllowedError');
class Session extends EventTarget {
  constructor() { super(); this.visibilityState='visible'; this.inputSources=[]; this.endCalls=0; this.ended=false; }
  async end() { this.endCalls++; if(this.endFailure)throw this.endFailure; if(!this.ended){this.ended=true;this.dispatchEvent(new Event('end'));} }
  changeVisibility(value) { this.visibilityState=value; this.dispatchEvent(new Event('visibilitychange')); }
}

function fixture({request=async()=>new Session(), hooks={}}={}) {
  const counts={requests:0,renderStarts:0,helperDisposed:0,targetDisposed:0,ended:0,selected:0};
  const manager={session:null,inXRSession:false,onXRSessionInit:new Observable(),onXRSessionEnded:new Observable(),onXRFrameObservable:new Observable(),onXRReferenceSpaceInitialized:new Observable()};
  requireNativeFloorAndConfirmedEnd(manager);
  const helper={sessionManager:manager,onInitialXRPoseSetObservable:new Observable(),
    async enterXRAsync(mode,space,_target,options){
      assert.equal(mode,'immersive-vr');assert.equal(space,'local-floor');assert.deepEqual(options.requiredFeatures,['local-floor']);
      counts.requests++;const session=await request();manager.session=session;manager.inXRSession=true;
      session.addEventListener('end',()=>{manager.inXRSession=false;manager.onXRSessionEnded.notifyObservers(null);},{once:true});
      try {manager.onXRSessionInit.notifyObservers(session);counts.renderStarts++;return manager;}
      catch(error){await manager.exitXRAsync();throw error;}
    },dispose(){counts.helperDisposed++;manager.onXRFrameObservable.clear();manager.onXRSessionInit.clear();},
  };
  const target={dispose(){counts.targetDisposed++;}};
  const platform={xr:{isSessionSupported:async()=>true},userActivation:{isActive:true}};
  const controller=new XRSessionController({secure:true,platform,createExperience:async()=>({helper,renderTarget:target}),hooks:{ended:()=>counts.ended++,select:()=>counts.selected++,...hooks}});
  return {controller,helper,manager,platform,counts,frame(value={}){manager.onXRFrameObservable.notifyObservers(value);}};
}

test('XR preparation queries support without requesting a session and recovers after unsupported state',async()=>{
  const f=fixture();f.controller.secure=false;
  assert.equal(await f.controller.prepare(),false);assert.equal(f.controller.phase,'unavailable');assert.equal(f.controller.busy,false);
  f.controller.secure=true;f.platform.xr.isSessionSupported=async()=>false;
  assert.equal(await f.controller.prepare(),false);assert.equal(f.controller.busy,false);
  f.platform.xr.isSessionSupported=async()=>true;
  assert.equal(await f.controller.prepare(),true);assert.equal(f.counts.requests,0);assert.equal(f.controller.phase,'ready');
  await f.controller.dispose();
});
test('XR synchronous support and factory failures release pending tasks for retry',async()=>{
  const f=fixture();f.platform.xr.isSessionSupported=()=>{throw denied();};
  assert.equal(await f.controller.prepare(),false);assert.equal(f.controller.busy,false);assert.equal(f.controller.error.code,'NotAllowedError');
  f.platform.xr.isSessionSupported=async()=>true;const create=f.controller.createExperience;
  f.controller.createExperience=()=>{throw Error('Synthetic initialization failure');};
  assert.equal(await f.controller.prepare(),false);assert.equal(f.controller.busy,false);
  f.controller.createExperience=create;assert.equal(await f.controller.prepare(),true);await f.controller.dispose();
});
test('XR requires direct activation and two concurrent enters share one native request',async()=>{
  const grant=deferred(),f=fixture({request:()=>grant.promise});await f.controller.prepare();
  f.platform.userActivation.isActive=false;assert.equal(await f.controller.enter(),false);assert.equal(f.counts.requests,0);
  f.platform.userActivation.isActive=true;const first=f.controller.enter(),second=f.controller.enter();assert.equal(first,second);assert.equal(f.counts.requests,1);
  grant.resolve(new Session());assert.equal(await first,true);assert.equal(f.controller.phase,'entering');
  f.frame();assert.equal(f.controller.phase,'immersive');assert.equal(f.controller.frames,1);await f.controller.dispose();
});
test('XR does not call entry complete until a usable tracked frame reaches the application',async()=>{
  const f=fixture({hooks:{frame:frame=>!!frame.pose}});await f.controller.prepare();await f.controller.enter();
  f.frame({pose:false});assert.equal(f.controller.phase,'entering');assert.equal(f.controller.frames,0);
  f.frame({pose:true});assert.equal(f.controller.phase,'immersive');assert.equal(f.controller.frames,1);await f.controller.dispose();
});
test('XR request denial is visible and synchronous entry failures remain retryable',async()=>{
  let reject=true;const f=fixture({request:async()=>{if(reject)throw denied();return new Session();}});await f.controller.prepare();
  assert.equal(await f.controller.enter(),false);assert.equal(f.controller.error.code,'NotAllowedError');assert.equal(f.controller.active,false);assert.equal(f.controller.busy,false);
  f.controller.dismissError();assert.equal(f.controller.error,null);assert.equal(f.controller.phase,'ready');
  const enter=f.helper.enterXRAsync;f.helper.enterXRAsync=()=>{throw Error('Synthetic synchronous entry failure');};
  assert.equal(await f.controller.enter(),false);assert.equal(f.controller.busy,false);
  f.helper.enterXRAsync=enter;reject=false;assert.equal(await f.controller.enter(),true);await f.controller.dispose();
});
test('XR cancelled permission request ends a late grant before rendering starts',async()=>{
  const grant=deferred(),session=new Session(),f=fixture({request:()=>grant.promise});await f.controller.prepare();
  const entered=f.controller.enter(),cancelled=f.controller.cancel();assert.equal(f.controller.phase,'cancelling');assert.equal(f.controller.busy,true);
  grant.resolve(session);assert.equal(await entered,false);assert.equal(await cancelled,true);
  assert.equal(f.counts.renderStarts,0);assert.equal(session.endCalls,1);assert.equal(f.controller.active,false);assert.equal(f.controller.phase,'ready');await f.controller.dispose();
});
test('XR disposal waits for a pending grant, then ends it without starting the renderer',async()=>{
  const grant=deferred(),session=new Session(),f=fixture({request:()=>grant.promise});await f.controller.prepare();
  const entered=f.controller.enter(),disposed=f.controller.dispose();assert.equal(f.counts.helperDisposed,0);
  grant.resolve(session);assert.equal(await entered,false);await disposed;
  assert.equal(f.controller.phase,'disposed');assert.equal(f.counts.renderStarts,0);assert.equal(session.endCalls,1);assert.equal(f.counts.helperDisposed,1);assert.equal(f.counts.targetDisposed,1);
  assert.equal(await f.controller.enter(),false);assert.equal(await f.controller.prepare(),false);
});
test('XR frame errors trigger native end and preserve the visible failure',async()=>{
  const f=fixture({hooks:{frame:()=>{throw Error('Synthetic tracking failure');}}});await f.controller.prepare();await f.controller.enter();
  f.frame();await f.controller.endTask;assert.equal(f.controller.active,false);assert.equal(f.controller.error.code,'XRFailure');assert.equal(f.controller.phase,'error');assert.equal(f.counts.ended,1);await f.controller.dispose();
});
test('XR visibility, selection and native session end are delivered only for the current session',async()=>{
  const visibility=[],f=fixture({hooks:{visibility:value=>visibility.push(value)}});await f.controller.prepare();await f.controller.enter();const session=f.controller.session;
  session.dispatchEvent(new Event('select'));assert.equal(f.counts.selected,0);
  f.frame();session.dispatchEvent(new Event('select'));assert.equal(f.counts.selected,1);
  session.changeVisibility('hidden');session.changeVisibility('visible');assert.deepEqual(visibility,['visible','hidden','visible']);
  await session.end();assert.equal(f.controller.phase,'ready');assert.equal(f.counts.ended,1);assert.equal(f.controller.sessionListeners.length,0);
  session.changeVisibility('hidden');session.dispatchEvent(new Event('select'));assert.equal(f.counts.selected,1);assert.deepEqual(visibility,['visible','hidden','visible']);
  await f.controller.dispose();assert.equal(f.controller.observers.length,0);f.frame();assert.equal(f.controller.frames,1);assert.equal(f.counts.helperDisposed,1);
});
test('XR native end failure retains session and rendering resources until a successful retry',async()=>{
  const f=fixture();await f.controller.prepare();await f.controller.enter();f.frame();const session=f.controller.session;session.endFailure=Error('Synthetic native end failure');
  await assert.rejects(f.controller.exit(),/Synthetic native end failure/);assert.equal(f.controller.active,true);assert.equal(f.controller.busy,false);assert.equal(f.controller.phase,'error');
  await assert.rejects(f.controller.dispose(),/Synthetic native end failure/);assert.equal(f.controller.active,true);assert.equal(f.counts.helperDisposed,0);assert.equal(f.counts.targetDisposed,0);assert.equal(f.controller.disposed,false);assert.equal(f.controller.disposing,false);
  session.endFailure=null;await f.controller.dispose();assert.equal(f.controller.active,false);assert.equal(f.counts.helperDisposed,1);assert.equal(f.counts.targetDisposed,1);assert.equal(session.endCalls,3);
});
test('XR an unconfirmed native end cannot produce successful disposal',async()=>{
  const f=fixture();await f.controller.prepare();await f.controller.enter();const session=f.controller.session,original=session.end.bind(session);session.end=async()=>{};
  await assert.rejects(f.controller.dispose(),/not confirmed/);assert.equal(f.counts.helperDisposed,0);assert.equal(f.controller.active,true);
  session.end=original;await f.controller.dispose();
});
test('XR synchronous native end exception clears the busy task and permits retry',async()=>{
  const f=fixture();await f.controller.prepare();await f.controller.enter();const session=f.controller.session,original=session.end.bind(session);session.end=()=>{throw Error('Synthetic synchronous end error');};
  await assert.rejects(f.controller.exit(),/Synthetic synchronous end error/);assert.equal(f.controller.busy,false);
  session.end=original;assert.equal(await f.controller.exit(),true);await f.controller.dispose();
});
test('XR strict floor adapter never substitutes an estimated viewer height',async()=>{
  const requested=[],session={requestReferenceSpace:async type=>{requested.push(type);if(type==='local-floor')throw new DOMException('Synthetic absent floor','NotSupportedError');return {};}};
  const manager={session,inXRSession:true,onXRReferenceSpaceInitialized:new Observable()};requireNativeFloorAndConfirmedEnd(manager);
  await assert.rejects(manager.setReferenceSpaceTypeAsync('local-floor'),{name:'NotSupportedError'});assert.deepEqual(requested,['local-floor']);assert.equal(manager.referenceSpace,undefined);
  await assert.rejects(manager.setReferenceSpaceTypeAsync('viewer'),/requires local-floor/);
  const floor={},viewer={};session.requestReferenceSpace=async type=>type==='local-floor'?floor:viewer;
  assert.equal(await manager.setReferenceSpaceTypeAsync('local-floor'),floor);assert.equal(manager.baseReferenceSpace,floor);assert.equal(manager.viewerReferenceSpace,viewer);
  session.requestReferenceSpace=async()=>{manager.inXRSession=false;return {};};await assert.rejects(manager.setReferenceSpaceTypeAsync('local-floor'),{name:'AbortError'});
});
test('XR helper failure cleanup uses strict native end instead of suppressing errors',async()=>{
  const session=new Session(),manager={session,inXRSession:true};requireNativeFloorAndConfirmedEnd(manager);
  session.endFailure=Error('Synthetic native refusal');await assert.rejects(manager.exitXRAsync(),/Synthetic native refusal/);assert.equal(manager.inXRSession,true);
  session.endFailure=null;session.addEventListener('end',()=>{manager.inXRSession=false;},{once:true});await manager.exitXRAsync();assert.equal(manager.inXRSession,false);
});
test('XR standard thumbstick motion is bounded, dead-zoned and disabled for hidden or untracked sessions',()=>{
  const input={handedness:'left',gamepad:{mapping:'xr-standard',axes:[0,0,0,-1]}},session={visibilityState:'visible',inputSources:[input]};
  assert.deepEqual(xrMovementAxes(session,true),[0,-1]);assert.deepEqual(xrMovementAxes(session,false),[0,0]);
  for(const value of ['hidden','visible-blurred']){session.visibilityState=value;assert.deepEqual(xrMovementAxes(session,true),[0,0]);}session.visibilityState='visible';
  input.gamepad.axes=[0,0,.1,.1];assert.deepEqual(xrMovementAxes(session,true),[0,0]);input.gamepad.axes=[0,0,1,1];assert(Math.abs(Math.hypot(...xrMovementAxes(session,true))-1)<1e-12);
  for(const axes of [[0,0,NaN,0],[0,0,2,0],[0,0,0]]){input.gamepad.axes=axes;assert.deepEqual(xrMovementAxes(session,true),[0,0]);}
  input.gamepad.axes=[0,0,0,-1];input.gamepad.mapping='';assert.deepEqual(xrMovementAxes(session,true),[0,0]);input.gamepad.mapping='xr-standard';input.handedness='right';assert.deepEqual(xrMovementAxes(session,true),[0,0]);
});
test('pinned IWER offset defect is reproduced and its test-only matrix forwarding preserves the world origin',()=>{
  const base=new XRReferenceSpace('local-floor',new GlobalSpace()),matrix=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,3,0,-7,1]);
  const broken=base.getOffsetReferenceSpace({matrix});assert.equal([...broken[P_SPACE].offsetMatrix].filter(value=>!Number.isFinite(value)).length,16);
  const corrected=base.getOffsetReferenceSpace(matrix);assert.deepEqual([...corrected[P_SPACE].offsetMatrix],[...matrix]);
  assert.equal(corrected[P_SPACE].parentSpace,base);
});
test('browser finalization observes errors emitted while hashing and closing instead of publishing an earlier pass',async()=>{
  const logs=[],failedRequests=[],order=[];
  const result=await finalizeBrowserRun({checks:[{status:'passed'}],expectedChecks:1,
    readSources:async()=>{order.push('hash');await Promise.resolve();logs.push({type:'pageerror',text:'Synthetic late error'});return {source:'synthetic'};},
    closeBrowser:async()=>{order.push('browser');await Promise.resolve();failedRequests.push({url:'https://synthetic.invalid/late'});},
    closeServer:async()=>{order.push('server');},diagnostics:()=>({logs,failedRequests})});
  assert.deepEqual(order,['hash','browser','server']);assert.equal(result.runStatus,'failed');assert.equal(result.counts.pageErrors,1);assert.equal(result.counts.failedRequests,1);
});
test('browser finalization closes the server after browser failure and records both cleanup failures',async()=>{
  const result=await finalizeBrowserRun({checks:[{status:'passed'}],expectedChecks:1,readSources:async()=>({source:'synthetic'}),
    closeBrowser:async()=>{throw Error('Synthetic browser close failure');},closeServer:async()=>{throw Error('Synthetic server close failure');},diagnostics:()=>({logs:[],failedRequests:[]})});
  assert.equal(result.runStatus,'failed');assert.deepEqual(result.finalizationErrors.map(error=>error.stage),['browser-close','server-close']);
});
test('browser fingerprint failure still closes resources and cannot yield passing evidence',async()=>{
  const closed=[];const result=await finalizeBrowserRun({checks:[{status:'passed'}],expectedChecks:1,readSources:async()=>{throw Error('Synthetic missing source');},
    closeBrowser:async()=>closed.push('browser'),closeServer:async()=>closed.push('server'),diagnostics:()=>({logs:[],failedRequests:[]})});
  assert.deepEqual(closed,['browser','server']);assert.equal(result.sourceDigests,null);assert.equal(result.runStatus,'failed');assert.equal(result.finalizationErrors[0].stage,'source-fingerprints');
});
test('browser finalization passes only the exact complete set and rejects diagnostic overflow',async()=>{
  const options={checks:[{status:'passed'}],expectedChecks:1,readSources:async()=>({source:'synthetic'}),closeBrowser:async()=>{},closeServer:async()=>{},diagnostics:()=>({logs:[],failedRequests:[]})};
  assert.equal((await finalizeBrowserRun(options)).runStatus,'passed');
  assert.equal((await finalizeBrowserRun({...options,expectedChecks:2})).runStatus,'failed');
  assert.equal((await finalizeBrowserRun({...options,diagnostics:()=>({logs:[],failedRequests:[],logOverflow:1})})).runStatus,'failed');
});
