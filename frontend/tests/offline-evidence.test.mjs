import {test} from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {canSaveFrame,deliverEvidence,EVIDENCE_LIMIT,offlineEvidenceStore as store} from '../src/features/student/services/offlineEvidence.ts';

const now=Date.now(),meta={closed:false,truncated:false,deadline:new Date(now+60000).toISOString(),lastCapturedAt:now-5000,bytes:0,captured:0};
test('capture policy freezes at deadline and enforces spacing even across independent tabs',()=>{
  assert.equal(canSaveFrame(meta,0,50000,now),'save');
  assert.equal(canSaveFrame({...meta,lastCapturedAt:now-4000},0,50000,now),'skip');
  assert.equal(canSaveFrame(meta,0,50000,now+60000),'skip');
  assert.equal(canSaveFrame({...meta,closed:true},0,50000,now),'skip');
});
test('100 MB cap covers pending data of all attempts and cumulative data of one attempt',()=>{
  assert.equal(canSaveFrame(meta,EVIDENCE_LIMIT-100,101,now),'full');
  assert.equal(canSaveFrame({...meta,bytes:EVIDENCE_LIMIT-100},0,101,now),'full');
  assert.equal(canSaveFrame({...meta,truncated:true},0,50000,now),'skip');
  assert.equal(canSaveFrame(meta,0,250001,now),'invalid');
});
test('lost response or wrong receipt keeps the image; identical retries are deleted only after durable acknowledgement',async()=>{
  const frame={id:crypto.randomUUID(),attempt:12,capturedAt:new Date(now).toISOString(),jpeg:new Blob(['jpeg'])},acked=[],sent=[];
  await assert.rejects(deliverEvidence(frame,async value=>{sent.push(value);throw Error('network');},async id=>acked.push(id)));
  assert.deepEqual(acked,[]);
  await assert.rejects(deliverEvidence(frame,async()=>({received:true,captureId:'another-capture'}),async id=>acked.push(id)));
  await deliverEvidence(frame,async value=>{sent.push(value);return {received:true,captureId:value.id};},async id=>acked.push(id));
  assert.deepEqual(acked,[frame.id]);assert.strictEqual(sent[0],sent[1]);
});
test('failed local acknowledgement can retry the same server receipt without changing the capture',async()=>{
  const frame={id:crypto.randomUUID()},send=async value=>({received:true,captureId:value.id});
  await assert.rejects(deliverEvidence(frame,send,async()=>{throw Error('disk');}));
  let acknowledged=false;await deliverEvidence(frame,send,async()=>{acknowledged=true;});assert.equal(acknowledged,true);
});
test('IndexedDB retains a Blob and immutable capture identity across a new store connection, isolated by owner',async()=>{
  const owner='restore-'+crypto.randomUUID(),at=Date.now(),grant={token:'grant',deadline:new Date(at+60000).toISOString()};
  await store.begin(owner,12,grant);
  assert.equal(await store.add(owner,12,new Blob(['original-image'],{type:'image/jpeg'}),at),'save');
  const first=await store.next(owner);assert.equal(await first.jpeg.text(),'original-image');
  assert.equal(await store.next('another-owner'),undefined);
  const restored=(await import('../src/features/student/services/offlineEvidence.ts?restored')).offlineEvidenceStore;
  const again=await restored.next(owner);
  assert.equal(again.id,first.id);assert.equal(again.sequence,1);assert.equal(again.capturedAt,first.capturedAt);
  assert.equal(await again.jpeg.text(),'original-image');
  assert.equal((await restored.list(owner))[0].pendingBytes,first.jpeg.size);
});
test('IndexedDB transactions prevent closely spaced duplicate captures and acknowledgement is idempotent',async()=>{
  const owner='atomic-'+crypto.randomUUID(),at=Date.now();await store.begin(owner,13,{token:'grant',deadline:new Date(at+60000).toISOString()});
  const saves=await Promise.all([store.add(owner,13,new Blob(['jpeg']),at),store.add(owner,13,new Blob(['jpeg']),at+1)]);
  assert.deepEqual(saves.sort(),['save','skip']);
  const frame=await store.next(owner);await Promise.all([store.ack(frame.id),store.ack(frame.id)]);
  const [meta]=await store.list(owner);assert.equal(meta.captured,1);assert.equal(meta.uploaded,1);assert.equal(meta.pendingBytes,0);
  assert.equal(await store.next(owner),undefined);
});
test('closing an attempt stops capture but preserves all images for upload after submission',async()=>{
  const owner='closed-'+crypto.randomUUID(),at=Date.now();await store.begin(owner,14,{token:'grant',deadline:new Date(at+60000).toISOString()});
  await store.add(owner,14,new Blob(['jpeg']),at);const [meta]=await store.list(owner);await store.close(meta.key);
  assert.equal(await store.add(owner,14,new Blob(['jpeg']),at+5000),'skip');
  assert.ok(await store.next(owner));await store.ack((await store.next(owner)).id);await store.finished(meta.key);
  const [done]=await store.list(owner);assert.equal(done.finished,true);assert.equal(done.token,'');
});
