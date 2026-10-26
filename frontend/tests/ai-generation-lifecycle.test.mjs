import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
const file=new URL('../src/features/ai-generator/components/MatrixGenerationProgress.tsx',import.meta.url);
function harness(create,get=async()=>{}){
 let slots=[],cursor=0,effects=[],complete=0,timers=[];
 const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},useRef(initial){const i=cursor++;return slots[i]??=( {current:initial})},useEffect(fn){effects.push(fn)}};
 const jsx=(type,props)=>({type,props});
 const services={createAiJob:create,getAiJob:get,cancelAiJob:async()=>{},aiTerminal:s=>['succeeded','failed','cancelled','partial'].includes(s),quotaChanged:()=>{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};new Function('require','exports','sessionStorage','setTimeout','clearTimeout',code)(n=>n==='react'?react:n==='react/jsx-runtime'?{jsx,jsxs:jsx,Fragment:'fragment'}:services,exports,{setItem(){}},(fn,ms)=>{timers.push({fn,ms});return timers.length},()=>{});
 const props={idempotencyKey:'same-key',courseId:'11',totalQuestions:1,cloIds:[25],courses:[],sourceText:'sample',storageKey:'test',onComplete:()=>complete++,onCancel(){}};
 return {render(){cursor=0;effects=[];const view=exports.MatrixGenerationProgress(props);return {view,effect:effects[0]}},slots,timers,get complete(){return complete}};
}
const flush=()=>new Promise(r=>setImmediate(r));
test('POST 503 exits creating UI; StrictMode never automatically repeats POST; manual retry uses same key',async()=>{
 let calls=0,keys=[];const h=harness(async(_,key)=>{calls++;keys.push(key);throw Error('HTTP 503')});
 const first=h.render().effect();h.render().effect();first();await flush();
 assert.equal(calls,1);assert.match(JSON.stringify(h.render().view),/Chưa tạo được job/);assert.doesNotMatch(JSON.stringify(h.render().view),/progressbar/);
 const retry=h.render().view.props.children.find(x=>x?.type==='button');retry.props.onClick();h.render().effect();await flush();
 assert.equal(calls,2);assert.deepEqual(keys,['same-key','same-key']);
});
test('successful terminal result delivered once across StrictMode effects',async()=>{
 let calls=0;const h=harness(async()=>{calls++;return {id:9,status:'succeeded',questions:[],charged:1,requested:1}});
 const off=h.render().effect();off();h.render().effect();await flush();assert.equal(calls,1);assert.equal(h.complete,1);
});
test('job GET failures back off and stop after three retries; no POST for resumed job',async()=>{
 const h=harness(async()=>({id:9,status:'running'}),async()=>{throw Error('network')});
 h.render().effect();await flush();assert.equal(h.timers[0].ms,3000);
 await h.timers[0].fn();await flush();assert.equal(h.timers[1].ms,5000);
 await h.timers[1].fn();await flush();assert.equal(h.timers[2].ms,10000);
 await h.timers[2].fn();await flush();assert.equal(h.timers[3].ms,20000);
 await h.timers[3].fn();await flush();assert.equal(h.timers.length,4);
});
const serviceCode=ts.transpileModule(fs.readFileSync(new URL('../../frontend-shared/src/features/ai-generator/services/aiCreditsService.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
for(const mode of ['not-ready','post-503','network','success'])test('readiness/create contract '+mode,async()=>{
 const calls=[];let events=0;const out={};
 new Function('require','exports','window',serviceCode)(()=>({apiFetch:async(path,init)=>{
  calls.push({path,method:init?.method??'GET'});
  if(path.endsWith('/readiness'))return {ready:mode!=='not-ready',reason:'primary disabled'};
  if(mode==='post-503'||mode==='network')throw Error(mode);
  return {id:12,status:'reserved'};
 }}),out,{dispatchEvent(){events++}});
 const request=out.createAiJob({},'stable-key');
 if(mode==='success'){assert.equal((await request).id,12);assert.equal(events,1)}else{await assert.rejects(request);assert.equal(events,0)}
 assert.equal(calls.filter(c=>c.method==='POST').length,mode==='not-ready'?0:1);
 if(mode!=='not-ready')assert.match(calls[1].path,/idempotencyKey=stable-key/);
});
