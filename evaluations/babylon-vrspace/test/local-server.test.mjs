import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { request } from 'node:http';
import { runInNewContext } from 'node:vm';
import { fixtureRoot, packageRoot, artifactRoot } from '../config.mjs';
import { loadFixtureSet, sha256, verifyVendor } from '../fixtures.mjs';
import { isolatedEnvironment } from '../environment.mjs';
import { startEvaluationServer } from '../server.mjs';
import { acceptMeterWindow } from '../src/spatial-audio.js';
import RAPIER from '@dimforge/rapier3d-compat';

test('teleport propagation keeps controller queries at a valid nonpenetrating pose',async()=>{
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  try {
    world.createCollider(RAPIER.ColliderDesc.cuboid(12,.1,12),world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-.1,0)));
    const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(4,5,8));
    const collider=world.createCollider(RAPIER.ColliderDesc.capsule(.55,.35),body),controller=world.createCharacterController(.015);
    controller.enableAutostep(.3,.2,true);controller.enableSnapToGround(.2);world.step();
    const pose={x:0,y:.95,z:0};body.setTranslation(pose,true);body.setNextKinematicTranslation(pose);
    assert.equal(collider.translation().y,5,'Negative control: collider still has its previous pose');
    world.propagateModifiedBodyPositionsToColliders();assert(Math.abs(collider.translation().y-.95)<.000001);
    for(let i=0;i<120;i++){
      controller.computeColliderMovement(collider,{x:0,y:-.12,z:0});const delta=controller.computedMovement(),position=body.translation();
      body.setNextKinematicTranslation({x:position.x+delta.x,y:position.y+delta.y,z:position.z+delta.z});world.step();
      assert(body.translation().y>.914,'The valid capsule remains above the floor');
    }
    const final=body.translation();assert(Math.hypot(final.x,final.z)<.001);
  } finally {world.free();}
});

