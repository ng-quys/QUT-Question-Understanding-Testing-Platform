import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OfflineExam, ExamClock, reconcileOfflineRecord,submitOrRecoverResult } from '../src/features/student/services/offlineExam.ts';

class Store {
  rows=new Map();fail=false;
  async put(record){if(this.fail)throw new Error('Synthetic disk failure');this.rows.set(record.key,structuredClone(record));}
  async list(owner){return [...this.rows.values()].filter(record=>record.owner===owner).map(record=>structuredClone(record));}
  async remove(key){this.rows.delete(key);}
}
const start=Date.parse('2026-10-24T09:00:00Z'),end=start+60000;
const attempt={attemptId:12,startedAt:'2026-10-24T16:00:00',questions:[{questionId:1,options:[{id:11},{id:12}]}]};
function fixture(){
  const now={value:start},store=new Store();
  const journal=OfflineExam.create('sv1',attempt,{token:'server-issued-token',deadline:new Date(end).toISOString(),serverTime:new Date(start).toISOString()},{},store,()=>now.value);
  return {journal,now,store};
}
test('offline choices remain writable before deadline, freeze at deadline, and retries keep identical payload',async()=>{
  const f=fixture();await f.journal.save();f.journal.disconnected();
  assert.equal(f.journal.choose(1,12),true);f.now.value=end+5000;
  assert.equal(f.journal.choose(1,11),false);
  const frozen=await f.journal.freeze();assert.equal(frozen.frozenAt,new Date(end).toISOString());
  assert.deepEqual(frozen.answers,[{questionId:1,answerId:12}]);
  f.now.value+=100000;assert.deepEqual(await f.journal.freeze(),frozen);
  frozen.answers[0].answerId=11;assert.equal((await f.journal.freeze()).answers[0].answerId,12);
});
test('restoring after reload preserves the exact frozen submission and cannot unlock editing',async()=>{
  const f=fixture();f.journal.choose(1,12);const frozen=await f.journal.freeze();
  const [record]=await f.store.list('sv1');const restored=new OfflineExam(record,f.store,()=>start);
  assert.equal(restored.choose(1,11),false);assert.deepEqual(await restored.freeze(),frozen);
  assert.deepEqual(await f.store.list('sv2'),[]);
});
test('manual offline submission freezes early, keeps answers until server confirmation, and clears explicitly',async()=>{
  const f=fixture();f.journal.disconnected();f.journal.choose(1,11);f.now.value+=10000;
  const frozen=await f.journal.freeze();assert.equal(frozen.frozenAt,new Date(start+10000).toISOString());
  assert.equal(f.journal.choose(1,12),false);assert.equal((await f.store.list('sv1')).length,1);
  await f.journal.complete();assert.deepEqual(await f.store.list('sv1'),[]);
});
test('storage failure never reports a frozen snapshot as durably saved, retry retains original identity',async()=>{
  const f=fixture();f.journal.choose(1,12);f.store.fail=true;
  await assert.rejects(f.journal.freeze());const id=f.journal.record.frozen.submissionId;
  assert.equal(f.journal.choose(1,11),false);f.store.fail=false;
  assert.equal((await f.journal.freeze()).submissionId,id);
});
test('server anchored clock cannot gain exam time when system clock moves backward',()=>{
  let wall=10000,tick=0;const clock=new ExamClock(start,()=>wall,()=>tick);
  tick=5000;wall-=60000;assert.equal(clock.now(),start+5000);
  tick=10000;assert.equal(clock.now(),start+10000);
});
test('reload anchor includes time spent saving and restoring after grant issuance',()=>{
  const journal=OfflineExam.create('sv1',attempt,{token:'token',deadline:new Date(end).toISOString(),serverTime:new Date(start).toISOString()},{},new Store(),()=>start+20000);
  assert.equal(journal.record.savedAt,start+20000);
  assert.ok(Date.now()+journal.record.clockOffset>=start+20000);
});

const draft=(extra={})=>({owner:'sv1',attemptId:12,questionId:1,answerId:12,revision:'latest',synced:false,changedAt:start+2000,...extra});
test('partial snapshot write failure recovers the newer independently saved answer, even if already acknowledged',async()=>{
  for(const synced of [false,true]){
    const f=fixture();f.journal.record.selected={1:11};f.journal.record.answerTimes={1:start+1000};
    const merged=reconcileOfflineRecord(f.journal.record,[draft({synced})]);assert.equal(merged.selected[1],12);
    const resumed=new OfflineExam(merged,f.store,()=>end+1000);
    assert.deepEqual((await resumed.freeze()).answers,[{questionId:1,answerId:12}]);
  }
});
test('partial answer-store failure never restores an older answer over the newer snapshot',()=>{
  const f=fixture();f.journal.record.selected={1:11};f.journal.record.answerTimes={1:start+3000};
  assert.equal(reconcileOfflineRecord(f.journal.record,[draft()]).selected[1],11);
});
test('reconciliation ignores foreign attempts, invalid options and changes at or after the deadline',()=>{
  const f=fixture();f.journal.record.selected={1:11};
  const merged=reconcileOfflineRecord(f.journal.record,[draft({owner:'sv2'}),draft({attemptId:99}),draft({answerId:99}),draft({changedAt:end}),draft({changedAt:NaN})]);
  assert.deepEqual(merged.selected,{1:11});assert.deepEqual(f.journal.record.selected,{1:11});
});
test('an already frozen payload is never reconciled with subsequently modified drafts',async()=>{
  const f=fixture();f.journal.choose(1,11);const frozen=await f.journal.freeze();
  const merged=reconcileOfflineRecord(f.journal.record,[draft()]);assert.deepEqual(merged.frozen,frozen);assert.equal(merged.selected[1],11);
});
test('a lost submission response or a submission from another tab recovers only confirmed terminal results',async()=>{
  let sends=0,reads=0;
  const result={attemptId:12,status:'completed',score:8};
  const response=await submitOrRecoverResult(12,async()=>{sends++;throw new Error('response lost');},async()=>{reads++;return result;});
  assert.equal(response.recovered,true);assert.deepEqual(response.data,result);assert.equal(sends,1);assert.equal(reads,1);
});
test('a successful submission does not make an extra result request',async()=>{
  const result={attemptId:12,status:'completed'};
  assert.deepEqual(await submitOrRecoverResult(12,async()=>result,async()=>assert.fail('unexpected result read')),{data:result,recovered:false});
});
test('an outage, pending result or different attempt never counts as server acceptance',async()=>{
  const original=new Error('not submitted');
  for(const result of [async()=>{throw new Error('still offline');},async()=>({attemptId:12,status:'in_progress'}),async()=>({attemptId:99,status:'completed'})])
    await assert.rejects(submitOrRecoverResult(12,async()=>{throw original;},result),error=>error===original);
});
