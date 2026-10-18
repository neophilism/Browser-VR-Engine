import * as B from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {GLTF2Export} from '@babylonjs/serializers/glTF';
import RAPIER from '@dimforge/rapier3d-compat';
import {SpatialGraph} from './spatial-audio.js';
import {IMPORT_LIMITS, readModelFile, validateModelBytes} from './import-policy.js';
import {resourceCollections, captureResources, newResources, resourceCounts, disposeResources} from './import-resources.js';
import {XRSessionController, createBabylonXRExperience, xrMovementAxes} from './xr-session.js';

const $=id=>document.getElementById(id);
const status=message=>{$('status').textContent=message;};
const vec=a=>B.Vector3.FromArray(a);
const serialVec=v=>[v.x,v.y,v.z];
const serialQuat=q=>[q.x,q.y,q.z,q.w];
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const download=(blob,name)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
const safeError=error=>{console.error(error);$('fatal').style.display='block';$('fatal').textContent=error.stack||String(error);status(error.message||String(error));};
globalThis.BABYLON=B; // Compatibility boundary for the pinned, unmodified VRSpace modules.

class Evaluation {
  constructor() {
    this.descriptor={id:'babylon-native-spatial-rapier-evaluation',version:'Babylon9.30.0-Rapier0.21.0'};
    this.state='created';this.nodes=new Map();this.bodies=new Map();this.containers=[];this.animations=[];
    this.urls=[];this.assetCache=new Map();this.localAssets=new Map();this.keys=new Set();this.frames=[];
    this.physicsSteps=0;this.selected=null;this.held=null;this.lastTime=performance.now();this.accumulator=0;
    this.imports=[];this.audio=null;this.video=null;this.xr=null;this.vrspace=null;this.stopped=false;
    this.xrPose=null;this.xrVisuals=null;this.xrMutedOutput=null;this.disposing=false;
    this.inputController=new AbortController();this.pointerIds=new Set();this.importTask=null;this.disposeTask=null;this.lastImportRollback=null;
    this.canvas=$('scene');this.engine=new B.Engine(this.canvas,true,{preserveDrawingBuffer:true,stencil:true,disableWebGL2Support:false,audioEngine:false},false);
    this.engine.setHardwareScalingLevel(1);
    this.scene=new B.Scene(this.engine);this.scene.useRightHandedSystem=true;
    this.scene.clearColor=new B.Color4(.45,.62,.68,1);
    this.camera=new B.FreeCamera('desktop-camera',new B.Vector3(0,1.65,8),this.scene);
    this.camera.inputs.clear();this.camera.minZ=.05;this.camera.maxZ=600;this.camera.fov=.95;
    this.camera.setTarget(new B.Vector3(0,1.8,-4));
    this.scene.activeCamera=this.camera;
    const light=new B.HemisphericLight('courtyard-sky',new B.Vector3(.2,1,.4),this.scene);light.intensity=.95;light.groundColor=new B.Color3(.22,.25,.25);
    const sun=new B.DirectionalLight('courtyard-sun',new B.Vector3(-.5,-1,.3),this.scene);sun.intensity=1.6;sun.position.set(8,16,-8);
    this.shadow=new B.ShadowGenerator(1024,sun);this.shadow.useBlurExponentialShadowMap=true;this.shadow.blurKernel=16;
    this.scene.imageProcessingConfiguration.toneMappingEnabled=true;
    this.scene.imageProcessingConfiguration.exposure=1.1;
    this.scene.imageProcessingConfiguration.contrast=1.1;
    this.engine.runRenderLoop(()=>this.frame());
    $('status').before($('transform-editor'));
    this.listen(window,'resize',()=>this.engine.resize());
    this.bindInput();
  }
  async probe() {
    let xr=false;try{xr=!!navigator.xr&&await navigator.xr.isSessionSupported('immersive-vr');}catch{}
    return [
      {feature:'render:webgl2',status:this.engine.webGLVersion===2?'available':'unavailable',method:'real-browser',detail:this.engine.getGlInfo().renderer},
      {feature:'audio:spatial',status:window.AudioContext?'available':'unavailable',method:'real-browser',detail:'Browser-native WebAudio graph, a shared listener, one MediaElementAudioSourceNode per video element.'},
      {feature:'xr:immersive-vr',status:xr?'available':'unavailable',method:'real-browser',detail:'Capability query only. The separate user-activated session path uses Babylon rendering; physical headset evidence remains pending.'},
      {feature:'network:multiuser',status:'unverified',method:'real-browser',detail:'The isolated local prototype does not instantiate a collaboration server.'}
    ];
  }
  async load(world,context) {
    this.state='loading';this.world=structuredClone(world);this.context=context;
    await RAPIER.init();
    this.physics=new RAPIER.World({x:0,y:-9.81,z:0});this.physics.timestep=1/60;
    this.audio=new SpatialGraph();
    for(const entity of world.entities) {
      const node=new B.TransformNode(entity.id,this.scene);node.metadata={entityId:entity.id};
      this.applyTransform(node,entity.transform);this.nodes.set(entity.id,node);
    }
    for(const entity of world.entities) if(entity.parentId)this.nodes.get(entity.id).parent=this.nodes.get(entity.parentId);
    for(const entity of world.entities) {
      const node=this.nodes.get(entity.id);
      const components=Object.fromEntries(entity.components.map(c=>[c.type,c.data]));
      if(components['bve:mesh']) await this.attachAsset(node,components['bve:mesh'].asset);
      if(components['bve:collider'])this.addBody(entity.id,node,components['bve:collider']);
      if(components['bve:animation']) {
        const data=components['bve:animation'];
        const loaded=node.metadata.container;
        if(!loaded)await this.attachAsset(node,data.asset);
        const groups=node.metadata.container?.animationGroups||[];
        const group=groups.find(g=>g.name===data.clip||g.name.endsWith(data.clip));
        if(group)group.start(data.loop);
        this.animations.push({entityId:entity.id,node,data,group,segment:0,progress:0});
      }
      const media=components['bve:media-surface'];
      if(media) await this.addMediaSurface(entity.id,node,media);
      const emitter=components['bve:audio-emitter'];
      if(emitter) {
        node.computeWorldMatrix(true);
        const position=B.Vector3.TransformCoordinates(vec(emitter.localOffset),node.getWorldMatrix());
        const asset=await this.resolveAsset(emitter.sourceAsset);
        await this.audio.add(emitter.playbackId,emitter,serialVec(position),asset.bytes.buffer,media?node.metadata.video:null);
        node.metadata.emitter=emitter;
      }
    }
    this.player=this.physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,.95,8));
    this.playerCollider=this.physics.createCollider(RAPIER.ColliderDesc.capsule(.55,.35),this.player);
    this.controller=this.physics.createCharacterController(.015);this.controller.enableAutostep(.3,.2,true);this.controller.enableSnapToGround(.2);
    this.controller.setApplyImpulsesToDynamicBodies(true);this.controller.setCharacterMass(80);
    this.physics.step();
    this.addPresentation();
    this.state='ready';this.setPlayer([0,1.65,8]);
    $('world-id').textContent=world.id;$('graphics').textContent=`WebGL ${this.engine.webGLVersion}`;
    $('sources').textContent=`${this.audio.sources.size} / ${this.audio.sources.size}`;
    $('start').disabled=false;$('start').textContent='Enter courtyard & enable audio';
    status('Ready. Enter to enable sound, then explore.');
    this.setupXR();
  }
  setupXR() {
    this.xr=new XRSessionController({createExperience:()=>createBabylonXRExperience(this.scene,this.canvas),hooks:{
      state:state=>this.updateXRControls(state),
      beforeEnter:()=>{this.keys.clear();this.release();for(const id of this.pointerIds)if(this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);this.pointerIds.clear();this.accumulator=0;this.lastTime=performance.now();},
      initialPose:camera=>{camera.position.y=this.player.translation().y-.9-.015;},
      frame:(frame,helper)=>this.updateXRFrame(frame,helper),
      visibility:visibility=>{
        this.keys.clear();this.accumulator=0;this.lastTime=performance.now();
        if(visibility!=='visible'&&this.xrMutedOutput===null){this.xrMutedOutput=this.audio.output.gain.value;this.audio.output.gain.value=0;}
        if(visibility==='visible')this.restoreXRAudio();
      },
      select:event=>this.selectXR(event),
      ended:()=>{
        this.clearXRVisuals();this.restoreXRAudio();this.xrPose=null;this.keys.clear();this.accumulator=0;this.lastTime=performance.now();
        // Return to the collision controller's valid position, rather than a
        // physical lean that may put the tracked head through a virtual wall.
        if(this.player){const p=this.player.translation();this.camera.position.set(p.x,p.y+.7,p.z);}
        this.scene.activeCamera=this.camera;this.updateListener();
      },
    }});
    void this.xr.prepare();
    if(navigator.xr)this.listen(navigator.xr,'devicechange',()=>{if(!this.xr.active&&!this.xr.busy)void this.xr.prepare();});
  }
  updateXRControls(state) {
    const labels={unprepared:'Prepare VR',preparing:'Preparing VR…',unavailable:'VR unavailable',ready:'Enter VR',requesting:'Cancel VR',entering:'Cancel VR',cancelling:'Cancelling…',immersive:'Exit VR',ending:'Leaving VR…',error:state.active?'Retry exit':'Try VR again',disposed:'VR closed'};
    $('xr').textContent=labels[state.phase]||'Enter VR';
    $('xr').disabled=['preparing','unavailable','cancelling','ending','disposed'].includes(state.phase)||this.stopped||this.disposing;
    $('xr-dismiss').hidden=!state.error;$('xr-dismiss').disabled=this.stopped||this.disposing;
    $('xr-status').textContent=state.error?.message||(state.phase==='cancelling'?'Cancellation requested. Close the browser prompt; a late grant will be ended.':state.phase==='immersive'?'VR active. Left thumbstick moves; point and select EXIT VR to leave.':state.phase==='unavailable'?'Immersive VR is unavailable in this browser. Desktop exploration remains available.':state.phase==='ready'?'Enter VR requests browser permission and enables spatial audio.':'');
    for(const id of ['home','center'])$(id).disabled=state.active||state.busy||this.stopped||this.disposing;
  }
  restoreXRAudio() {
    if(this.xrMutedOutput!==null){this.audio.output.gain.value=this.xrMutedOutput;this.xrMutedOutput=null;}
  }
  createXRVisuals(camera) {
    const makeLabel=(name,text,width,height,y)=>{
      const mesh=B.MeshBuilder.CreatePlane(name,{width,height,sideOrientation:B.Mesh.DOUBLESIDE},this.scene);
      mesh.parent=camera;mesh.position.set(0,y,-1.1);mesh.metadata={presentationOnly:true};mesh.renderingGroupId=3;
      const texture=new B.DynamicTexture(name+'-text',{width:1024,height:256},this.scene,false);
      texture.drawText(text,null,150,'bold 55px sans-serif','#ffffff',name==='xr-exit'?'#173846':'#6a1e27',true);
      const material=new B.StandardMaterial(name+'-material',this.scene);material.diffuseTexture=texture;material.emissiveColor=B.Color3.White();material.disableLighting=true;material.backFaceCulling=false;mesh.material=material;
      return {mesh,texture,material};
    };
    const exit=makeLabel('xr-exit','EXIT VR',.5,.125,-.32),warning=makeLabel('xr-wall-warning','Move back from this virtual object',1.1,.275,.25);
    warning.mesh.isPickable=false;warning.mesh.setEnabled(false);
    this.xrVisuals={exit,warning,rays:new Map(),headShape:new RAPIER.Ball(.18)};
  }
  updateXRFrame(frame,helper) {
    const pose=frame.getViewerPose(helper.sessionManager.referenceSpace);
    if(!pose){this.xrPose=null;return false;}
    const camera=helper.camera;camera.computeWorldMatrix();
    this.xrPose={position:serialVec(camera.position),forward:serialVec(camera.getForwardRay().direction.normalize()),up:serialVec(camera.getDirection(B.Axis.Y).normalize()),tracking:!pose.emulatedPosition};
    this.audio.setListener(this.xrPose.position,this.xrPose.forward,this.xrPose.up);
    if(!this.xrVisuals)this.createXRVisuals(camera);
    const hit=this.physics.intersectionWithShape(camera.position,{x:0,y:0,z:0,w:1},this.xrVisuals.headShape,undefined,undefined,this.playerCollider);
    this.xrPose.nearGeometry=!!hit;this.xrVisuals.warning.mesh.setEnabled(!!hit);
    const sources=Array.from(this.xr.session.inputSources||[]).slice(0,4),visible=this.xr.visibility==='visible';
    for(const [source,line] of this.xrVisuals.rays)if(!sources.includes(source)){line.dispose();this.xrVisuals.rays.delete(source);}
    for(const source of sources) {
      const rayPose=frame.getPose(source.targetRaySpace,helper.sessionManager.referenceSpace);
      let line=this.xrVisuals.rays.get(source);
      if(!rayPose||!visible){line?.setEnabled(false);continue;}
      const ray=this.rayFromXRPose(rayPose),points=[ray.origin,ray.origin.add(ray.direction.scale(2))];
      if(!line){line=B.MeshBuilder.CreateLines('xr-input-ray',{points,updatable:true},this.scene);line.color=new B.Color3(.5,1,.8);line.isPickable=false;line.metadata={presentationOnly:true};this.xrVisuals.rays.set(source,line);}
      else B.MeshBuilder.CreateLines('xr-input-ray',{points,instance:line});
      line.setEnabled(true);
    }
    return true;
  }
  rayFromXRPose(pose) {
    const p=pose.transform.position,q=pose.transform.orientation,rotation=new B.Quaternion(q.x,q.y,q.z,q.w);
    const direction=new B.Vector3(0,0,-1);direction.rotateByQuaternionToRef(rotation,direction);
    return new B.Ray(new B.Vector3(p.x,p.y,p.z),direction.normalize(),20);
  }
  selectXR(event) {
    const helper=this.xr.experience?.helper,pose=helper&&event.frame.getPose(event.inputSource.targetRaySpace,helper.sessionManager.referenceSpace);
    if(!pose||!this.xrVisuals||this.xr.visibility!=='visible')return;
    const hit=this.scene.pickWithRay(this.rayFromXRPose(pose),mesh=>mesh===this.xrVisuals.exit.mesh);
    if(hit?.hit)void this.xr.exit().catch(()=>{});
  }
  clearXRVisuals() {
    if(!this.xrVisuals)return;
    for(const line of this.xrVisuals.rays.values())line.dispose();
    for(const label of [this.xrVisuals.exit,this.xrVisuals.warning]){label.mesh.dispose();label.material.dispose();label.texture.dispose();}
    this.xrVisuals=null;
  }
  applyTransform(node,transform) {
    if(transform.kind==='trs') {node.position.copyFromFloats(...transform.translation);node.rotationQuaternion=B.Quaternion.FromArray(transform.rotation);node.scaling.copyFromFloats(...transform.scale);}
    else {node.rotationQuaternion=new B.Quaternion();B.Matrix.FromArray(transform.elements).decompose(node.scaling,node.rotationQuaternion,node.position);}
    node.computeWorldMatrix(true);
  }
  async resolveAsset(id) {
    if(this.assetCache.has(id))return this.assetCache.get(id);
    if(this.localAssets.has(id))return this.localAssets.get(id);
    const reference=this.world.assets.find(a=>a.id===id);if(!reference)throw new Error(`Unknown asset ${id}`);
    const resolved=await this.context.assets.resolve(reference);
    this.assetCache.set(id,resolved);return resolved;
  }
  async attachAsset(node,id) {
    const asset=await this.resolveAsset(id);
    const url=URL.createObjectURL(new Blob([asset.bytes],{type:asset.mediaType}));this.urls.push(url);
    const container=await B.LoadAssetContainerAsync(url,this.scene,{pluginExtension:asset.mediaType==='model/gltf-binary'?'.glb':'.gltf'});
    container.addAllToScene();
    for(const mesh of container.rootNodes)mesh.parent=node;
    for(const mesh of container.meshes) {mesh.metadata={...mesh.metadata,entityId:node.metadata.entityId};mesh.receiveShadows=true;if(mesh.getTotalVertices())this.shadow.addShadowCaster(mesh);}
    node.metadata.container=container;node.metadata.assetId=id;this.containers.push(container);
    return container;
  }
  addBody(id,node,data) {
    node.computeWorldMatrix(true);const scale=new B.Vector3(),rotation=new B.Quaternion(),position=new B.Vector3();node.getWorldMatrix().decompose(scale,rotation,position);
    let desc=data.body==='dynamic'?RAPIER.RigidBodyDesc.dynamic():data.body==='kinematic'?RAPIER.RigidBodyDesc.kinematicPositionBased():RAPIER.RigidBodyDesc.fixed();
    desc=desc.setTranslation(position.x,position.y,position.z).setRotation(rotation);
    if(data.body==='dynamic')desc.setCcdEnabled(true).setLinearDamping(.08).setAngularDamping(.1);
    const body=this.physics.createRigidBody(desc);node.metadata.pendingBody=body;
    const half=data.halfExtents.map((n,i)=>n*Math.abs(scale.asArray()[i]));
    const collider=this.physics.createCollider(RAPIER.ColliderDesc.cuboid(...half).setFriction(.65).setRestitution(.2).setMass(data.massKg||1),body);
    this.bodies.set(id,{body,collider,node,data,half});node.metadata.bodyId=id;delete node.metadata.pendingBody;
    if(!node.metadata.container&&data.body!=='static') {
      const visual=B.MeshBuilder.CreateBox(id+'-collider-visual',{width:2*data.halfExtents[0],height:2*data.halfExtents[1],depth:2*data.halfExtents[2]},this.scene);
      visual.parent=node;visual.metadata={entityId:id};visual.receiveShadows=true;
      const material=new B.StandardMaterial(id+'-surface',this.scene);material.diffuseColor=data.body==='dynamic'?new B.Color3(.25,.52,.56):new B.Color3(.7,.68,.59);visual.material=material;
      this.shadow.addShadowCaster(visual);
    }
  }
  async addMediaSurface(id,node,data) {
    const asset=await this.resolveAsset(data.sourceAsset);
    let texture;
    if(asset.mediaType.startsWith('video/')) {
      const url=URL.createObjectURL(new Blob([asset.bytes],{type:asset.mediaType}));this.urls.push(url);
      const video=document.createElement('video');video.src=url;video.loop=true;video.preload='auto';video.playsInline=true;video.muted=false;video.volume=1;video.style.display='none';video.dataset.playbackId=data.playbackId;document.body.append(video);video.load();
      node.metadata.video=video;this.video=video;
      texture=new B.VideoTexture(id+'-video',video,this.scene,false,false,B.Texture.BILINEAR_SAMPLINGMODE,{autoPlay:false,loop:true,muted:false});
    } else {
      const url=URL.createObjectURL(new Blob([asset.bytes],{type:asset.mediaType}));this.urls.push(url);texture=new B.Texture(url,this.scene,false,false);
    }
    const surface=B.MeshBuilder.CreatePlane(id+'-screen',{width:1,height:1,sideOrientation:B.Mesh.DOUBLESIDE},this.scene);surface.parent=node;
    const mat=new B.StandardMaterial(id+'-screen-material',this.scene);mat.diffuseTexture=texture;mat.emissiveColor=new B.Color3(1,1,1);mat.disableLighting=true;mat.backFaceCulling=false;surface.material=mat;surface.metadata={entityId:id};
    node.metadata.surface=surface;
  }
  addPresentation() {
    // Labels are view decoration only; source coordinates, meshes, and colliders remain the frozen fixture.
    for(const [id,node] of this.nodes) {
      const emitter=node.metadata.emitter;if(!emitter||emitter.bus==='effects')continue;
      const plane=B.MeshBuilder.CreatePlane(id+'-label',{width:1.7,height:.4},this.scene);plane.position=node.getAbsolutePosition().add(new B.Vector3(0,.7,0));plane.billboardMode=B.Mesh.BILLBOARDMODE_ALL;plane.isPickable=false;plane.metadata={presentationOnly:true};
      const texture=new B.DynamicTexture(id+'-label-texture',{width:512,height:128},this.scene,false);texture.hasAlpha=true;texture.drawText(emitter.bus==='video'?'WALL / VIDEO':id.toUpperCase(),null,82,'bold 30px sans-serif','#ffffff','#173846cc',true);
      const mat=new B.StandardMaterial(id+'-label-material',this.scene);mat.diffuseTexture=texture;mat.emissiveColor=B.Color3.White();mat.disableLighting=true;mat.backFaceCulling=false;plane.material=mat;
    }
  }
  setPlayer(position) {
    if(this.xr?.active||this.xr?.busy)throw new Error('Leave VR before using desktop teleport controls.');
    if(!this.player)return;
    this.player.setTranslation({x:position[0],y:position[1]-.7,z:position[2]},true);
    this.player.setNextKinematicTranslation({x:position[0],y:position[1]-.7,z:position[2]});
    // Character-controller queries must see the collider at the new body pose.
    this.physics.propagateModifiedBodyPositionsToColliders();
    this.camera.position.copyFromFloats(...position);this.updateListener();
  }
  updateListener() {
    if(!this.audio)return;
    // The XR frame callback owns the listener while immersive: camera.position
    // may already contain an artificial offset intended for the next XR frame.
    if(this.xr?.active)return;
    const forward=this.camera.getForwardRay().direction.normalize();
    const up=this.camera.getDirection(B.Axis.Y).normalize();
    this.audio.setListener(serialVec(this.camera.globalPosition),serialVec(forward),serialVec(up));
  }
  stepPhysics(dt=1/60,desired=null) {
    if(!this.physics||!this.player)return;
    let move=desired;
    if(!move) {
      const forward=this.xr?.active&&this.xrPose?vec(this.xrPose.forward):this.camera.getForwardRay().direction;forward.y=0;forward.normalize();
      const right=B.Vector3.Cross(forward,B.Axis.Y).normalize();
      move=new B.Vector3(0,-.12,0);
      if(this.xr?.active){
        const axes=xrMovementAxes(this.xr.session,this.xr.phase==='immersive'&&this.xrPose?.tracking&&!this.xrPose.nearGeometry);
        move.addInPlace(forward.scale(-axes[1]*1.8*dt));move.addInPlace(right.scale(axes[0]*1.8*dt));
      }else{
        if(this.keys.has('KeyW'))move.addInPlace(forward.scale(3*dt));if(this.keys.has('KeyS'))move.addInPlace(forward.scale(-3*dt));
        if(this.keys.has('KeyD'))move.addInPlace(right.scale(3*dt));if(this.keys.has('KeyA'))move.addInPlace(right.scale(-3*dt));
      }
    }
    this.controller.computeColliderMovement(this.playerCollider,move,undefined,undefined,c=>!this.held||c.handle!==this.bodies.get(this.held).collider.handle);
    const step=this.controller.computedMovement(),p=this.player.translation();
    this.player.setNextKinematicTranslation({x:p.x+step.x,y:p.y+step.y,z:p.z+step.z});
    if(this.held) {
      const target=this.camera.position.add(this.camera.getForwardRay().direction.scale(1.8));
      this.bodies.get(this.held).body.setNextKinematicTranslation(target);
    }
    this.physics.step();this.physicsSteps++;
    const at=this.player.translation();
    if(this.xr?.active)this.xr.experience.helper.camera.position.addInPlace(new B.Vector3(at.x-p.x,at.y-p.y,at.z-p.z));
    else this.camera.position.set(at.x,at.y+.7,at.z);
    for(const {body,node,data} of this.bodies.values())if(data.body!=='static') {node.position.copyFromFloats(...serialVec(body.translation()));node.rotationQuaternion=B.Quaternion.FromArray(serialQuat(body.rotation()));}
  }
  frame() {
    if(this.stopped)return;
    const now=performance.now(),rawElapsed=(now-this.lastTime)/1000,elapsed=Math.min(rawElapsed,.2);this.lastTime=now;
    if(this.state==='ready'||this.state==='running') {
      this.frames.push(rawElapsed*1000);if(this.frames.length>6000)this.frames.shift();this.accumulator+=elapsed;
      let catchup=0;while(this.accumulator>=1/60&&catchup++<8){this.stepPhysics();this.accumulator-=1/60;}
      for(const animation of this.animations) {
        const route=animation.data.route;const from=vec(route[animation.segment]),to=vec(route[(animation.segment+1)%route.length]);
        animation.progress+=animation.data.speedMetersPerSecond*elapsed/Math.max(.01,B.Vector3.Distance(from,to));
        if(animation.progress>=1){animation.progress%=1;animation.segment=(animation.segment+1)%route.length;}
        animation.node.position.copyFrom(B.Vector3.Lerp(vec(route[animation.segment]),vec(route[(animation.segment+1)%route.length]),animation.progress));
        const direction=vec(route[(animation.segment+1)%route.length]).subtract(vec(route[animation.segment]));
        animation.node.rotationQuaternion=B.Quaternion.FromEulerAngles(0,Math.atan2(-direction.x,-direction.z),0);
      }
      for(const node of this.nodes.values())if(node.metadata.emitter) {node.computeWorldMatrix(true);const emitter=node.metadata.emitter;this.audio.setSourcePosition(emitter.playbackId,serialVec(B.Vector3.TransformCoordinates(vec(emitter.localOffset),node.getWorldMatrix())));}
      this.updateListener();
    }
    this.scene.render();
  }
  select(id) {
    if(this.selected)for(const mesh of this.nodes.get(this.selected)?.getChildMeshes()||[])mesh.showBoundingBox=false;
    this.selected=this.nodes.has(id)?id:null;
    if(this.selected)for(const mesh of this.nodes.get(id).getChildMeshes())mesh.showBoundingBox=true;
    $('selection').textContent=this.selected||'None';
    $('transform-editor').style.display=this.selected&&this.bodies.get(this.selected)?.data.body==='dynamic'?'block':'none';
    if(this.selected)serialVec(this.nodes.get(this.selected).position).forEach((v,i)=>$('edit-'+['x','y','z'][i]).value=v.toFixed(3));
    return this.selected;
  }
  grab(id=this.selected) {
    const item=this.bodies.get(id);if(!item||item.data.body!=='dynamic')return false;
    this.select(id);this.held=id;item.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);item.body.setLinvel({x:0,y:0,z:0},true);status(`Holding ${id}. Press E to release or Space to throw.`);return true;
  }
  release(velocity=[0,0,0]) {
    if(!this.held)return false;
    const item=this.bodies.get(this.held);item.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);item.body.setLinvel({x:velocity[0],y:velocity[1],z:velocity[2]},true);this.held=null;status('Prop released into the physics world.');return true;
  }
  listen(target,type,handler) { target.addEventListener(type,event=>{if(!this.stopped&&!this.disposing)handler(event);},{signal:this.inputController.signal}); }
  bindInput() {
    this.listen(window,'keydown',e=>{if(this.xr?.active||this.xr?.busy){if(e.code==='Escape')void this.xr.exit().catch(()=>{});return;}if(e.target.tagName==='INPUT')return;this.keys.add(e.code);if(e.code==='KeyE'){e.preventDefault();this.held?this.release():this.grab();}if(e.code==='Space'){e.preventDefault();if(this.held)this.release(serialVec(this.camera.getForwardRay().direction.scale(7).add(new B.Vector3(0,2,0))));}});
    this.listen(window,'keyup',e=>this.keys.delete(e.code));this.listen(window,'blur',()=>this.keys.clear());
    let drag=null;
    this.listen(this.canvas,'pointerdown',e=>{if(this.xr?.active||this.xr?.busy)return;this.canvas.focus();drag={x:e.clientX,y:e.clientY,moved:0};this.canvas.setPointerCapture(e.pointerId);this.pointerIds.add(e.pointerId);});
    this.listen(this.canvas,'pointermove',e=>{if(!drag||this.xr?.active||this.xr?.busy)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved+=Math.abs(dx)+Math.abs(dy);drag.x=e.clientX;drag.y=e.clientY;this.camera.rotationQuaternion=null;this.camera.rotation.y-=dx*.004;this.camera.rotation.x=Math.max(-1.2,Math.min(1.2,this.camera.rotation.x+dy*.004));});
    this.listen(this.canvas,'pointerup',e=>{if(drag&&drag.moved<5&&!this.xr?.active&&!this.xr?.busy){const pick=this.scene.pick(e.clientX,e.clientY,m=>!!m.metadata?.entityId);if(pick?.hit)this.select(pick.pickedMesh.metadata.entityId);}drag=null;if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);this.pointerIds.delete(e.pointerId);});
    this.listen(this.canvas,'lostpointercapture',()=>{drag=null;});
    $('start').onclick=async()=>{try{await this.audio.activate();if(this.stopped)return;this.state='running';$('start').textContent='Audio enabled · explore';status('Four corner tracks, bird and wall video share one spatial listener.');this.canvas.focus();}catch(e){if(!this.stopped)safeError(e);}};
    $('home').onclick=()=>{this.setPlayer([0,1.65,8]);this.camera.setTarget(new B.Vector3(0,2,-4));};
    $('center').onclick=()=>{this.setPlayer([0,1.65,0]);this.camera.setTarget(new B.Vector3(0,2,-8));};
    $('file').onchange=async e=>{for(const file of e.target.files||[])try{await this.importFile(file);}catch(error){if(!this.stopped)status(error.message);}};
    this.listen(window,'dragover',e=>{e.preventDefault();document.body.classList.add('dragging');});this.listen(window,'dragleave',e=>{if(!e.relatedTarget)document.body.classList.remove('dragging');});
    this.listen(window,'drop',async e=>{e.preventDefault();document.body.classList.remove('dragging');for(const file of e.dataTransfer.files)try{await this.importFile(file);}catch(error){if(!this.stopped)status(error.message);}});
    $('export').onclick=async()=>{try{const result=await this.exportGLB();if(this.stopped)return;download(result.blob,'courtyard.glb');status(`Exported ${result.bytes.toLocaleString()} bytes of scene geometry.`);}catch(e){if(!this.stopped)safeError(e);}};
    $('save').onclick=()=>{this.saved=this.snapshotWorld();download(new Blob([JSON.stringify(this.saved,null,2)],{type:'application/json'}),'courtyard.world.json');status('World transforms and component descriptors saved. Original imported bytes stay in this local session.');};
    $('reload').onclick=()=>{try{this.restoreWorld(this.saved||this.snapshotWorld());status('World transforms restored; asset identity and audio source bindings preserved.');}catch(e){if(!this.stopped)safeError(e);}};
    $('video-toggle').onclick=async()=>{const video=this.video;if(!video)return;if(video.paused)await video.play();else video.pause();if(this.stopped)return;$('video-toggle').textContent=video.paused?'Play video':'Pause video';};
    $('apply-transform').onclick=()=>{if(!this.selected)return;const position=['x','y','z'].map(axis=>Number($('edit-'+axis).value));if(!position.every(v=>Number.isFinite(v)&&Math.abs(v)<=1000)){status('Use finite coordinates between -1000 and 1000 meters.');return;}const node=this.nodes.get(this.selected),body=this.bodies.get(this.selected)?.body;node.position.copyFromFloats(...position);if(body){body.setTranslation(node.position,true);body.setLinvel({x:0,y:0,z:0},true);}status(`Applied position to ${this.selected}.`);};
    $('xr').onclick=async()=>{
      if(!this.xr||this.stopped||this.disposing)return;
      if(this.importTask){$('xr-status').textContent='Wait for the local model import to finish before entering VR.';return;}
      if(this.xr.active||this.xr.busy){await this.xr.exit().catch(()=>{});return;}
      if(!this.xr.experience){await this.xr.prepare();return;}
      const audio=this.audio.activate();const entry=this.xr.enter();
      try{await audio;if(!this.stopped&&!this.disposing)this.state='running';await entry;}catch{if(!this.stopped&&!this.disposing)$('xr-status').textContent='Spatial audio needs permission. Use the audio control after leaving VR.';}
    };
    $('xr-dismiss').onclick=()=>this.xr?.dismissError();
  }
  validateModel(bytes,extension) { return validateModelBytes(bytes,extension).json; }
  importState() {
    return {resources:resourceCounts(this.scene),nodes:this.nodes.size,bodies:this.bodies.size,
      rigidBodies:this.physics.bodies.len(),colliders:this.physics.colliders.len(),
      localAssets:this.localAssets.size,worldAssets:this.world.assets.length,entities:this.world.entities.length,
      containers:this.containers.length,urls:this.urls.length,imports:this.imports.length};
  }
  async importFile(file) {
    if(this.stopped)throw new Error('Evaluation is disposed');
    if(this.disposing)throw new Error('Evaluation is disposing');
    if(this.xr?.active||this.xr?.busy)throw new Error('Leave VR before importing a local model.');
    if(!['ready','running'].includes(this.state))throw new Error('Evaluation is not ready to import');
    if(this.importTask)throw new Error('One local import may run at a time');
    const task=this.importTransaction(file);this.importTask=task;
    try {return await task;} finally {this.importTask=null;}
  }
  async importTransaction(file) {
    if(this.imports.length>=IMPORT_LIMITS.sessionImports || this.imports.reduce((sum,item)=>sum+item.bytes,0)+file.size>IMPORT_LIMITS.sessionOriginalBytes)throw new Error('Local import session budget exceeded');
    const {bytes,extension}=await readModelFile(file);
    if(this.stopped)throw new Error('Evaluation is disposed');
    const revision=await digest(bytes),id=`dropped-${revision}`,entityId=`prop-${this.imports.length+1}-${revision.slice(0,6)}`;
    const reference={id,revision,kind:'model'},before=this.importState(),resourcesBefore=captureResources(this.scene);
    const priorAsset=this.localAssets.get(id),activeCamera=this.scene.activeCamera;
    const url=URL.createObjectURL(new Blob([bytes],{type:extension==='.glb'?'model/gltf-binary':'model/gltf+json'}));
    let node=null,container=null,committed=false;
    try {
      await B.ImportMeshAsync(url,this.scene,{pluginExtension:extension,pluginOptions:{gltf:{animationStartMode:0,
        preprocessUrlAsync:async value=>{if(value===url||value.startsWith('data:'))return value;throw new Error('External import resource rejected');},
      }}});
      if(this.stopped)throw new Error('Evaluation was disposed during import');
      container=new B.AssetContainer(this.scene);
      for(const key of resourceCollections)container[key]=newResources(this.scene,resourcesBefore)[key];
      container.populateRootNodes();container.removeAllFromScene();container.addAllToScene();
      node=new B.TransformNode(entityId,this.scene);node.metadata={entityId,container,assetId:id};
      const ahead=this.camera.position.add(this.camera.getForwardRay().direction.scale(3));node.position.set(ahead.x,2,ahead.z);node.rotationQuaternion=B.Quaternion.Identity();
      for(const root of container.rootNodes)root.parent=node;
      for(const mesh of container.meshes) {mesh.metadata={...mesh.metadata,entityId};mesh.receiveShadows=true;if(mesh.getTotalVertices())this.shadow.addShadowCaster(mesh);}
      const bounds=node.getHierarchyBoundingVectors(true),half=bounds.max.subtract(bounds.min).scale(.5),center=bounds.max.add(bounds.min).scale(.5).subtract(node.position);
      if(![...serialVec(half),...serialVec(center)].every(Number.isFinite)||container.meshes.reduce((sum,mesh)=>sum+mesh.getTotalVertices(),0)===0)throw new Error('Imported model has no finite visible geometry');
      for(const root of container.rootNodes)root.position.subtractInPlace(center);
      const max=Math.max(half.x,half.y,half.z);if(max>2){const factor=2/max;for(const root of container.rootNodes){root.position.scaleInPlace(factor);root.scaling.scaleInPlace(factor);}half.scaleInPlace(factor);}
      const bodyData={shape:'box',halfExtents:serialVec(half).map(value=>Math.max(.05,value)),body:'dynamic',massKg:3};
      this.addBody(entityId,node,bodyData);
      // All potentially rejecting loader/geometry/physics work precedes world publication.
      this.localAssets.set(id,{reference,bytes,mediaType:extension==='.glb'?'model/gltf-binary':'model/gltf+json'});
      if(!this.world.assets.some(asset=>asset.id===id))this.world.assets.push(reference);
      this.nodes.set(entityId,node);this.containers.push(container);this.urls.push(url);
      this.world.entities.push({id:entityId,name:file.name,transform:{kind:'trs',translation:serialVec(node.position),rotation:[0,0,0,1],scale:[1,1,1]},components:[{type:'bve:mesh',version:'0.1.0',required:true,data:{asset:id}},{type:'bve:collider',version:'0.1.0',required:true,data:bodyData}]});
      const imported={entityId,assetId:id,name:file.name,bytes:bytes.length,revision,vertices:node.getChildMeshes().reduce((sum,mesh)=>sum+mesh.getTotalVertices(),0),colliderHalfExtents:bodyData.halfExtents,normalization:{offset:serialVec(center),scale:max>2?2/max:1}};
      this.imports.push(imported);this.select(entityId);status(`Imported ${file.name} as a solid movable prop. Conservative box collider; original bytes preserved.`);committed=true;return imported;
    } catch(error) {
      const allocated=newResources(this.scene,resourcesBefore),created=Object.fromEntries(resourceCollections.map(key=>[key,allocated[key].length]));
      const cleanupErrors=[],cleanup=action=>{try{action();}catch(failure){cleanupErrors.push(failure);}};
      const body=this.bodies.get(entityId);if(body){cleanup(()=>this.physics.removeRigidBody(body.body));this.bodies.delete(entityId);}
      // Remove a body even when collider construction failed before addBody could publish it.
      if(node?.metadata.pendingBody){cleanup(()=>this.physics.removeRigidBody(node.metadata.pendingBody));delete node.metadata.pendingBody;}
      for(const mesh of allocated.meshes)cleanup(()=>this.shadow.removeShadowCaster(mesh));
      if(container)cleanup(()=>container.dispose());
      cleanup(()=>disposeResources(newResources(this.scene,resourcesBefore)));
      this.scene.activeCamera=activeCamera;this.nodes.delete(entityId);
      if(priorAsset)this.localAssets.set(id,priorAsset);else this.localAssets.delete(id);
      this.world.assets.length=before.worldAssets;this.world.entities.length=before.entities;
      this.containers.length=before.containers;this.urls.length=before.urls;this.imports.length=before.imports;
      this.lastImportRollback={message:error.message,created,before,after:this.importState(),cleanupErrors:cleanupErrors.map(failure=>failure.message)};
      if(cleanupErrors.length)throw new AggregateError([error,...cleanupErrors],'Local import rollback encountered an error');
      throw error;
    } finally {if(!committed)URL.revokeObjectURL(url);}
  }
  snapshotWorld() {
    const world=structuredClone(this.world);
    for(const entity of world.entities) {const node=this.nodes.get(entity.id);entity.transform={kind:'trs',translation:serialVec(node.position),rotation:serialQuat(node.rotationQuaternion||B.Quaternion.FromEulerVector(node.rotation)),scale:serialVec(node.scaling)};}
    return world;
  }
  restoreWorld(world) {
    if(world.id!==this.world.id)throw new Error('This evaluation restores snapshots of its loaded world only.');
    for(const entity of world.entities) {const node=this.nodes.get(entity.id);if(!node)throw new Error(`Missing local asset/entity ${entity.id}`);this.applyTransform(node,entity.transform);const item=this.bodies.get(entity.id);if(item){item.body.setTranslation(node.position,true);item.body.setRotation(node.rotationQuaternion,true);item.body.setLinvel({x:0,y:0,z:0},true);item.body.setAngvel({x:0,y:0,z:0},true);}}
    return {entityCount:world.entities.length,assetCount:world.assets.length};
  }
  async exportGLB() {
    const exported=await GLTF2Export.GLBAsync(this.scene,'courtyard',{shouldExportNode:node=>!(node instanceof B.Camera)&&!node.metadata?.presentationOnly&&!node.name.endsWith('-screen')});
    const blob=exported.glTFFiles['courtyard.glb'];return {blob,bytes:blob.size};
  }
  async checkGLBRoundTrip() {
    const {blob,bytes}=await this.exportGLB();const url=URL.createObjectURL(blob);
    const container=await B.LoadAssetContainerAsync(url,this.scene,{pluginExtension:'.glb'});
    const result={bytes,meshes:container.meshes.filter(m=>m.getTotalVertices()>0).length,vertices:container.meshes.reduce((s,m)=>s+m.getTotalVertices(),0),skeletons:container.skeletons.length,animationGroups:container.animationGroups.length,scope:'GLB geometry/material/animation subset; media surfaces and world semantics use the JSON snapshot, not glTF.'};container.dispose();URL.revokeObjectURL(url);return result;
  }
  inspectXR() {
    const helper=this.xr?.experience?.helper,camera=helper?.camera;
    return {...this.xr?.inspect(),pose:this.xrPose,activeCamera:this.scene.activeCamera?.name,rigCameras:camera?.rigCameras.length||0,baseLayer:!!this.xr?.active&&!!helper?.sessionManager.session?.renderState.baseLayer,visuals:this.xrVisuals?{rays:this.xrVisuals.rays.size,exitEnabled:this.xrVisuals.exit.mesh.isEnabled(),warningEnabled:this.xrVisuals.warning.mesh.isEnabled()}:null};
  }
  inspect() {
    const sorted=[...this.frames].sort((a,b)=>a-b),q=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]||0;
    return {xr:this.inspectXR(),state:this.state,descriptor:this.descriptor,worldId:this.world?.id,renderer:this.engine.getGlInfo(),webglVersion:this.engine.webGLVersion,rightHanded:this.scene.useRightHandedSystem,canvas:{width:this.canvas.width,height:this.canvas.height},meshes:this.scene.meshes.filter(m=>m.getTotalVertices()>0).length,vertices:this.scene.getTotalVertices(),skeletons:this.scene.skeletons.map(s=>({name:s.name,bones:s.bones.length})),animations:this.animations.map(a=>({entityId:a.entityId,clip:a.data.clip,playing:!!a.group?.isPlaying,position:serialVec(a.node.position),frame:a.group?.animatables?.[0]?.masterFrame??null})),bodies:[...this.bodies].map(([id,b])=>({id,type:b.data.body,position:serialVec(b.body.translation()),velocity:serialVec(b.body.linvel()),rotation:serialQuat(b.body.rotation()),halfExtents:b.half})),player:this.player?{position:serialVec(this.player.translation()),eye:this.xr?.active&&this.xrPose?this.xrPose.position:serialVec(this.camera.position),grounded:this.controller.computedGrounded()}:null,audio:this.audio?.inspect(),imports:this.imports,selected:this.selected,physicsSteps:this.physicsSteps,renderTiming:{samples:this.frames.length,p50Ms:q(.5),p95Ms:q(.95),p99Ms:q(.99),label:'Isolated software-renderer diagnostic; not target-device capacity evidence.'}};
  }
  async perform(step,context) {
    if(this.stopped)throw new Error('Evaluation is disposed');
    const observations=[];let detail='';let supported=true;
    if(step.action==='move') {if(['observer','listener','desktop-listener','player'].includes(step.targetId))this.setPlayer(step.position);else if(this.nodes.has(step.targetId)){const node=this.nodes.get(step.targetId);node.position.copyFromFloats(...step.position);this.bodies.get(step.targetId)?.body.setTranslation(node.position,true);}else supported=false;detail='Applied absolute fixture position; locomotion collision is verified by the dedicated browser movement test.';}
    else if(step.action==='look') {this.camera.rotationQuaternion=B.Quaternion.FromArray(step.orientation);this.updateListener();detail='Updated desktop view and the shared WebAudio listener.';}
    else if(step.action==='select') {supported=!!this.select(step.targetId);detail='Selection resolved by stable world entity identity.';}
    else if(step.action==='grab') {supported=this.grab(step.targetId);detail='Dynamic body entered held kinematic state.';}
    else if(step.action==='release') {supported=this.held===step.targetId&&this.release(step.velocity);detail='Held body returned to Rapier dynamics with explicit velocity.';}
    else if(step.action==='edit') {const node=this.nodes.get(step.targetId);supported=!!node;if(node){this.applyTransform(node,step.transform);const item=this.bodies.get(step.targetId);if(item){item.body.setTranslation(node.position,true);item.body.setRotation(node.rotationQuaternion,true);}}detail='Transform applied to render and collision representation.';}
    else if(['play','pause','seek'].includes(step.action)) {const node=this.nodes.get(step.targetId);const video=node?.metadata.video;supported=!!video;if(video){if(step.action==='play')await video.play();if(step.action==='pause')video.pause();if(step.action==='seek'){video.currentTime=step.seconds;await new Promise(resolve=>video.addEventListener('seeked',resolve,{once:true}));}}detail='Native media element controls the video and its own routed audio clock.';}
    else if(step.action==='export-reload') {detail=JSON.stringify(this.restoreWorld(this.snapshotWorld()));}
    else supported=false;
    for(const id of step.assertions){const assertion=context.scenario.assertions.find(a=>a.id===id);observations.push({assertionId:id,status:supported?'not-run':'unsupported',method:'real-browser',detail:`${detail} ${supported?'Action executed; this generic action adapter does not declare the assertion passed without its specific measured evidence.':'No implementation in this local slice.'} ${assertion?.description||''}`.slice(0,4096)});}
    return observations;
  }
  async testVRSpaceAssetLoader() {
    const {AssetLoader}=await import('/vendor/vrspace/asset-loader.js');
    const entity=this.world.entities.find(e=>e.components.some(c=>c.type==='bve:collider'&&c.data.body==='dynamic')&&e.components.some(c=>c.type==='bve:mesh'));
    if(!entity)throw new Error('No dynamic model fixture for VRSpace test');
    const asset=await this.resolveAsset(entity.components.find(c=>c.type==='bve:mesh').data.asset);
    // VRSpace infers glTF from its URL; a local fixture route preserves the actual extension.
    const resource=this.manifest.catalog.resources.find(r=>r.sha256===asset.reference.revision);
    const url='/fixtures/'+resource.path;
    const loader=new AssetLoader(this.scene);const before=this.scene.meshes.length;let first=null,second=null;
    await loader.loadAsset(url,(_url,container)=>{first=container;container.addAllToScene();for(const m of container.rootNodes)m.setEnabled(false);});
    await loader.loadAsset(url,(_url,_container,_info,instances)=>{second=instances;for(const m of instances.rootNodes)m.setEnabled(false);});
    const result={sourceCommit:'61f840a3dd0133fc9d357891f37eb1670b147539',babylonVersion:B.Engine.Version,loadedMeshes:first.meshes.length,instancedRoots:second.rootNodes.length,containerIdentity:loader.containers[url].container===first,instanceCount:loader.containers[url].numberOfInstances,networkServer:false};
    loader.unloadAsset(url,second);loader.unloadAsset(url);result.meshesBefore=before;result.meshesAfter=this.scene.meshes.length;result.remainingContainers=Object.keys(loader.containers).length;this.vrspace=result;return result;
  }
  async dispose() {
    if(this.disposeTask)return this.disposeTask;
    if(this.stopped)return;
    this.disposing=true;this.keys.clear();
    const controls=[...document.querySelectorAll('button,input')].map(element=>({element,disabled:element.disabled}));
    for(const {element} of controls)element.disabled=true;
    this.disposeTask=(async()=>{
      // A rejected native end retains renderer ownership and leaves disposal
      // retryable. Do not free a live session's camera, framebuffer or audio.
      await this.xr?.dispose();
      this.stopped=true;this.engine.stopRenderLoop();this.inputController.abort();
      for(const id of this.pointerIds)if(this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);this.pointerIds.clear();
      for(const {element} of controls){element.onclick=null;element.onchange=null;}
      document.body.classList.remove('dragging');
      if(this.importTask)await this.importTask.catch(()=>{});
      this.release();this.clearXRVisuals();await this.audio?.dispose();for(const url of this.urls)URL.revokeObjectURL(url);this.urls=[];
      this.physics?.free();this.scene.dispose();this.engine.dispose();
      this.nodes.clear();this.bodies.clear();this.assetCache.clear();this.localAssets.clear();this.containers=[];this.animations=[];
      this.player=null;this.playerCollider=null;this.controller=null;this.selected=null;this.video=null;this.state='disposed';
    })().finally(()=>{
      this.disposing=false;this.disposeTask=null;
      if(!this.stopped){for(const {element,disabled} of controls)element.disabled=disabled;this.updateXRControls(this.xr.inspect());}
    });
    return this.disposeTask;
  }

}

async function boot() {
  const manifest=await fetch('/fixtures/evaluation.json').then(r=>{if(!r.ok)throw new Error('The frozen F03 fixture snapshot is not installed.');return r.json();});
  const app=new Evaluation();app.manifest=manifest;window.foundationProbe=app;window.qualificationAdapter=app;
  const assets={resolve:async reference=>{const resource=manifest.catalog.resources.find(r=>r.id===reference.id||r.sha256===reference.revision);if(!resource)throw new Error(`No fixture resource for ${reference.id}`);const response=await fetch('/fixtures/'+resource.path);if(!response.ok)throw new Error(`Fixture ${resource.path} unavailable`);const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength!==resource.sizeBytes||await digest(bytes)!==reference.revision)throw new Error(`Fixture digest or size mismatch: ${resource.path}`);return {reference,mediaType:resource.mediaType,bytes};}};
  await app.load(manifest.world,{world:manifest.world,scenario:manifest.scenario,assets});
  window.foundationReady=true;
}
boot().catch(safeError);