const meterSource=await readFile(new URL('../src/audio-meter.js',import.meta.url),'utf8');
function meterFixture() {
  const messages=[];let Processor;
  const clock={sampleRate:48000,currentFrame:0,AudioWorkletProcessor:class{constructor(){this.port={postMessage:value=>messages.push(structuredClone(value)),onmessage:null};}},registerProcessor:(name,value)=>{assert.equal(name,'bve-paired-audio-meter');Processor=value;}};
  runInNewContext(meterSource,clock,{timeout:1000});
  const processor=new Processor();
  return {processor,messages,block(before,after){const running=processor.process([before,after]);clock.currentFrame+=before[0]?.length||after[0]?.length||128;return running;}};
}
const channel=value=>new Float32Array(128).fill(value);
test('paired worklet measures actual same-block gain and reports per-sample extrema',()=>{
  const meter=meterFixture();
  for(let i=0;i<7;i++)meter.block([channel(.5)],[channel(.125)]);
  assert.equal(meter.messages.length,1);const window=meter.messages[0];
  assert.equal(window.frames,896);assert.equal(window.startFrame,0);assert.equal(window.endFrame,896);assert.equal(window.invalidFrames,0);
  assert.equal(window.postGainRms/window.inputRms,.25);assert.equal(window.gainMin,.25);assert.equal(window.gainMax,.25);assert.equal(window.gainSamples,896);
  // A wrong supplied gain is measured as wrong; no expected gain is supplied to the meter.
  meter.processor.port.onmessage({data:{type:'ack'}});
  for(let i=0;i<7;i++)meter.block([channel(.5)],[channel(.375)]);
  assert.equal(meter.messages[1].postGainRms/meter.messages[1].inputRms,.75);
});
test('paired worklet marks mismatched channels and non-finite samples invalid',()=>{
  for(const kind of ['channel-count','channel-size','non-finite']){
    const meter=meterFixture();
    for(let i=0;i<7;i++)meter.block([channel(.5)],kind==='channel-count'?[channel(.25),channel(.25)]:kind==='channel-size'?[new Float32Array(2)]:[channel(NaN)]);
    assert(meter.messages[0].invalidFrames>0,kind);
  }
});
test('paired worklet stops processing after its disposal message',()=>{
  const meter=meterFixture();meter.processor.port.onmessage({data:{type:'dispose'}});
  assert.equal(meter.block([channel(.5)],[channel(.25)]),false);assert.equal(meter.messages.length,0);
});
test('paired worklet bounds both the unacknowledged port and pending window queue',()=>{
  const meter=meterFixture();for(let i=0;i<7*200;i++)meter.block([channel(.5)],[channel(.125)]);
  assert.equal(meter.messages.length,1);assert.equal(meter.processor.pending.length,128);assert.equal(meter.processor.awaitingAck,true);assert.equal(meter.processor.droppedWindows,71);
  meter.processor.port.onmessage({data:{type:'ack'}});assert.equal(meter.messages.length,2);assert.equal(meter.processor.pending.length,127);assert.equal(meter.messages[1].droppedWindows,71);
  meter.processor.port.onmessage({data:{type:'dispose'}});assert.equal(meter.processor.pending.length,0);
});
function validWindow() {return {type:'paired-audio-window',startFrame:0,endFrame:896,frames:896,sampleRate:48000,inputChannels:1,postChannels:1,invalidFrames:0,inputRms:.5,postGainRms:.125,gainMin:.25,gainMax:.25,gainSamples:896,droppedWindows:0};}
test('paired window receiver rejects malformed channel, timing and numeric envelopes',()=>{
  for(const mutate of [value=>{value.inputChannels=0;},value=>{value.postChannels=2;},value=>{value.endFrame++;},value=>{value.startFrame=-1;},value=>{value.inputRms=NaN;},value=>{value.postGainRms=Infinity;},value=>{value.gainSamples=897;},value=>{value.invalidFrames=897;},value=>{value.droppedWindows=1001;},value=>{value.gainMin=1;},value=>{value.sampleRate=44100;},value=>{value.extra=new Array(1000);}]){
    const state={history:[],invalidMessages:0},value=validWindow();mutate(value);assert.equal(acceptMeterWindow(state,value,48000),false);assert.equal(state.history.length,0);assert.equal(state.invalidMessages,1);
  }
});
test('paired window receiver bounds retained history and rejects replayed ranges',()=>{
  const state={history:[],invalidMessages:0};
  for(let i=0;i<140;i++){const value=validWindow();value.startFrame=i*896;value.endFrame=(i+1)*896;assert.equal(acceptMeterWindow(state,value,48000),true);}
  assert.equal(state.history.length,128);assert.equal(state.history[0].startFrame,12*896);
  assert.equal(acceptMeterWindow(state,validWindow(),48000),false);
  for(let i=0;i<1100;i++)acceptMeterWindow(state,null,48000);
  assert.equal(state.invalidMessages,1000);assert.equal(state.history.length,128);
});

