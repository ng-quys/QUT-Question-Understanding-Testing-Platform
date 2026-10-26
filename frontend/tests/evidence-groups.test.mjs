import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupEvidenceEvents} from '../../frontend-shared/src/features/evidence/services/evidenceGroups.ts';
const row=(id,extra={})=>({id,event:'NO_FACE',active:true,occurredAt:'2026-10-23T10:00:00',module:'M10',duration:2,riskScore:20,riskLevel:'LOW',provider:'supabase',evidenceStatus:'uploaded',hasEvidence:true,...extra});
test('one exact capture keeps all warning labels and one best image; risk is not summed',()=>{
  const events=[row(1,{captureId:'frame-a',evidenceStatus:'failed'}),row(2,{captureId:'frame-a',event:'SPEECH',riskScore:50,riskLevel:'HIGH'}),row(3,{captureId:'frame-a',event:'CAMERA_IDENTITY_LOCK',riskScore:0})];
  const [group]=groupEvidenceEvents(events);assert.equal(group.events.length,3);assert.equal(group.imageEvent.id,2);assert.equal(group.riskScore,50);assert.equal(group.riskLevel,'HIGH');assert.equal(events[0].evidenceStatus,'failed');
});
test('identical timestamps or event names never merge unrelated captures or legacy rows',()=>{
  const events=[row(1,{captureId:'frame-a'}),row(2,{captureId:'frame-b'}),row(3),row(4)];
  assert.equal(groupEvidenceEvents(events).length,4);
});
test('late upload and different event times still belong to their explicit capture',()=>{
  const [group]=groupEvidenceEvents([row(1,{captureId:'a',evidenceStatus:'pending',occurredAt:'2026-10-23T10:00:01'}),row(2,{captureId:'a',occurredAt:'2026-10-23T10:00:00'})]);
  assert.equal(group.imageEvent.id,2);assert.equal(group.occurredAt,'2026-10-23T10:00:00');
});
