import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/monitor-audio-worklet.js',import.meta.url),'utf8');
function processor(rate=48000){
 const messages=[];let Model;
 const context=vm.createContext({AudioWorkletProcessor:class{constructor(){this.port={postMessage:value=>messages.push(value),onmessage:null};}},sampleRate:rate,registerProcessor:(_name,type)=>{Model=type;},Int16Array,Math});
 vm.runInContext(source,context);return {audio:new Model(),messages};
}
test('waiting students produce no audio messages',()=>{const {audio,messages}=processor();for(let i=0;i<1000;i++)audio.process([[new Float32Array(128).fill(.5)]]);assert.equal(messages.length,0);assert.equal(audio.samples.length,0);});
test('selected students send bounded 16 kHz PCM chunks',()=>{const {audio,messages}=processor();audio.port.onmessage({data:true});for(let i=0;i<1125;i++)audio.process([[new Float32Array(128).fill(.5)]]);assert.equal(messages.length,10);for(const buffer of messages)assert.equal(buffer.byteLength,9600);assert.ok(audio.samples.length<4800);});
test('rotation discards unfinished audio and transmission pauses',()=>{const {audio,messages}=processor();audio.port.onmessage({data:true});for(let i=0;i<10;i++)audio.process([[new Float32Array(128)]]);assert.ok(audio.samples.length>0);audio.port.onmessage({data:false});assert.equal(audio.samples.length,0);for(let i=0;i<100;i++)audio.process([[new Float32Array(128)]]);assert.equal(messages.length,0);});
