import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LiveFrameDelivery} from '../src/features/student/services/liveFrameDelivery.ts';

function fixture(){
  const state={now:0,turn:{lease:1,epoch:0},encoded:0,sent:[],fail:false};
  const delivery=new LiveFrameDelivery(()=>state.now);
  const options={current:()=>state.turn,capture:async()=>{state.encoded++;return {jpeg:'image',audioPcm16:''};},send:async(turn,frame)=>{if(state.fail)throw Error('offline');state.sent.push({turn,frame});}};
  return {state,delivery,options};
}
test('offline, disconnected or waiting-for-turn cameras do not encode or send live frames',async()=>{
  const {state,delivery,options}=fixture();state.turn=undefined;
  for(let i=0;i<20;i++){state.now+=250;assert.equal(await delivery.run(options),'idle');}
  assert.equal(state.encoded,0);assert.deepEqual(state.sent,[]);
});
test('a disconnect during async encoding discards the image and does not send it after reconnect on the same lease',async()=>{
  const {state,delivery,options}=fixture();let finish;
  options.capture=()=>new Promise(resolve=>{finish=resolve;});
  const first=delivery.run(options);state.turn={lease:1,epoch:1};finish({jpeg:'old-image',audioPcm16:''});
  assert.equal(await first,'stale');assert.deepEqual(state.sent,[]);
});
test('turn rotation and component cleanup during encoding never publish the obsolete frame',async()=>{
  for(const next of [{lease:2,epoch:0},undefined]){
    const {state,delivery,options}=fixture();let finish;
    options.capture=()=>new Promise(resolve=>{finish=resolve;});
    const first=delivery.run(options);state.turn=next;finish({jpeg:'old',audioPcm16:''});
    assert.equal(await first,'stale');assert.deepEqual(state.sent,[]);
  }
});
test('a failing connection backs off without repeatedly encoding; successful recovery resets retry state',async()=>{
  const {state,delivery,options}=fixture();state.fail=true;
  assert.equal(await delivery.run(options),'failed');
  for(const at of [250,500,750]){state.now=at;assert.equal(await delivery.run(options),'idle');}
  assert.equal(state.encoded,1);
  state.now=1000;assert.equal(await delivery.run(options),'failed');
  state.now=2000;assert.equal(await delivery.run(options),'idle');assert.equal(state.encoded,2);
  state.fail=false;state.now=3000;assert.equal(await delivery.run(options),'sent');
  state.now=3250;assert.equal(await delivery.run(options),'sent');assert.equal(state.sent.length,2);
});
test('slow compression cannot create overlapping encoders or a growing frame queue',async()=>{
  const {state,delivery,options}=fixture();let finish;
  options.capture=()=>{state.encoded++;return new Promise(resolve=>{finish=resolve;});};
  const first=delivery.run(options);
  for(let i=0;i<10;i++)assert.equal(await delivery.run(options),'idle');
  assert.equal(state.encoded,1);finish({jpeg:'current',audioPcm16:''});assert.equal(await first,'sent');assert.equal(state.sent.length,1);
});
