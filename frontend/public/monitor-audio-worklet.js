// Bounded, 16 kHz mono PCM. No network or storage from the audio worklet.
class MonitorAudio extends AudioWorkletProcessor {
  constructor() {
    super();this.enabled=false;this.samples=[];this.phase=0;
    this.port.onmessage=event=>{this.enabled=event.data===true;if(!this.enabled){this.samples=[];this.phase=0;}};
  }
  process(inputs) {
    const source=inputs[0]?.[0];if(!this.enabled||!source)return true;
    for(let i=0;i<source.length;i++){
      this.phase+=16000;
      if(this.phase>=sampleRate){this.phase-=sampleRate;this.samples.push(Math.max(-32768,Math.min(32767,Math.round(source[i]*32767))));}
    }
    if(this.samples.length>=4800){const pcm=new Int16Array(this.samples.splice(0,4800));this.port.postMessage(pcm.buffer,[pcm.buffer]);}
    return true;
  }
}
registerProcessor('qut-monitor-audio',MonitorAudio);
