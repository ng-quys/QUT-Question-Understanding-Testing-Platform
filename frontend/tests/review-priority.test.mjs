import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewPriority } from '../../frontend-shared/src/features/evidence/services/reviewPriority.ts';
import { groupEvidenceEvents } from '../../frontend-shared/src/features/evidence/services/evidenceGroups.ts';

test('technical observations are information; review priorities use readable levels',()=>{
  assert.equal(reviewPriority(0),'Thông tin giám sát');
  assert.equal(reviewPriority(20),'Cần xem xét: Thấp');
  assert.equal(reviewPriority(30),'Cần xem xét: Trung bình');
  assert.equal(reviewPriority(50),'Cần xem xét: Cao');
});
test('observation, confirmed identity warning and lock use the maximum once for one capture',()=>{
  const events=['CAMERA_IDENTITY_OBSERVATION','IDENTITY_MISMATCH','CAMERA_IDENTITY_LOCK'].map((event,id)=>({
    id,event,captureId:'same-offending-photo',riskScore:id?50:0,riskLevel:id?'HIGH':'LOW',occurredAt:'2026-10-23T12:00:00',evidenceStatus:'uploaded',hasEvidence:true,
  }));
  const [group]=groupEvidenceEvents(events);
  assert.equal(group.riskScore,50);assert.equal(group.events.length,3);
});
