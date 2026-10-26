import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
let server, createAdminViewCache;
before(async()=>{
  server=await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom'});
  ({createAdminViewCache}=await server.ssrLoadModule(fileURLToPath(new URL('../src/features/admin/services/adminViewCache.ts',import.meta.url))));
});
after(async()=>{await server?.close();});
test('keeps empty pages and separates results for different filters and pagination',()=>{
  const cache=createAdminViewCache();
  const empty={items:[],total:0}, second={items:[{id:21}],total:42};
  cache.set('students:active:page0',empty);cache.set('students:all:page1',second);
  assert.equal(cache.get('students:active:page0'),empty);
  assert.equal(cache.get('students:all:page1'),second);
  assert.equal(cache.get('teachers:all:page1'),undefined);
});
test('mutation invalidation clears every related view and independent sessions never share data',()=>{
  const first=createAdminViewCache(),other=createAdminViewCache();
  first.set('overview',{users:12});first.set('rooms',{items:[{id:1}]});
  assert.equal(other.get('overview'),undefined);
  first.clear();assert.equal(first.get('overview'),undefined);assert.equal(first.get('rooms'),undefined);
});
test('bounds memory and retains recently visited views',()=>{
  const cache=createAdminViewCache(2);
  cache.set('one',1);cache.set('two',2);assert.equal(cache.get('one'),1);cache.set('three',3);
  assert.equal(cache.get('two'),undefined);assert.equal(cache.get('one'),1);assert.equal(cache.get('three'),3);
});
