import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {createServer} from 'vite';
let server, sessionHome, routes, AdminLoginPage, AdminPage;
const values=new Map();
const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
before(async()=>{
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:key=>values.get(key)??null}});
  server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true,watch:null,hmr:false},appType:'custom'});
  ({sessionHome}=await server.ssrLoadModule(fileURLToPath(new URL('../../frontend-shared/src/app/sessionHome.ts',import.meta.url))));
  ({ROUTES:routes}=await server.ssrLoadModule(fileURLToPath(new URL('../../frontend-shared/src/app/routes.ts',import.meta.url))));
  ({AdminLoginPage}=await server.ssrLoadModule('/src/features/admin/pages/AdminLoginPage.tsx'));
  ({AdminPage}=await server.ssrLoadModule('/src/features/admin/pages/AdminPage.tsx'));
});
after(async()=>{await server?.close();if(previous)Object.defineProperty(globalThis,'sessionStorage',previous);else delete globalThis.sessionStorage;});
test('standalone admin uses the root URL and a local login route',()=>{
  assert.equal(routes.ADMIN,'/');assert.equal(routes.ADMIN_LOGIN,'/login');
  assert.equal(sessionHome({role:'admin'},'fixture'),'/');
});
test('student and lecturer sessions do not open an admin workspace',()=>{
  for(const role of ['student','faculty'])assert.equal(sessionHome({role},'fixture'),null);
  values.set('examflow_auth',JSON.stringify({role:'student',token:'fixture'}));
  assert.equal(renderToStaticMarkup(createElement(MemoryRouter,null,createElement(AdminPage))),'');
  values.clear();
});
test('admin login is separate and links to the portal without transferring credentials',()=>{
  const html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(AdminLoginPage)));
  assert.match(html,/Đăng nhập quản trị/);
  assert.match(html,/http:\/\/localhost:5173\/login/);
  assert.doesNotMatch(html,/[?&](token|access_token|refresh_token)=/);
});
