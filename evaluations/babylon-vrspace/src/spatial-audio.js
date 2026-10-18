const meterKeys=['type','startFrame','endFrame','frames','sampleRate','inputChannels','postChannels','invalidFrames','inputRms','postGainRms','gainMin','gainMax','gainSamples','droppedWindows'];
export function acceptMeterWindow(state,data,sampleRate) {
  const frames=Math.max(128,Math.floor(sampleRate/50/128)*128);
  const valid=data&&typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).length===meterKeys.length&&meterKeys.every(key=>Object.hasOwn(data,key))&&
    data.type==='paired-audio-window'&&data.frames===frames&&data.sampleRate===sampleRate&&Number.isInteger(sampleRate)&&sampleRate>=8000&&sampleRate<=384000&&
    Number.isSafeInteger(data.startFrame)&&data.startFrame>=0&&Number.isSafeInteger(data.endFrame)&&data.endFrame-data.startFrame===frames&&
    Number.isSafeInteger(data.inputChannels)&&data.inputChannels>=1&&data.inputChannels<=8&&data.postChannels===data.inputChannels&&
    Number.isSafeInteger(data.invalidFrames)&&data.invalidFrames>=0&&data.invalidFrames<=frames&&
    ['inputRms','postGainRms','gainMin','gainMax'].every(key=>Number.isFinite(data[key])&&data[key]>=0)&&data.gainMin<=data.gainMax&&
    Number.isSafeInteger(data.gainSamples)&&data.gainSamples>=0&&data.gainSamples<=frames*data.inputChannels&&Number.isSafeInteger(data.droppedWindows)&&data.droppedWindows>=0&&data.droppedWindows<=1000;
  if(!valid){state.invalidMessages=Math.min(1000,state.invalidMessages+1);return false;}
  const previous=state.history.at(-1);
  if(previous&&data.startFrame<previous.endFrame){state.invalidMessages=Math.min(1000,state.invalidMessages+1);return false;}
  state.history.push(Object.fromEntries(meterKeys.map(key=>[key,data[key]])));
  if(state.history.length>128)state.history.shift();
  return true;
}

