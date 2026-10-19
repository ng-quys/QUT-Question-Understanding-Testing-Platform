// Isolated callback/hook tests: all HTTP/timers are mocked; no browser or DB.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript'), React=require('react');
let current, fakeApi;
const timers=new Map();let sequence=0;
const react={...React,
  useState(initial){const h=current,i=h.index++;if(!(i in h.states))h.states[i]=typeof initial==='function'?initial():initial;
    return [h.states[i],value=>{h.states[i]=typeof value==='function'?value(h.states[i]):value;h.dirty=true;}];},
  useRef(initial){const h=current,i=h.index++;if(!(i in h.states))h.states[i]={current:initial};return h.states[i];},
  useEffect(callback,deps){const h=current,i=h.index++,old=h.effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))
    h.pending.push(()=>{old?.cleanup?.();h.effects[i]={deps,cleanup:callback()};});},
};
const cache=new Map();
function load(filename){
  const file=path.resolve(filename);if(cache.has(file))return cache.get(file);
  const module={exports:{}};cache.set(file,module.exports);
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,
  }}).outputText;
  const localRequire=name=>{
    if(name==='react')return react;
    if(name==='react/jsx-runtime')return require(name);
    if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});
    if(name.endsWith('/services/api'))return {apiFetch:(...args)=>fakeApi(...args)};
    const candidate=path.resolve(path.dirname(file),name);
    for(const extension of ['.ts','.tsx'])if(fs.existsSync(candidate+extension))return load(candidate+extension);
    throw Error('Unexpected import: '+name);
  };
  const context={console,Event,window:{dispatchEvent(){}},
    setTimeout:callback=>{const id=++sequence;timers.set(id,callback);return id;},
    clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext('(function(require,module,exports){'+source+'\n})',context)(localRequire,module,module.exports);
  return module.exports;
}
function mount(Component,props){
  const h={states:[],effects:[],pending:[],index:0,dirty:true,tree:null};
  h.render=()=>{let limit=25;while(h.dirty){assert.ok(limit-->0,'render loop');h.dirty=false;h.index=0;current=h;
    h.tree=Component(props);h.pending.splice(0).forEach(effect=>effect());}return h.tree;};
  h.unmount=()=>h.effects.forEach(effect=>effect?.cleanup?.());
  h.render();return h;
}
function nodes(tree,predicate,result=[]){
  if(Array.isArray(tree)){tree.forEach(node=>nodes(node,predicate,result));return result;}
  if(!React.isValidElement(tree))return result;
  if(predicate(tree))result.push(tree);
  nodes(tree.props.children,predicate,result);return result;
}
function text(tree){
  if(Array.isArray(tree))return tree.map(text).join('');
  if(React.isValidElement(tree))return text(tree.props.children);
  return tree==null?'':String(tree);
}
async function flush(h){for(let i=0;i<12;i++)await Promise.resolve();h.render();}
async function poll(h){
  const entry=timers.entries().next().value;assert.ok(entry,'poll scheduled');
  timers.delete(entry[0]);await entry[1]();await flush(h);
}
const {MatrixGenerationProgress:Progress}=load('src/features/ai-generator/components/MatrixGenerationProgress.tsx');
const question={content:'Valid question',options:['a','b','c','d'],correctIndex:0,
  explanation:'Explanation',bloom:'remember',chapterId:2,cloId:3};
const base={courseId:'5',totalQuestions:2,units:[{name:'Unit',chapterId:'2',cloId:'3',nb:2,th:0,vd:0}],
  summary:{totalNB:2,totalTH:0,totalVD:0,percentNB:100,percentTH:0,percentVD:0},
  aiInstruction:'',courses:[],chapters:[],clos:[],sourceText:'Real extracted text',sourceProof:'proof',
  provider:'qwen',onCancel(){}};

// Lost create response: explicit retry must preserve both key and payload.
{
  const calls=[],completed=[];let attempts=0;
  fakeApi=async(url,init={})=>{
    if(url.includes('?idempotencyKey=')){
      calls.push([url,init.body]);
      if(++attempts===1)throw Error('Response lost');
      return {id:11,courseId:5,status:'running',requested:2,accepted:0,charged:0,questions:[]};
    }
    return {id:11,courseId:5,status:'partial',requested:2,accepted:1,charged:1,questions:[question]};
  };
  const h=mount(Progress,{...base,idempotencyKey:'stable-key',onComplete:(...args)=>completed.push(args)});
  await flush(h);
  const retry=nodes(h.tree,node=>node.type==='button'&&text(node).includes('Kiểm tra lại'))[0];
  assert.ok(retry);retry.props.onClick();h.render();await flush(h);await poll(h);
  assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
  assert.equal(completed.length,1);assert.equal(completed[0][1],1);
  assert.equal(completed[0][0][0].courseId,'5');h.unmount();
}
// Cancel is an explicit server request, not an immediate client-side refund.
{
  let cancellations=0,completed=0;
  fakeApi=async(url)=>{
    if(url.endsWith('/cancel')){cancellations++;return {id:22,courseId:5,status:'cancel_requested',requested:2,accepted:0,charged:0,questions:[]};}
    if(url.includes('?'))return {id:22,courseId:5,status:'running',requested:2,accepted:0,charged:0,questions:[]};
    return {id:22,courseId:5,status:'cancelled',requested:2,accepted:0,charged:0,questions:[]};
  };
  const h=mount(Progress,{...base,idempotencyKey:'cancel-key',onComplete:()=>completed++});
  await flush(h);
  nodes(h.tree,node=>node.type==='button'&&text(node).includes('Yêu cầu hủy'))[0].props.onClick();
  await flush(h);assert.equal(cancellations,1);assert.equal(completed,0);
  await poll(h);assert.equal(completed,0);h.unmount();
}
// Reload/resume reads a server job and never submits a fresh generation.
{
  let posts=0;const completed=[];
  fakeApi=async(url,init={})=>{if(init.method==='POST')posts++;return {
    id:33,courseId:55,defaultScore:2,status:'succeeded',requested:1,accepted:1,charged:1,questions:[question],
  };};
  const h=mount(Progress,{...base,idempotencyKey:'resume-33',resumeJobId:33,onComplete:(...args)=>completed.push(args)});
  await flush(h);assert.equal(posts,0);assert.equal(completed.length,1);
  assert.equal(completed[0][0][0].courseId,'55');assert.equal(completed[0][0][0].default_score,2);assert.equal(completed[0][1],1);h.unmount();
}
assert.equal(timers.size,0);
console.log('PASS: create retry preserves key/payload; partial uses BE charge; cancel awaits BE; resume does not POST. HTTP/timers mocked; no DB calls.');
