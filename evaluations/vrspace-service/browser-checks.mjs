import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { startFrontend, root, f05Root, serviceOrigin, websocketURL } from './frontend.mjs';
import { finalizeBrowserRun } from './finalize-run.mjs';

const playwrightPackage = JSON.parse(await readFile(resolve(root, 'node_modules/playwright/package.json'), 'utf8'));
assert.equal(playwrightPackage.version, '1.62.1', 'Test browser API must match the recorded pinned version');
await mkdir(resolve(root,'artifacts/browser-runs'),{recursive:true});
const output = await mkdtemp(resolve(root,'artifacts/browser-runs/run-'));
const realm = 'F03_' + new Date().toISOString().replace(/[^0-9]/g,'') + '_' + output.split('-').at(-1);
const checks=[],frames=[],logs=[],requests=[],observed={};
let frontend,browser,pages=[];
const startedAt=new Date().toISOString();
const capture=page=>page.evaluate(()=>serviceProbe.capture());
const waitFor=async(page,fn,arg,timeout=12000)=>page.waitForFunction(fn,arg,{timeout});
async function check(id,fn) {
  try { const detail=await fn();checks.push({id,status:'passed',method:'two-real-browser-pages-and-release-server',detail});console.log('PASS '+id); }
  catch(error) { checks.push({id,status:'failed',detail:error.stack});console.log('FAIL '+id+': '+error.message);throw error; }
}
async function moveAndObserve(sender,receiver,key='KeyW') {
  const before=await capture(sender),senderId=before.me.id;
  const remoteBefore=(await capture(receiver)).peers.find(p=>p.id===senderId);
  assert(remoteBefore,'Remote user must exist before movement');
  await sender.locator('#scene').focus();await sender.keyboard.down(key);await sender.waitForTimeout(650);await sender.keyboard.up(key);
  await sender.evaluate(()=>serviceProbe.sendPose(true));
  const after=await capture(sender);
  assert(Math.hypot(...after.localEye.map((x,i)=>x-before.localEye[i]))>.2,'Keyboard input must move the actual local player');
  await waitFor(receiver,({id,position})=>{const p=serviceProbe.capture().peers.find(p=>p.id===id);return p&&p.updates>1&&Math.hypot(...p.renderedPosition.map((n,i)=>n-position[i]))<.03;},{id:senderId,position:after.localEye});
  const remoteAfter=(await capture(receiver)).peers.find(p=>p.id===senderId);
  assert(remoteAfter.visible);assert(remoteAfter.updates>remoteBefore.updates);
  return {sender:before.participant,senderId,before:before.localEye,after:after.localEye,remoteBefore,remoteAfter};
}
try {
  frontend=await startFrontend();
  observed.serverRun=JSON.parse(await readFile(resolve(root,'artifacts/current-server.json'),'utf8'));
  observed.health={status:null,body:null};
  let health;
  const healthDeadline=Date.now()+30000;
  while(Date.now()<healthDeadline) {
    try { health=await fetch(serviceOrigin+'/actuator/health');if(health.status===200)break; }
    catch { /* Only this task's already-started loopback server is polled. */ }
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!health)throw new Error('The task-owned release server did not open its health endpoint');
  observed.health={status:health.status,body:await health.json()};
  console.log('Release health HTTP '+health.status);
  const env={PATH:process.env.PATH||'/usr/bin:/bin',TMPDIR:resolve(root,'artifacts/tmp'),TMP:resolve(root,'artifacts/tmp'),TEMP:resolve(root,'artifacts/tmp'),LANG:'C.UTF-8',LC_ALL:'C.UTF-8',TZ:'UTC'};
  await mkdir(env.TMPDIR,{recursive:true});
  const flags=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=document-user-activation-required','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE,args:flags,env});
  observed.environment={browser:await browser.version(),playwright:playwrightPackage.version,flags,viewport:{width:1280,height:800,dpr:1},hardwareScaling:2,physicalGPU:false,physicalHeadset:false,physicalAudio:false,profileIsolation:'two separate BrowserContexts, independent cookie jars',subprocessEnvironment:'Explicit browser allowlist; no HOME/USERPROFILE override and no inherited provider/registry/GitHub variables'};
  for(const participant of ['Alpha','Beta']) {
    const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      const allowed=url.origin===frontend.origin||url.origin===serviceOrigin||['blob:','data:'].includes(url.protocol);
      if(!allowed)requests.push({participant,type:'blocked-external',url:route.request().url()});
      return allowed?route.continue():route.abort('blockedbyclient');
    });
    const page=await context.newPage();page.setDefaultTimeout(15000);
    page.on('console',m=>{if(['error','warning','warn'].includes(m.type()))logs.push({participant,type:m.type(),text:m.text()});});
    page.on('pageerror',e=>logs.push({participant,type:'pageerror',text:e.stack}));
    page.on('requestfailed',r=>requests.push({participant,type:'failed',url:r.url(),failure:r.failure()}));
    page.on('websocket',socket=>{
      frames.push({participant,type:'socket',url:socket.url(),at:Date.now()});
      for(const [name,direction] of [['framesent','sent'],['framereceived','received']])socket.on(name,event=>{
        const payload=typeof event.payload==='string'?event.payload:event.payload.toString('utf8');
        frames.push({participant,direction,url:socket.url(),at:Date.now(),payload});
      });
      socket.on('close',()=>frames.push({participant,type:'close',url:socket.url(),at:Date.now()}));
      socket.on('socketerror',error=>logs.push({participant,type:'socketerror',text:String(error)}));
    });
    pages.push(page);
  }
  await Promise.all(pages.map((page,i)=>page.goto(frontend.origin+'/?participant='+['Alpha','Beta'][i]+'&realm='+realm,{waitUntil:'domcontentloaded',timeout:60000})));
  await Promise.all(pages.map(page=>waitFor(page,()=>window.serviceProbe?.capture().phase==='joined'||document.querySelector('#fatal').textContent||window.serviceProbe?.errors.length,undefined,60000)));
  await check('two-independent-real-service-sessions',async()=>{
    const states=await Promise.all(pages.map(capture));
    for(let i=0;i<pages.length;i++) {
      assert.equal(await pages[i].locator('#fatal').textContent(),'');assert.equal(states[i].phase,'joined');assert.equal(states[i].errors.length,0);assert(states[i].connected);assert.equal(states[i].joinedGeneration,1);
    }
    assert(states[0].me.id!==states[1].me.id);assert.equal(states[0].realm,states[1].realm);
    for(const state of states){assert.equal(state.enterAcknowledgement.requestedRealm,realm);assert.equal(state.enterAcknowledgement.userId,state.me.id);}
    const log=await readFile(resolve(observed.serverRun.runDirectory,'server.log'),'utf8');
    const creation=log.split('\n').find(line=>line.includes('Creating temporary world on demand: '+realm));assert(creation,'Actual server must have created the requested unique world');
    observed.initial=states;return {clients:states.map(s=>({participant:s.participant,me:s.me,realm:s.realm,enterAcknowledgement:s.enterAcknowledgement})),serverWorldCreation:creation,realWebSocketURL:websocketURL,health:observed.health,note:'The released Welcome omits worldId. Enter acknowledgements, actual server world creation, and mutual Add events identify the shared realm.'};
  });
  await check('same-frozen-f03-venue-in-both-canvases',async()=>{
    const states=await Promise.all(pages.map(page=>page.evaluate(()=>({fixture:foundationProbe.world.id,entities:foundationProbe.world.entities.length,meshes:foundationProbe.scene.meshes.length,rightHanded:foundationProbe.scene.useRightHandedSystem,digests:foundationProbe.manifest.sourceFileDigests,renderedFrames:foundationProbe.engine.frameId,renderer:foundationProbe.engine.getGlInfo().renderer,webgl:foundationProbe.engine.webGLVersion}))));
    assert.deepEqual(states[0].digests,states[1].digests);for(const s of states){assert.equal(s.entities,55);assert(s.meshes>=70);assert(s.rightHanded);assert(s.renderedFrames>0);assert.equal(s.webgl,2);}return states;
  });
  await check('mutual-presence-from-server-add-events',async()=>{
    await Promise.all(pages.map(page=>waitFor(page,()=>serviceProbe.capture().peers.length===1)));
    const states=await Promise.all(pages.map(capture));
    assert.equal(states[0].peers[0].id,states[1].me.id);assert.equal(states[1].peers[0].id,states[0].me.id);return states.map(s=>({participant:s.participant,me:s.me,peers:s.peers}));
  });
  await check('alpha-keyboard-pose-visible-to-beta',()=>moveAndObserve(pages[0],pages[1]));
  await check('beta-keyboard-pose-visible-to-alpha',()=>moveAndObserve(pages[1],pages[0],'KeyA'));
  await check('disconnect-removes-remote-guest',async()=>{
    const before=await capture(pages[1]);await pages[1].locator('#network-leave').click();
    await Promise.all([waitFor(pages[1],()=>serviceProbe.capture().phase==='disconnected'),waitFor(pages[0],()=>serviceProbe.capture().peers.length===0)]);
    const alpha=await capture(pages[0]),beta=await capture(pages[1]);assert.equal(beta.connected,false);assert(alpha.events.some(e=>e.type==='remove'&&e.detail.id===before.me.id));
    observed.firstDisconnectedId=before.me.id;return {disconnectedId:before.me.id,alphaPeers:alpha.peers,betaPhase:beta.phase,receivedRemove:alpha.events.filter(e=>e.type==='remove')};
  });
  await check('same-browser-rejoin-restores-pose-flow',async()=>{
    await pages[1].locator('#network-rejoin').click();await waitFor(pages[1],()=>serviceProbe.capture().joinedGeneration===2,undefined,20000);
    await Promise.all(pages.map(page=>waitFor(page,()=>serviceProbe.capture().peers.length===1)));
    const state=await capture(pages[1]),result=await moveAndObserve(pages[1],pages[0],'KeyD');
    return {oldGuestId:observed.firstDisconnectedId,newGuestId:state.me.id,identityPreserved:observed.firstDisconnectedId===state.me.id,joinedGeneration:state.joinedGeneration,pose:result,note:'Guest identity continuity is observed here, not assumed as a product requirement.'};
  });
  await check('upstream-sdk-automatic-reconnect-after-controlled-close',async()=>{
    const before=await capture(pages[1]);const at=Date.now();
    await pages[1].evaluate(()=>serviceProbe.sdk.ws.close(1000,'evaluation transport cycle'));
    await waitFor(pages[0],()=>serviceProbe.capture().peers.length===0);
    await waitFor(pages[1],()=>serviceProbe.capture().joinedGeneration===3,undefined,25000);
    await Promise.all(pages.map(page=>waitFor(page,()=>serviceProbe.capture().peers.length===1)));
    const state=await capture(pages[1]);const pose=await moveAndObserve(pages[0],pages[1],'KeyD');
    return {elapsedMs:Date.now()-at,beforeId:before.me.id,afterId:state.me.id,identityPreserved:before.me.id===state.me.id,transportGeneration:state.transportGeneration,joinedGeneration:state.joinedGeneration,pose,note:'Unmodified SDK retry timer reconnects a deliberately closed native WebSocket; no WAN outage, server restart, or packet-loss claim.'};
  });
  await check('wire-evidence-and-no-browser-errors',async()=>{
    const relayStatuses=[];
    for(const path of ['/%2fexample.invalid/probe','/server.properties','/vendor/vrspace/../../server-run.py']) {
      const response=await fetch(frontend.origin+path);assert.equal(response.status,404);relayStatuses.push({path,status:response.status});
    }
    const onlyServiceSockets=frames.filter(f=>f.type==='socket').every(f=>f.url===websocketURL);assert(onlyServiceSockets);
    const detail=['Alpha','Beta'].map(participant=>{
      const parsed=frames.filter(f=>f.participant===participant&&f.payload).map(f=>({...f,body:JSON.parse(f.payload)}));
      const counts={participant,sent:parsed.filter(f=>f.direction==='sent').length,received:parsed.filter(f=>f.direction==='received').length,welcomes:parsed.filter(f=>f.direction==='received'&&f.body.Welcome).length,enters:parsed.filter(f=>f.direction==='sent'&&f.body.command?.Enter).length,sessions:parsed.filter(f=>f.direction==='sent'&&f.body.command?.Session).length,receivedAdds:parsed.filter(f=>f.direction==='received'&&f.body.Add).length,receivedPoses:parsed.filter(f=>f.direction==='received'&&f.body.object&&f.body.changes?.position).length,receivedRemoves:parsed.filter(f=>f.direction==='received'&&f.body.Remove).length};
      assert(counts.welcomes>0&&counts.enters>0&&counts.sessions>0&&counts.receivedAdds>0&&counts.receivedPoses>0);return counts;
    });
    const state=await Promise.all(pages.map(capture));assert(state.every(s=>s.errors.length===0));assert.equal(logs.filter(l=>['error','pageerror','socketerror'].includes(l.type)).length,0);assert.equal(requests.length,0);
    return {wireCounts:detail,onlyServiceSockets,errors:state.map(s=>s.errors),failedOrBlockedRequests:requests,relayUnknownResourceChecks:relayStatuses};
  });
  for(let i=0;i<pages.length;i++) {
    await pages[i].evaluate(()=>{const remote=[...serviceProbe.peers.values()][0];if(remote)foundationProbe.camera.setTarget(remote.root.position);});
    await pages[i].waitForTimeout(200);await pages[i].screenshot({path:resolve(output,['alpha','beta'][i]+'-courtyard.png')});
  }
} catch(error) {
  observed.fatal=error.stack;
  for(let i=0;i<pages.length;i++) {
    observed['failure-'+i]=await capture(pages[i]).catch(e=>({captureError:e.message}));
    await pages[i].screenshot({path:resolve(output,'failure-'+i+'.png')}).catch(()=>{});
  }
  process.exitCode=1;console.error(error.message);
} finally {
  await finalizeBrowserRun({
    checks, observed, logs, requests,
    dispose: pages.map((page, index) => ({ resource: 'page-' + index + '-dispose', close: async () => {
      const state = await page.evaluate(() => {
        const probe = window.serviceProbe;
        if (!probe) return null;
        const state = probe.capture();
        probe.dispose();
        return state;
      });
      observed.final ||= [];
      observed.final[index] = state;
    } })),
    resources: [
      { resource: 'browser', close: () => browser?.close() },
      { resource: 'frontend', close: () => frontend?.close() },
    ],
    prepareReport: async () => {
      const sourceFiles=JSON.parse(await readFile(resolve(root,'source-files.json'),'utf8'));
      const sourceDigests={};for(const path of sourceFiles)sourceDigests[path]=createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
      return {scope:'Actual released VRSpace service presence/pose evaluation against frozen F03 rendering; partial F05 evidence only',qualificationStatus:'incomplete',startedAt,finishedAt:new Date().toISOString(),realm,sourcePins:frontend?.pins,sourceDigests,fixtureDigests:frontend?.manifest.sourceFileDigests,baseBuild:frontend?.build,ports:frontend?{frontend:frontend.origin,fixtureBackend:frontend.baseOrigin,vrspace:serviceOrigin,websocket:websocketURL}:null,frames,missingEvidence:['F05 AssetLoader master server is a different unbuilt pin; this run qualifies only v0.8.7 server/client behavior demonstrated.','No physical headset/controller tracking, actual headphones/spatial voice, SFU, or screen-share service.','No authoritative multiuser physics, shared editing/ownership, reconnect persistence across server restart, WAN failure, or production authentication/security acceptance.','No conference capacity, load, latency SLO, mobile/standalone headset, or GPU performance result.']};
    },
    writeReport: async result => {
      await writeFile(resolve(output,'browser-checks.json'),JSON.stringify(result,null,2)+'\n');
      await writeFile(resolve(root,'artifacts/latest-browser-run.json'),JSON.stringify({directory:output,runStatus:result.runStatus,counts:result.counts},null,2)+'\n');
      console.log(JSON.stringify({runStatus:result.runStatus,counts:result.counts,output:relative(root,output)},null,2));
    },
  });
}
