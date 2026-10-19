import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AttemptRecovery} from '../src/features/student/services/attemptRecovery.ts';

class MemoryStore {
  rows=new Map();fail=false;clears=0;
  async list(owner,attemptId){return [...this.rows.values()].filter(row=>row.owner===owner&&row.attemptId===attemptId).map(row=>({...row}));}
  async put(row){if(this.fail)throw new Error('Synthetic quota error');this.rows.set(row.key,{...row});}
  async acknowledge(row){const old=this.rows.get(row.key);if(old?.revision===row.revision)this.rows.set(row.key,{...old,synced:true});}
  async clear(owner,attemptId){this.clears++;for(const [key,row] of this.rows)if(row.owner===owner&&row.attemptId===attemptId)this.rows.delete(key);}
}
const attempt={attemptId:41,sessionId:9,questions:[{questionId:1,selectedAnswerId:11,options:[{id:11},{id:12}]},{questionId:2,selectedAnswerId:null,options:[{id:21},{id:22}]}]};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(extra={}){
 const states=[],sent=[],store=extra.store||new MemoryStore();
 const options={owner:'2000000001',attempt,deadline:1000,clock:()=>100,online:()=>false,store,send:async(q,a)=>{sent.push([q,a]);},onChange:s=>states.push(s),...extra};
 return {recovery:new AttemptRecovery(options),options,store,states,sent};
}

test('offline answers survive a new controller and merge over server choices for the same owner and attempt',async()=>{
 const f=fixture();await f.recovery.restore();f.recovery.choose(1,12);f.recovery.choose(2,22);await f.recovery.prepareSubmit();f.recovery.stop();
 assert.deepEqual(f.sent,[]);assert.equal(f.store.rows.size,2);
 const resumed=fixture({store:f.store});assert.deepEqual(await resumed.recovery.restore(),{selected:{1:12,2:22},restored:2});
 assert.deepEqual(resumed.states.at(-1).pending,[1,2]);
 const anotherUser=fixture({store:f.store,owner:'3000000001'});assert.deepEqual((await anotherUser.recovery.restore()).selected,{1:11});
 const anotherAttempt=fixture({store:f.store,attempt:{...attempt,attemptId:42}});assert.equal((await anotherAttempt.recovery.restore()).restored,0);
});
test('connection failures retain drafts; reconnect sends only the latest answer and keeps the acknowledged copy until submission',async()=>{
 let connected=true,fail=true;const sent=[];
 const f=fixture({online:()=>connected,send:async(q,a)=>{if(fail)throw new Error('Synthetic offline');sent.push([q,a]);}});
 await f.recovery.restore();f.recovery.choose(1,12);await f.recovery.flush();assert.equal(f.states.at(-1).syncError,true);
 connected=false;f.recovery.choose(1,11);f.recovery.choose(2,21);await f.recovery.prepareSubmit();f.recovery.resume();
 connected=true;fail=false;await f.recovery.flush();
 assert.deepEqual(sent,[[1,11],[2,21]]);assert.deepEqual(f.states.at(-1).pending,[]);
 assert.equal(f.store.rows.size,2);assert.ok([...f.store.rows.values()].every(row=>row.synced));assert.equal(f.store.clears,0);
});
test('an old save response cannot erase a newer answer selected while the request was in flight',async()=>{
 const first=deferred(),second=deferred(),sent=[];
 const f=fixture({online:()=>true,send:async(q,a)=>{sent.push([q,a]);await(sent.length===1?first.promise:second.promise);}});
 await f.recovery.restore();f.recovery.choose(1,12);await settle();assert.deepEqual(sent,[[1,12]]);
 f.recovery.choose(1,11);await settle();first.resolve();await settle();
 assert.equal([...f.store.rows.values()][0].answerId,11);assert.equal([...f.store.rows.values()][0].synced,false);
 assert.deepEqual(sent,[[1,12],[1,11]]);assert.deepEqual(f.states.at(-1).pending,[1]);
 second.resolve();await f.recovery.flush();assert.deepEqual(f.states.at(-1).pending,[]);assert.equal([...f.store.rows.values()][0].synced,true);
});
test('local storage failure is visible and never claims an offline choice is safely stored or synchronized',async()=>{
 const store=new MemoryStore();store.fail=true;const f=fixture({store});await f.recovery.restore();
 f.recovery.choose(2,22);await f.recovery.prepareSubmit();
 assert.equal(f.states.at(-1).storageError,true);assert.deepEqual(f.states.at(-1).pending,[2]);assert.equal(store.rows.size,0);assert.deepEqual(f.sent,[]);
});
test('server rejection leaves the local copy available for recovery',async()=>{
 const f=fixture({online:()=>true,send:async()=>{throw new Error('Not allowed');}});await f.recovery.restore();
 f.recovery.choose(2,21);await f.recovery.flush();assert.equal(f.store.rows.size,1);assert.equal([...f.store.rows.values()][0].synced,false);assert.equal(f.store.clears,0);
});
test('deadline is unchanged by reconnect and blocks new choices or delayed answer uploads',async()=>{
 let now=100,online=false;const f=fixture({clock:()=>now,online:()=>online});await f.recovery.restore();
 assert.equal(f.recovery.choose(1,12),true);await f.recovery.prepareSubmit();f.recovery.resume();
 now=1000;online=true;assert.equal(f.recovery.choose(2,21),false);await f.recovery.flush();
 assert.deepEqual(f.sent,[]);assert.deepEqual(f.states.at(-1).pending,[1]);assert.equal(f.store.rows.size,1);
});
test('submission pauses autosave; failure resumes without deleting drafts; confirmation clears only this attempt',async()=>{
 const f=fixture();await f.recovery.restore();f.recovery.choose(1,12);await f.recovery.prepareSubmit();
 assert.equal(f.recovery.choose(2,21),false);assert.equal(f.store.clears,0);
 f.recovery.resume();assert.equal(f.recovery.choose(2,21),true);await f.recovery.prepareSubmit();
 const other=fixture({store:f.store,owner:'other'});await other.recovery.restore();other.recovery.choose(1,12);await other.recovery.prepareSubmit();
 await f.recovery.complete();assert.equal(f.store.clears,1);assert.equal((await f.store.list('2000000001',41)).length,0);assert.equal((await f.store.list('other',41)).length,1);
});
test('restore trusts server for acknowledged choices and ignores unrelated or invalid local answers',async()=>{
 const f=fixture();await f.store.put({key:'clean',owner:f.options.owner,attemptId:41,questionId:1,answerId:12,revision:'clean',synced:true});
 await f.store.put({key:'bad',owner:f.options.owner,attemptId:41,questionId:2,answerId:999,revision:'bad',synced:false});
 assert.deepEqual(await f.recovery.restore(),{selected:{1:11},restored:0});assert.equal(f.recovery.choose(99,11),false);
});
test('stopping a page does not delete an unfinished write or send it under the next account',async()=>{
 const f=fixture();await f.recovery.restore();f.recovery.choose(2,22);f.recovery.stop();await f.recovery.prepareSubmit();
 assert.equal(f.store.rows.size,1);assert.deepEqual(f.sent,[]);assert.equal(f.store.clears,0);
});
