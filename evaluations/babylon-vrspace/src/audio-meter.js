// Analysis-only AudioWorklet: paired channels are read in the same process block.
// It has no outputs and cannot create an additional audible route.
class PairedAudioMeter extends AudioWorkletProcessor {
  constructor() {
    super();this.stopped=false;this.windowFrames=Math.max(128,Math.floor(sampleRate/50/128)*128);
    this.pending=[];this.awaitingAck=false;this.droppedWindows=0;this.reset();
    this.port.onmessage=event=>{
      if(event.data?.type==='dispose'){this.stopped=true;this.pending.length=0;}
      else if(event.data?.type==='ack'&&!this.stopped&&this.awaitingAck){this.awaitingAck=false;this.flush();}
    };
  }
  reset() {
    this.frames=0;this.samples=0;this.inputEnergy=0;this.postEnergy=0;this.invalidFrames=0;
    this.inputChannels=0;this.postChannels=0;this.gainMin=Infinity;this.gainMax=0;this.gainSamples=0;
  }
  enqueue(window) {
    if(this.pending.length>=128){this.pending.shift();this.droppedWindows=Math.min(1000,this.droppedWindows+1);}
    this.pending.push(window);this.flush();
  }
  flush() {
    if(this.stopped||this.awaitingAck||!this.pending.length)return;
    this.awaitingAck=true;
    this.port.postMessage({...this.pending.shift(),droppedWindows:this.droppedWindows});
  }
  process(inputs) {
    if(this.stopped)return false;
    const before=inputs[0]||[],after=inputs[1]||[];
    const length=before[0]?.length||after[0]?.length||128;
    for(let frame=0;frame<length;frame++) {
      if(this.frames===0){this.startFrame=currentFrame+frame;this.inputChannels=before.length;this.postChannels=after.length;}
      let valid=before.length>=1&&before.length<=8&&before.length===after.length&&before.length===this.inputChannels&&after.length===this.postChannels;
      for(let channel=0;channel<Math.min(before.length,after.length,8);channel++) {
        const input=before[channel][frame],post=after[channel][frame];
        if(!Number.isFinite(input)||!Number.isFinite(post)){valid=false;continue;}
        this.inputEnergy+=input*input;this.postEnergy+=post*post;this.samples++;
        if(Math.abs(input)>1e-6){const ratio=Math.abs(post/input);this.gainMin=Math.min(this.gainMin,ratio);this.gainMax=Math.max(this.gainMax,ratio);this.gainSamples++;}
      }
      if(!valid)this.invalidFrames++;
      this.frames++;
      if(this.frames===this.windowFrames) {
        this.enqueue({type:'paired-audio-window',startFrame:this.startFrame,endFrame:currentFrame+frame+1,frames:this.frames,sampleRate,
          inputChannels:this.inputChannels,postChannels:this.postChannels,invalidFrames:this.invalidFrames,
          inputRms:this.samples?Math.sqrt(this.inputEnergy/this.samples):0,postGainRms:this.samples?Math.sqrt(this.postEnergy/this.samples):0,
          gainMin:this.gainSamples?this.gainMin:0,gainMax:this.gainMax,gainSamples:this.gainSamples});
        this.reset();
      }
    }
    return true;
  }
}
registerProcessor('bve-paired-audio-meter',PairedAudioMeter);