test('loopback server exposes only verified evaluation assets and supports media ranges', async () => {
  const server = await startEvaluationServer();
  try {
    const index = await fetch(server.origin + '/');
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    const manifest = await (await fetch(server.origin + '/fixtures/evaluation.json')).json();
    assert.equal(manifest.world.entities.length, 55);
    assert.equal(manifest.comparison.fixtureSetId, 'bve-foundation-0.1.0');
    const prop = await fetch(server.origin + '/fixtures/models/prop.gltf');
    assert.equal(sha256(Buffer.from(await prop.arrayBuffer())), manifest.catalog.resources.find(resource => resource.path === 'models/prop.gltf').sha256);
    const range = await fetch(server.origin + '/fixtures/media/screen-marker.webm', { headers: { Range: 'bytes=0-15' } });
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 16);
    assert.match(range.headers.get('content-range'), /^bytes 0-15\//);
    const head = await fetch(server.origin + '/fixtures/media/screen-marker.webm', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    for (const path of ['/package.json', '/node_modules/playwright/package.json', '/src/main.js', '/artifacts/tool-home/.npmrc', '/fixtures/../../package.json', '/%2e%2e/package.json']) {
      assert.equal((await fetch(server.origin + path)).status, 404, path);
    }
    assert.equal((await fetch(server.origin + '/', { method: 'POST', body: 'ignored' })).status, 405);
    assert.equal((await fetch(server.origin + '/', { headers: { Origin: 'https://unrelated.invalid' } })).status, 403);
    const badHost = await new Promise((accept, reject) => {
      const req = request(server.origin, { headers: { Host: 'unrelated.invalid' } }, response => { response.resume(); response.on('end', () => accept(response.statusCode)); });
      req.on('error', reject); req.end();
    });
    assert.equal(badHost, 403);
    assert.equal((await fetch(server.origin + '/fixtures/media/screen-marker.webm', { headers: { Range: 'bytes=999999999999999999999-' } })).status, 416);
  } finally { await server.close(); }
});

test('changed fixture bytes and fixture symlinks outside their package fail before serving', async () => {
  const temp = await mkdtemp(join(artifactRoot, 'fixture-negative-'));
  const copy = join(temp, 'fixtures');
  try {
    await cp(fixtureRoot, copy, { recursive: true, dereference: true });
    const prop = join(copy, 'models/prop.gltf');
    const original = await readFile(prop);
    await writeFile(prop, Buffer.concat([original, Buffer.from(' ')]));
    await assert.rejects(loadFixtureSet(copy), /Frozen F03 resource mismatch/);
    await writeFile(join(temp, 'outside.gltf'), original);
    await rm(prop);
    await symlink(join(temp, 'outside.gltf'), prop);
    await assert.rejects(loadFixtureSet(copy), /Fixture symlink escapes/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('stale build evidence prevents a browser from testing a different bundle', async () => {
  const file = join(packageRoot, 'dist/build.json');
  const original = await readFile(file);
  try {
    for(const output of ['dist/main.js','dist/audio-meter.js']){
      const changed = JSON.parse(original);
      changed.outputs[output].sha256 = '0'.repeat(64);
      await writeFile(file, JSON.stringify(changed));
      await assert.rejects(startEvaluationServer(), /Evaluation build is stale/);
    }
  } finally { await writeFile(file, original); }
});

test('credential-free launcher does not read or forward unrelated environment entries', async () => {
  const source = { PATH: '/synthetic/bin', CHROME_EXECUTABLE: '/synthetic/chrome', NODE_OPTIONS: '--synthetic-unsafe', npm_config_registry: 'https://unrelated.invalid', HOME:'/synthetic/home',USERPROFILE:'/synthetic/profile' };
  Object.defineProperty(source, 'PROVIDER_SECRET', { enumerable: true, get() { throw new Error('Unrelated secret getter was read'); } });
  const env = await isolatedEnvironment(source);
  assert.equal(env.PATH, source.PATH);
  assert.equal(env.CHROME_EXECUTABLE, source.CHROME_EXECUTABLE);
  assert.equal(Object.hasOwn(env, 'PROVIDER_SECRET'), false);
  assert.equal(Object.hasOwn(env, 'NODE_OPTIONS'), false);
  assert.equal(Object.hasOwn(env, 'npm_config_registry'), false);
  assert.equal(Object.hasOwn(env,'HOME'), false);
  assert.equal(Object.hasOwn(env,'USERPROFILE'), false);
  assert.equal(env.npm_config_userconfig.startsWith(artifactRoot), true);
  assert.equal(await readFile(env.npm_config_userconfig,'utf8'),'');
  assert.equal(await readFile(env.npm_config_globalconfig,'utf8'),'');
  assert.equal(env.PLAYWRIGHT_BROWSERS_PATH.startsWith(artifactRoot), true);
});

test('vendored VRSpace module retains the pinned upstream source identity', async () => {
  assert.equal(sha256(await verifyVendor()), '1afa505b193dac8f60ee54ea7ccdfd60e9a0620cf561fa393aa570055d23fa06');
});
