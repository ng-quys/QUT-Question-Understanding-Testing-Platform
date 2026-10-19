import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { createServer } from 'vite';

let server, auth, api, originalPost, originalFetch;
const storage = () => {
  const values = new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
};
const shared = storage(), adminTab = storage(), studentTab = storage();
const jwt = name => `test.${Buffer.from(JSON.stringify({sub:name,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test`;
const choose = tab => { globalThis.sessionStorage=tab;globalThis.localStorage=shared; };
const exchanges = [];

before(async()=>{
  originalPost=axios.post;originalFetch=globalThis.fetch;
  axios.post=async(url,params)=>{
    const grant=params.get('grant_type');exchanges.push({grant,refresh:params.get('refresh_token')});
    if(url.endsWith('/logout'))return {data:{}};
    const name=grant==='refresh_token'?params.get('refresh_token').replace('-refresh',''):params.get('username');
    if(name==='bad')throw new Error('Synthetic login rejected');
    return {data:{access_token:jwt(name),refresh_token:`${name}-refresh`,id_token:`${name}-id`}};
  };
  globalThis.window={location:{replace:()=>{}}};
  server=await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom'});
  auth=await server.ssrLoadModule('/src/features/auth/services/authService.ts');
  api=await server.ssrLoadModule('/src/services/api.ts');
});
after(async()=>{axios.post=originalPost;globalThis.fetch=originalFetch;delete globalThis.window;delete globalThis.localStorage;delete globalThis.sessionStorage;await server?.close();});

test('admin and student logins, refresh and logout remain isolated across tabs',async()=>{
  choose(adminTab);await auth.loginWithCredentials('admin','synthetic-admin-password');
  auth.saveAuthSession({token:auth.getToken(),username:'admin',email:'admin@example.invalid',fullName:'Admin',role:'admin'},false);
  const adminToken=auth.getToken();
  choose(studentTab);await auth.loginWithCredentials('student','synthetic-student-password');
  auth.saveAuthSession({token:auth.getToken(),username:'student',email:'student@example.invalid',fullName:'Student',role:'student'},true);
  const studentToken=auth.getToken();assert.notEqual(studentToken,adminToken);
  assert.equal(shared.getItem('access_token'),null);assert.equal(shared.getItem('examflow_auth'),null);
  choose(adminTab);assert.equal(auth.getToken(),adminToken);assert.equal(auth.getAuthSession().role,'admin');
  await auth.refreshCredentialToken();assert.equal(exchanges.at(-1).refresh,'admin-refresh');
  const refreshedAdminToken=auth.getToken();
  choose(studentTab);assert.equal(auth.getToken(),studentToken);assert.equal(auth.getAuthSession().role,'student');
  await auth.logout();assert.equal(auth.getToken(),undefined);assert.equal(auth.getAuthSession(),null);
  choose(adminTab);assert.equal(auth.getToken(),refreshedAdminToken);assert.equal(auth.getAuthSession().role,'admin');
});

test('failed login in a second tab leaves admin credentials intact',async()=>{
  choose(adminTab);const token=auth.getToken();choose(studentTab);
  await assert.rejects(auth.loginWithCredentials('bad','synthetic-password'));
  assert.equal(auth.getToken(),undefined);choose(adminTab);assert.equal(auth.getToken(),token);
});

test('legacy shared tokens and profiles are never reused by an empty tab',()=>{
  shared.setItem('access_token',jwt('other-user'));shared.setItem('examflow_auth',JSON.stringify({role:'student'}));
  choose(storage());assert.equal(auth.getToken(),undefined);assert.equal(auth.getAuthSession(),null);
});

test('forbidden API action explains account permissions instead of bare HTTP 403',async()=>{
  choose(adminTab);globalThis.fetch=async()=>({ok:false,status:403,json:async()=>{throw new Error('empty response');}});
  await assert.rejects(api.apiFetch('/admin/organization/department-exams/4/publish',{method:'POST'}),/không có quyền.*đăng nhập đúng tài khoản quản trị/);
});

test('network failure while refreshing an expired token keeps the student session and recovers on retry',async()=>{
  choose(studentTab);await auth.loginWithCredentials('student','synthetic-password');
  auth.saveAuthSession({token:auth.getToken(),username:'student',role:'student'},false);
  sessionStorage.setItem('access_token',`test.${Buffer.from(JSON.stringify({exp:1})).toString('base64url')}.test`);
  const before=sessionStorage.getItem('refresh_token'), post=axios.post;let called=false;
  axios.post=async()=>{throw new Error('Synthetic network failure');};globalThis.fetch=async()=>{called=true;throw new Error('Should not request with an expired token');};
  try{
    await assert.rejects(api.apiFetch('/student/dashboard'),/Phiên đăng nhập được giữ/);
    assert.equal(sessionStorage.getItem('refresh_token'),before);assert.equal(auth.getAuthSession().role,'student');assert.equal(called,false);
  }finally{axios.post=post;}
  globalThis.fetch=async()=>({ok:true,status:200,headers:new Headers({'content-type':'application/json'}),json:async()=>({reconnected:true})});
  assert.deepEqual(await api.apiFetch('/student/dashboard'),{reconnected:true});assert.equal(auth.getAuthSession().role,'student');
});
test('concurrent refresh requests share one exchange and a late response cannot resurrect logout',async()=>{
  choose(studentTab);const post=axios.post;let release,calls=0;
  axios.post=async()=>{calls++;return new Promise(resolve=>{release=()=>resolve({data:{access_token:jwt('student'),refresh_token:'rotated'}});});};
  try{
    const first=auth.refreshCredentialToken(),second=auth.refreshCredentialToken();assert.equal(first,second);assert.equal(calls,1);
    auth.clearTabAuth();release();await assert.rejects(first,/Phiên đăng nhập đã thay đổi/);
    assert.equal(auth.getToken(),undefined);assert.equal(auth.getAuthSession(),null);
  }finally{axios.post=post;}
});
