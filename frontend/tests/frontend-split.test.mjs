import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
let server, clearLegacyAdminSession;
const values=new Map();
const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
before(async()=>{
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:key=>values.get(key)??null,removeItem:key=>values.delete(key)}});
  server=await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom'});
  ({clearLegacyAdminSession}=await server.ssrLoadModule('/src/app/legacyAdminSession.ts'));
});
after(async()=>{await server?.close();if(previous)Object.defineProperty(globalThis,'sessionStorage',previous);else delete globalThis.sessionStorage;});
test('old portal admin credentials are cleared before redirect to prevent a return-to-portal loop',()=>{
  values.clear();values.set('examflow_auth',JSON.stringify({role:'admin'}));values.set('access_token','fixture');values.set('refresh_token','fixture-refresh');
  clearLegacyAdminSession();assert.equal(values.size,0);
});
test('opening the admin link never clears a student or lecturer session on the portal',()=>{
  for(const role of ['student','faculty']){
    values.clear();values.set('examflow_auth',JSON.stringify({role}));values.set('access_token','fixture');
    clearLegacyAdminSession();assert.equal(values.get('access_token'),'fixture');
  }
});
async function sourceFiles(directory){
  const entries=await readdir(directory,{withFileTypes:true});
  const children=await Promise.all(entries.map(entry=>entry.isDirectory()?sourceFiles(new URL(entry.name+'/',directory)):/\.(ts|tsx)$/.test(entry.name)?[new URL(entry.name,directory)]:[]));
  return children.flat();
}
test('portal source no longer imports the admin app and shared modules import neither app',async()=>{
  for(const path of ['../src/','../../frontend-shared/src/']){
    for(const file of await sourceFiles(new URL(path,import.meta.url))){
      const text=await readFile(file,'utf8');
      assert.doesNotMatch(text,/(?:from\s*|import\s*\()['"][^'"]*frontend-admin\//,fileURLToPath(file));
      if(path.includes('shared'))assert.doesNotMatch(text,/(?:from\s*|import\s*\()['"][^'"]*\/frontend\/src\//,fileURLToPath(file));
    }
  }
});
