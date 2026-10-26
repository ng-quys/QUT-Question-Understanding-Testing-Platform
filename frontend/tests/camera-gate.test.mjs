import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cameraMustPause} from '../src/features/student/services/cameraGate.ts';
const health=reason=>({cameraVerified:false,cameraReason:reason,cameraMessage:''});
test('loss of server connection alone never hides questions, online or offline',()=>{
  assert.equal(cameraMustPause(false,health('connection_lost'),false),false);
  assert.equal(cameraMustPause(false,health('connection_lost'),true),false);
  assert.equal(cameraMustPause(false,null,false),false);
});
test('local camera loss still locks during an outage and confirmed identity alerts remain enforced',()=>{
  assert.equal(cameraMustPause(true,health('connection_lost'),false),true);
  assert.equal(cameraMustPause(true,null,false),true);
  assert.equal(cameraMustPause(false,health('identity_mismatch'),false),true);
  assert.equal(cameraMustPause(false,health('liveness_failed'),false),true);
});
test('stale server device failure does not override a recovered local camera while offline',()=>{
  assert.equal(cameraMustPause(false,health('device_unavailable'),false),false);
  assert.equal(cameraMustPause(false,health('permission_denied'),false),false);
  assert.equal(cameraMustPause(false,health('permission_denied'),true),true);
});
test('person count is warning-only but local camera loss still pauses the exam',()=>{
  assert.equal(cameraMustPause(false,health('multiple_people'),true),false);
  assert.equal(cameraMustPause(false,health('multiple_people'),false),false);
  assert.equal(cameraMustPause(true,health('multiple_people'),true),true);
});
