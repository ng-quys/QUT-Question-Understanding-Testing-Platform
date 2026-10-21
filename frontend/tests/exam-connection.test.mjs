import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExamConnection } from '../src/features/student/services/examConnection.ts';

function fixture() {
  let online = true, reachable = true, pauses = 0;
  const states = [];
  const gate = new ExamConnection({
    online: () => online,
    probe: async () => { if (!reachable) throw new Error('Network unavailable'); },
    onDisconnect: () => pauses++, onChange: state => states.push(state),
  });
  return { gate, states, setOnline: value => online = value,
    setReachable: value => reachable = value, pauses: () => pauses };
}

test('disconnect locks immediately; browser online alone never resumes the exam', async () => {
  const f = fixture();
  f.setOnline(false); f.gate.disconnect();
  assert.equal(f.gate.phase, 'offline');
  assert.equal(await f.gate.resume(async () => {}), false);
  f.setOnline(true); f.setReachable(false);
  assert.equal(await f.gate.check(), false);
  assert.equal(f.gate.phase, 'offline');
  f.setReachable(true);
  assert.equal(await f.gate.check(), true);
  assert.equal(f.gate.phase, 'ready');
  assert.equal(await f.gate.resume(async () => {}), true);
  assert.equal(f.gate.phase, 'active');
});

test('unreachable backend locks an exam even when the browser reports online', async () => {
  const f = fixture(); f.setReachable(false);
  assert.equal(await f.gate.check(), false);
  assert.equal(f.gate.phase, 'offline');
  assert.equal(f.pauses(), 1);
});

test('late probe response cannot unlock a newly disconnected or stopped exam', async () => {
  let resolve;
  const gate = new ExamConnection({ online: () => true, probe: () => new Promise(r => resolve = r),
    onChange: () => {}, onDisconnect: () => {} });
  const checking = gate.check(); await Promise.resolve();
  gate.disconnect(); resolve();
  assert.equal(await checking, false);
  assert.equal(gate.phase, 'offline');
  const again = gate.check(); await Promise.resolve();
  gate.stop(); resolve();
  assert.equal(await again, false);
  assert.equal(gate.phase, 'offline');
});

test('resume requires server verification; failed verification preserves the lock', async () => {
  const f = fixture(); f.gate.disconnect(); await f.gate.check();
  await assert.rejects(f.gate.resume(async () => { throw new Error('Attempt already submitted'); }));
  assert.equal(f.gate.phase, 'offline');
});

test('disconnect during resume cannot reopen the question screen', async () => {
  const f = fixture(); f.gate.disconnect(); await f.gate.check();
  let resolve;
  const resuming = f.gate.resume(() => new Promise(r => resolve = r));
  assert.equal(f.gate.phase, 'resuming');
  f.setOnline(false); f.gate.disconnect(); resolve();
  assert.equal(await resuming, false);
  assert.equal(f.gate.phase, 'offline');
});

test('concurrent connectivity checks share a request', async () => {
  let requests = 0;
  const gate = new ExamConnection({ online: () => true, probe: async () => { requests++; },
    onChange: () => {}, onDisconnect: () => {} });
  await Promise.all([gate.check(), gate.check(), gate.check()]);
  assert.equal(requests, 1);
});
