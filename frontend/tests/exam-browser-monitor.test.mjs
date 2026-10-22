import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let server, monitorExamBrowser;
before(async()=>{
  server=await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom'});
  ({monitorExamBrowser}=await server.ssrLoadModule('/src/features/student/services/examBrowserMonitor.ts'));
});
after(async()=>{await server?.close();});
function fixture(initialFullscreen=false){
  const doc=Object.assign(new EventTarget(),{hidden:false,fullscreenElement:initialFullscreen?{}:null});
  const win=new EventTarget(), violations=[], restored=[], fullscreen=[];
  const stop=monitorExamBrowser({doc,win,onViolation:t=>violations.push(t),onRestore:t=>restored.push(t),onFullscreen:v=>fullscreen.push(v)});
  return {doc,win,violations,restored,fullscreen,stop};
}
test('tab/window changes are detected even when the initial fullscreen request was denied',()=>{
  const f=fixture();
  f.win.dispatchEvent(new Event('blur'));
  f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(f.violations,['WINDOW_BLUR','TAB_HIDDEN']);f.stop();
});
test('entering fullscreen later arms exit detection without remounting the exam',()=>{
  const f=fixture();
  f.doc.dispatchEvent(new Event('fullscreenchange'));
  assert.deepEqual(f.violations,[]);
  f.doc.fullscreenElement={};f.doc.dispatchEvent(new Event('fullscreenchange'));
  f.doc.fullscreenElement=null;f.doc.dispatchEvent(new Event('fullscreenchange'));
  assert.deepEqual(f.violations,['FULLSCREEN_EXIT']);
  assert.deepEqual(f.restored,['FULLSCREEN_EXIT']);f.stop();
});
test('exiting an initially fullscreen attempt triggers a warning',()=>{
  const f=fixture(true);f.doc.fullscreenElement=null;f.doc.dispatchEvent(new Event('fullscreenchange'));
  assert.deepEqual(f.violations,['FULLSCREEN_EXIT']);f.stop();
});
test('returning clears active events and leaving the exam removes listeners',()=>{
  const f=fixture();f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));
  f.win.dispatchEvent(new Event('blur'));assert.deepEqual(f.violations,['TAB_HIDDEN']);
  f.doc.hidden=false;f.doc.dispatchEvent(new Event('visibilitychange'));f.win.dispatchEvent(new Event('focus'));
  assert.deepEqual(f.restored,['TAB_HIDDEN','WINDOW_BLUR']);
  f.stop();f.win.dispatchEvent(new Event('blur'));f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(f.violations,['TAB_HIDDEN']);
});
