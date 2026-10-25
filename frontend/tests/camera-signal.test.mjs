import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CameraSignal } from '../src/features/student/services/cameraSignal.ts';

test('continuous camera loss locks after five seconds, and short glitches do not accumulate', () => {
  const signal = new CameraSignal();
  assert.equal(signal.observe(false, 0), false);
  assert.equal(signal.observe(false, 4999), false);
  assert.equal(signal.observe(true, 4999), false);
  assert.equal(signal.observe(false, 6000), false);
  assert.equal(signal.observe(false, 10999), false);
  assert.equal(signal.observe(false, 11000), true);
  assert.equal(signal.observe(true, 12000), false);
});