/** A browser-native spatial adapter shared by every source, deliberately separate from rendering. */
export class SpatialGraph {
  constructor() {
    this.context = new AudioContext({latencyHint:'interactive'});
    this.initialContextState=this.context.state;
    this.suspension=this.context.suspend();
    this.meterReady=this.context.audioWorklet.addModule('/dist/audio-meter.js');
    this.output = this.context.createGain();
    this.output.gain.value = 0.6;
    this.output.connect(this.context.destination);
    this.sources = new Map();
    this.mediaSources = new WeakMap();
    this.listener = {position:[0,1.65,0],forward:[0,0,-1],up:[0,1,0]};
    this.activation = null;
    this.closed = false;
  }
  async activate() {
    await this.suspension;
    this.activation={isActive:navigator.userActivation.isActive,hasBeenActive:navigator.userActivation.hasBeenActive,at:performance.now(),before:this.context.state};
    await this.context.resume();
    this.activation.after=this.context.state;
    for(const item of this.sources.values()) if(item.video) await item.video.play();
  }
  async add(id, descriptor, position, bytes, video=null) {
    if(this.sources.has(id)) throw new Error(`Duplicate playback id ${id}`);
    await this.meterReady;
    const ctx=this.context;
    let source;
    if(video) {
      if(this.mediaSources.has(video)) throw new Error('Video element already has an audio source');
      source=ctx.createMediaElementSource(video);
      this.mediaSources.set(video,source);
      video.muted=false;
      video.volume=1;
    } else {
      const buffer=await ctx.decodeAudioData(bytes.slice(0));
      source=ctx.createBufferSource();
      source.buffer=buffer;
      source.loop=descriptor.loop;
    }
    const panner=ctx.createPanner();
    panner.panningModel='HRTF';
    panner.distanceModel=descriptor.curve.model;
    panner.refDistance=descriptor.curve.referenceDistance;
    panner.maxDistance=descriptor.curve.cutoff;
    // The shared distance law runs in a gain node before panning, so calibration is measurable
    // without HRTF coloration. PannerNode provides direction; it does not attenuate twice.
    panner.rolloffFactor=0;
    const distanceGain=ctx.createGain();
    const inputAnalyser=ctx.createAnalyser();inputAnalyser.fftSize=2048;
    const prePannerAnalyser=ctx.createAnalyser();prePannerAnalyser.fftSize=2048;
    const gain=ctx.createGain();
    const analyser=ctx.createAnalyser();
    analyser.fftSize=2048; analyser.smoothingTimeConstant=0;
    const splitter=ctx.createChannelSplitter(2);
    const channels=[ctx.createAnalyser(),ctx.createAnalyser()];
    for(const channel of channels) {channel.fftSize=2048;channel.smoothingTimeConstant=0;}
    // One audible path, including video. Analysis taps do not connect to destination.
    source.connect(distanceGain);distanceGain.connect(panner);panner.connect(gain);gain.connect(this.output);
    source.connect(inputAnalyser);distanceGain.connect(prePannerAnalyser);
    gain.connect(analyser); gain.connect(splitter); splitter.connect(channels[0],0);splitter.connect(channels[1],1);
    const meter=new AudioWorkletNode(ctx,'bve-paired-audio-meter',{numberOfInputs:2,numberOfOutputs:0});
    const meterState={history:[],invalidMessages:0};
    meter.port.onmessage=event=>{acceptMeterWindow(meterState,event.data,ctx.sampleRate);meter.port.postMessage({type:'ack'});};
    source.connect(meter,0,0);distanceGain.connect(meter,0,1);
    const item={id,descriptor,position:[...position],source,panner,distanceGain,gain,inputAnalyser,prePannerAnalyser,analyser,splitter,channels,meter,meterState,video,started:ctx.currentTime,paused:false};
    this.sources.set(id,item);
    this.setSourcePosition(id,position);
    if(!video) source.start();
    return item;
  }
  setSourcePosition(id,position) {
    const item=this.sources.get(id); if(!item) return;
    item.position=[...position];
    ['positionX','positionY','positionZ'].forEach((key,i)=>item.panner[key].value=position[i]);
    this.updateFade(item);
  }
  updateFade(item) {
    const distance=Math.hypot(...item.position.map((p,i)=>p-this.listener.position[i]));
    const {fadeStart,cutoff,referenceDistance,rolloff,model}=item.descriptor.curve;
    const t=Math.max(0,Math.min(1,(distance-fadeStart)/(cutoff-fadeStart)));
    const fade=distance>=cutoff?0:1-t*t*(3-2*t);
    const d=Math.max(referenceDistance,distance);
    const base=model==='inverse'?referenceDistance/(referenceDistance+rolloff*(d-referenceDistance)):model==='exponential'?(d/referenceDistance)**-rolloff:Math.max(0,1-rolloff*(d-referenceDistance)/(cutoff-referenceDistance));
    item.distanceGain.gain.value=base*fade;
    item.gain.gain.value=item.paused?0:item.descriptor.gain;
  }
  setListener(position,forward,up=[0,1,0]) {
    this.listener={position:[...position],forward:[...forward],up:[...up]};
    const listener=this.context.listener;
    ['positionX','positionY','positionZ'].forEach((k,i)=>listener[k].value=position[i]);
    ['forwardX','forwardY','forwardZ'].forEach((k,i)=>listener[k].value=forward[i]);
    ['upX','upY','upZ'].forEach((k,i)=>listener[k].value=up[i]);
    for(const item of this.sources.values()) this.updateFade(item);
  }
  pause(id,paused) {
    const item=this.sources.get(id); if(!item) return;
    item.paused=paused;
    if(item.video) {if(paused)item.video.pause();else return item.video.play();}
    this.updateFade(item);
  }
  static rms(analyser) {
    const wave=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(wave);
    return Math.sqrt(wave.reduce((s,x)=>s+x*x,0)/wave.length);
  }
  inspect() {
    return {state:this.context.state,initialContextState:this.initialContextState,suspendedByApplication:true,sampleRate:this.context.sampleRate,currentTime:this.context.currentTime,activation:this.activation,listener:this.listener,outputGain:this.output.gain.value,contextCount:this.closed?0:1,sources:[...this.sources.values()].map(item=>({id:item.id,sourceType:item.source.constructor.name,sameContext:item.source.context===this.context,position:item.position,pannerPosition:[item.panner.positionX.value,item.panner.positionY.value,item.panner.positionZ.value],distanceModel:item.descriptor.curve.model,pannerRolloff:item.panner.rolloffFactor,panningModel:item.panner.panningModel,gain:item.gain.gain.value*item.distanceGain.gain.value,inputRms:SpatialGraph.rms(item.inputAnalyser),prePannerRms:SpatialGraph.rms(item.prePannerAnalyser),rms:SpatialGraph.rms(item.analyser),stereoRms:item.channels.map(SpatialGraph.rms),meter:{inputs:item.meter.numberOfInputs,outputs:item.meter.numberOfOutputs,window:item.meterState.history.at(-1)||null,retainedWindows:item.meterState.history.length,invalidMessages:item.meterState.invalidMessages},connections:['source>distance-gain','distance-gain>panner','panner>gain','gain>shared-output'],directSourceToDestination:false,mediaSourceCount:item.video?Number(this.mediaSources.get(item.video)===item.source):0,video:item.video?{paused:item.video.paused,currentTime:item.video.currentTime,duration:item.video.duration,loop:item.video.loop,muted:item.video.muted,volume:item.video.volume,readyState:item.video.readyState,decodedFrames:item.video.getVideoPlaybackQuality?.().totalVideoFrames??null}:null}))};
  }
  async dispose() {
    if(this.closed)return;
    for(const item of this.sources.values()) {
      if(item.video) {item.video.pause();item.video.removeAttribute('src');item.video.load();item.video.remove();}
      else {try{item.source.stop();}catch{}}
      item.meter.port.postMessage({type:'dispose'});item.meter.port.onmessage=null;item.meter.port.close();item.meterState.history.length=0;
      for(const node of [item.source,item.distanceGain,item.panner,item.gain,item.inputAnalyser,item.prePannerAnalyser,item.analyser,item.splitter,item.meter,...item.channels])node.disconnect();
    }
    this.sources.clear();this.output.disconnect();await this.context.close();this.closed=true;
  }
}
