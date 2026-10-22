import { fileURLToPath } from 'node:url';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let server, errorMessageVi, apiFetch;
const previousFetch=globalThis.fetch;
const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
before(async()=>{
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:key=>key==='access_token'?'fixture-token':key==='access_expires_at'?String(Date.now()+3600000):null}});
  server=await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom'});
  ({errorMessageVi}=await server.ssrLoadModule(fileURLToPath(new URL("../../frontend-shared/src/services/errorMessages.ts", import.meta.url))));
  ({apiFetch}=await server.ssrLoadModule(fileURLToPath(new URL("../../frontend-shared/src/services/api.ts", import.meta.url))));
});
after(async()=>{
  globalThis.fetch=previousFetch;
  if(previousStorage)Object.defineProperty(globalThis,'sessionStorage',previousStorage);else delete globalThis.sessionStorage;
  await server?.close();
});
test('server and HTTP errors have Vietnamese messages',()=>{
  for(const status of [400,401,403,404,405,408,409,413,415,422,429,500,502,503,504]){
    const message=errorMessageVi('Internal Server Error',{status});
    assert.match(message,/[À-ỹĐđ]/);assert.doesNotMatch(message,/Internal Server Error|HTTP \d/);
  }
});
test('timeouts, cancellation and network failures are distinguished',()=>{
  for(const error of [new DOMException('signal timed out','TimeoutError'),new Error('timeout of 15000ms exceeded'),{code:'ECONNABORTED'}])assert.match(errorMessageVi(error),/thời gian chờ/);
  assert.match(errorMessageVi(new TypeError('Failed to fetch')),/kiểm tra mạng/);
  assert.match(errorMessageVi({code:'ERR_NETWORK',message:'Network Error'}),/kiểm tra mạng/);
  assert.match(errorMessageVi(new DOMException('signal is aborted without reason','AbortError')),/gián đoạn/);
});
test('Vietnamese business rules survive while raw database internals are hidden',()=>{
  const message='Ca thi đã có bài làm, không được thay đổi lịch thi.';
  assert.equal(errorMessageVi(message,{status:409}),message);
  assert.doesNotMatch(errorMessageVi('JDBC exception: không thể SQLState 42P01',{status:500}),/JDBC|SQLState/);
});
test('login credentials errors differ from session expiry',()=>{
  assert.match(errorMessageVi({response:{status:401,data:{error:'Unauthorized'}}},{login:true}),/mật khẩu không đúng/);
  assert.match(errorMessageVi('Unauthorized',{status:401}),/Phiên đăng nhập/);
  assert.match(errorMessageVi('Không đủ quyền truy cập học phần.'),/Không đủ quyền/);
});
test('camera permission and device errors have useful Vietnamese instructions',()=>{
  assert.match(errorMessageVi(new DOMException('Permission denied','NotAllowedError')),/cho phép truy cập/);
  assert.match(errorMessageVi(new DOMException('Requested device not found','NotFoundError')),/Không tìm thấy camera/);
  assert.match(errorMessageVi(new DOMException('Could not start video source','NotReadableError')),/ứng dụng khác/);
});
test('actual API translates English errors and keeps Vietnamese validation details',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'Internal Server Error'}),{status:500,headers:{'Content-Type':'application/json'}});
  await assert.rejects(apiFetch('/fixture'),/Máy chủ gặp lỗi/);
  globalThis.fetch=async()=>new Response(JSON.stringify({message:'Ca thi đã có bài làm.'}),{status:409,headers:{'Content-Type':'application/json'}});
  await assert.rejects(apiFetch('/fixture'),/Ca thi đã có bài làm/);
});
test('actual API normalizes fetch failures and preserves cancellation names',async()=>{
  globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
  await assert.rejects(apiFetch('/fixture'),/kiểm tra mạng/);
  globalThis.fetch=async()=>{throw new DOMException('signal timed out','TimeoutError');};
  await assert.rejects(apiFetch('/fixture'),error=>error.name==='TimeoutError'&&/thời gian chờ/.test(error.message));
  globalThis.fetch=async()=>{throw new DOMException('user aborted','AbortError');};
  await assert.rejects(apiFetch('/fixture'),error=>error.name==='AbortError'&&/gián đoạn/.test(error.message));
});
test('invalid JSON is localized; successful data and empty responses still work',async()=>{
  globalThis.fetch=async()=>new Response('{broken',{headers:{'Content-Type':'application/json'}});
  await assert.rejects(apiFetch('/fixture'),/Dữ liệu máy chủ trả về chưa hợp lệ/);
  globalThis.fetch=async()=>new Response(JSON.stringify({total:2}),{headers:{'Content-Type':'application/json'}});
  assert.deepEqual(await apiFetch('/fixture'),{total:2});
  globalThis.fetch=async()=>new Response(null,{status:204});
  assert.equal(await apiFetch('/fixture'),undefined);
});
