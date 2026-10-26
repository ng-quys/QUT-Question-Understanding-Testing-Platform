import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createQuotaStore} from '../src/features/ai-generator/hooks/quotaStore.ts';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('Sidebar + Generator + StrictMode share one in-flight GET; success event refreshes',async()=>{
 let calls=0,resolve;const events=new EventTarget();
 const store=createQuotaStore(()=>{calls++;return new Promise(r=>resolve=r)},events);
 const off=store.subscribe(()=>{});off();const a=store.subscribe(()=>{}),b=store.subscribe(()=>{});
 assert.equal(calls,1);resolve({remaining:198});await flush();
 assert.equal(store.getSnapshot().quota.remaining,198);
 events.dispatchEvent(new Event('examflow-ai-quota'));assert.equal(calls,2);
 a();b();resolve({remaining:197});await flush();
 events.dispatchEvent(new Event('examflow-ai-quota'));assert.equal(calls,2);
});
test('503/network errors back off and stop after three retries; unmount clears timer',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let calls=0;
 const store=createQuotaStore(async()=>{calls++;throw new Error(calls%2?'HTTP 503':'network')},new EventTarget());
 const off=store.subscribe(()=>{});await flush();assert.equal(calls,1);
 for(const delay of [5000,10000,20000]){t.mock.timers.tick(delay);await flush();}
 assert.equal(calls,4);t.mock.timers.tick(300000);await flush();assert.equal(calls,4);
 await store.refresh();assert.equal(calls,5);off();t.mock.timers.tick(300000);await flush();assert.equal(calls,5);
});
