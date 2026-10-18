import { VRSpace } from '/vrspace/client.js';

const params = new URLSearchParams(location.search);
const participant = params.get('participant') || 'Alpha';
const realm = params.get('realm') || 'F03_release_evaluation';
if (!['Alpha', 'Beta'].includes(participant) || !/^[A-Za-z0-9_-]{1,80}$/.test(realm)) throw new Error('Invalid evaluation identity');
while (!window.foundationReady && !document.querySelector('#fatal').textContent) await new Promise(r => setTimeout(r, 20));
if (!window.foundationReady) throw new Error('F03 scene failed before service connection');

const p = window.foundationProbe;
const B = window.BABYLON;
p.engine.setHardwareScalingLevel(2); // Two software-rendered pages; this run has no frame-rate claim.
p.setPlayer(participant === 'Alpha' ? [-2, 1.6, 7] : [2, 1.6, 3]);
p.camera.setTarget(new B.Vector3(0, 1.6, -2));
document.querySelector('h1').textContent = 'Two people. One courtyard.';
document.querySelector('header p').textContent = 'Independent browser sessions exchange positions through the real released VRSpace server.';
document.querySelector('footer .muted').textContent = 'Frozen F03 venue. Presence uses VRSpace v0.8.7; solid props remain local. Headsets and conferencing media remain unqualified.';
document.querySelector('#participant-label').textContent = 'This browser: ' + participant;
document.querySelector('#network-realm').textContent = realm;

const sdk = new VRSpace();
sdk.autoReconnect = true;
const peers = new Map();
const events = [];
const errors = [];
let phase = 'connecting', transportGeneration = 0, joinedGeneration = 0, lastPose = '', sentPoses = 0, disposed = false, enterAcknowledgement = null;
const now = () => ({ wallTime: Date.now(), monotonic: performance.now() });
const record = (type, detail) => { events.push({ type, ...now(), detail }); if (events.length > 1000) events.shift(); };
const status = () => {
  document.querySelector('#network-state').textContent = phase + (sdk.me ? ' · ' + sdk.me.id.slice(0, 8) : '');
  document.querySelector('#network-peers').textContent = 'Remote participants: ' + peers.size;
};
const idOf = object => object.className + ' ' + object.id;
function clearPeers() {
  for (const item of peers.values()) { item.object.removeListener(item.listener); item.root.dispose(false, true); }
  peers.clear(); sdk.scene.clear(); status();
}
function renderPeer(object) {
  if (object.className !== 'User' || object.id === sdk.me?.id) return;
  const key = idOf(object);
  const old = peers.get(key);
  if (old) { old.object.removeListener(old.listener); old.root.dispose(false, true); peers.delete(key); }
  const remoteRoot = new B.TransformNode('remote-' + object.id, p.scene);
  remoteRoot.metadata = { networkPresence: true, presentationOnly: true };
  const body = B.MeshBuilder.CreateCapsule('remote-body-' + object.id, { height: 1.6, radius: .3 }, p.scene);
  body.parent = remoteRoot; body.position.y = -.75; body.isPickable = false;
  const material = new B.StandardMaterial('remote-color-' + object.id, p.scene);
  material.diffuseColor = object.name?.startsWith('Alpha') ? new B.Color3(.12,.68,.9) : new B.Color3(1,.5,.13);
  material.emissiveColor = material.diffuseColor.scale(.15); body.material = material;
  const label = B.MeshBuilder.CreatePlane('remote-label-' + object.id, { width: 2.4, height: .38 }, p.scene);
  label.parent = remoteRoot; label.position.y = .43; label.billboardMode = B.Mesh.BILLBOARDMODE_ALL; label.isPickable = false;
  const texture = new B.DynamicTexture('remote-text-' + object.id, { width: 512, height: 96 }, p.scene, false);
  texture.hasAlpha = true; texture.drawText((object.name || 'Remote guest').split('_')[0], null, 64, 'bold 48px sans-serif', '#ffffff', '#183444dd', true);
  const textMaterial = new B.StandardMaterial('remote-text-material-' + object.id, p.scene);
  textMaterial.diffuseTexture = texture; textMaterial.emissiveColor = B.Color3.White(); textMaterial.disableLighting = true; textMaterial.backFaceCulling = false; label.material = textMaterial;
  const item = { object, root: remoteRoot, updates: 0, lastUpdate: null, body };
  const update = (_source, changes) => {
    if (object.position && ['x','y','z'].every(key => Number.isFinite(object.position[key]))) remoteRoot.position.set(object.position.x, object.position.y, object.position.z);
    if (object.rotation) remoteRoot.rotation.y = object.rotation.y || 0;
    item.updates++; item.lastUpdate = now();
    record('remote-update', { id: object.id, changes, renderedPosition: remoteRoot.position.asArray() });
  };
  item.listener = update; object.addListener(update); peers.set(key, item); update(object, { initial: true }); status();
}
sdk.addSceneListener(event => {
  if (event.added) { record('add', { id: event.added.id, className: event.added.className }); renderPeer(event.added); }
  if (event.removed) {
    const item = peers.get(idOf(event.removed));
    if (item) { item.object.removeListener(item.listener); item.root.dispose(false, true); peers.delete(idOf(event.removed)); }
    record('remove', { id: event.removed.id, className: event.removed.className }); status();
  }
});
sdk.addConnectionListener((connected, shouldReconnect) => {
  if (connected) { transportGeneration++; phase = 'transport-open'; }
  else { phase = shouldReconnect ? 'reconnecting' : 'disconnected'; enterAcknowledgement = null; clearPeers(); }
  record('transport', { connected, shouldReconnect, generation: transportGeneration }); status();
});
sdk.addErrorListener(error => { errors.push({ ...now(), error }); record('server-error', error); phase = 'server-error'; status(); });
sdk.addWelcomeListener(welcome => {
  record('welcome', { user: welcome.client?.User?.id, transportGeneration });
  if (phase === 'joining' || phase === 'joined' || disposed) return;
  phase = 'joining'; status();
  (async () => {
    const response = await sdk.enterAsync(realm);
    const entered = response.Welcome || response;
    if (!entered.client?.User?.id) throw new Error('Unexpected release Enter response: ' + JSON.stringify(response));
    Object.assign(sdk.me, entered.client.User);
    enterAcknowledgement = { requestedRealm: realm, userId: entered.client.User.id, responseTimestamp: entered.timestamp };
    record('entered', enterAcknowledgement);
    sdk.sendMyEvent({ name: participant + '_' + realm, position: { x:p.camera.position.x, y:p.camera.position.y, z:p.camera.position.z }, rotation:{ x:0,y:p.camera.rotation.y,z:0 }, hasAvatar:true });
    const sceneCount = await sdk.sessionStart();
    joinedGeneration++; phase = 'joined'; lastPose = '';
    record('session-start', { id: sdk.me.id, worldId: sdk.me.worldId, realm, sceneCount, joinedGeneration });
    sendPose(true); status();
  })().catch(error => { errors.push({ ...now(), error:error.message }); phase = 'adapter-error'; status(); console.error(error); });
});
function sendPose(force = false) {
  if (phase !== 'joined' || !sdk.isConnected() || !sdk.me) return false;
  const position = { x:p.camera.position.x, y:p.camera.position.y, z:p.camera.position.z };
  const rotation = { x:p.camera.rotation.x, y:p.camera.rotation.y, z:p.camera.rotation.z };
  const serialized = JSON.stringify({ position, rotation });
  if (force || serialized !== lastPose) { sdk.sendMyEvent({ position, rotation }); lastPose = serialized; sentPoses++; record('local-pose', { id:sdk.me.id, position, rotation, sentPoses }); return true; }
  return false;
}
const timer = setInterval(() => sendPose(), 100);
const disconnect = () => { sdk.autoReconnect = false; if (sdk.retryTimer) { clearInterval(sdk.retryTimer); sdk.retryTimer=null; } sdk.disconnect(); };
const connect = async () => { if (sdk.isConnected()) throw new Error('Session is already connected'); sdk.autoReconnect = true; phase='connecting'; status(); await sdk.connect('ws://127.0.0.1:18180/vrspace/client'); };
document.querySelector('#network-leave').addEventListener('click', disconnect);
document.querySelector('#network-rejoin').addEventListener('click', () => connect().catch(e => { errors.push({error:String(e)}); status(); }));
window.serviceProbe = {
  sdk, peers, events, errors, sendPose, disconnect, connect,
  capture() { return {
    participant, realm, phase, transportGeneration, joinedGeneration, connected:sdk.isConnected(), me:sdk.me ? { id:sdk.me.id, name:sdk.me.name, worldId:sdk.me.worldId, className:sdk.me.className } : null,
    sentPoses, enterAcknowledgement, localEye:p.camera.position.asArray(), peers:[...peers.values()].map(item => ({ id:item.object.id, name:item.object.name, position:item.object.position, renderedPosition:item.root.position.asArray(), updates:item.updates, lastUpdate:item.lastUpdate, visible:item.body.isVisible && item.body.isEnabled() })),
    sdkObjects:[...sdk.scene.values()].map(o => ({id:o.id,className:o.className,position:o.position,active:o.active})), errors, events,
  }; },
  dispose() { disposed=true; clearInterval(timer); disconnect(); clearPeers(); phase='disposed'; status(); },
};
await connect();
