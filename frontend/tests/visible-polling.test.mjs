import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server, startVisiblePolling;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' });
  ({ startVisiblePolling } = await server.ssrLoadModule('/src/features/sessions/services/visiblePolling.ts'));
});
after(async () => { await server?.close(); });
const settle = () => new Promise(resolve => setImmediate(resolve));

function clock() {
  let visible = true;
  const listeners = new Set(), timers = new Map();
  const environment = {
    isVisible: () => visible,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    schedule(callback, delay) {
      assert.equal(delay, 15000);
      const key = Symbol(); timers.set(key, callback);
      return () => timers.delete(key);
    },
  };
  return {
    environment, timers, listeners,
    visibility(value) { visible = value; for (const listener of listeners) listener(); },
    tick() { const callbacks = [...timers.values()]; timers.clear(); for (const callback of callbacks) callback(); },
  };
}

test('refreshes periodically, pauses hidden tabs and immediately refreshes on return', async () => {
  const fake = clock(); let calls = 0;
  const stop = startVisiblePolling(async () => { calls++; }, { environment: fake.environment });
  await settle(); assert.equal(calls, 1); assert.equal(fake.timers.size, 1);
  fake.tick(); await settle(); assert.equal(calls, 2);
  fake.visibility(false); fake.tick(); await settle();
  assert.equal(calls, 2); assert.equal(fake.timers.size, 0);
  fake.visibility(true); await settle(); assert.equal(calls, 3);
  stop(); assert.equal(fake.timers.size, 0); assert.equal(fake.listeners.size, 0);
});

test('never overlaps slow requests and coalesces returning visibility into one refresh', async () => {
  const fake = clock(); const pending = []; const signals = [];
  const stop = startVisiblePolling(signal => {
    signals.push(signal); return new Promise(resolve => pending.push(resolve));
  }, { environment: fake.environment });
  assert.equal(signals.length, 1); assert.equal(fake.timers.size, 0);
  fake.visibility(false); assert.equal(signals[0].aborted, true);
  fake.visibility(true); fake.visibility(true);
  assert.equal(signals.length, 1);
  pending.shift()(); await settle(); assert.equal(signals.length, 2);
  stop(); assert.equal(signals[1].aborted, true);
  pending.shift()(); await settle(); assert.equal(fake.timers.size, 0);
});

test('retries failed requests and cleanup prevents future refreshes', async () => {
  const fake = clock(); let calls = 0;
  const stop = startVisiblePolling(async () => { calls++; throw new Error('offline'); }, { environment: fake.environment });
  await settle(); fake.tick(); await settle(); assert.equal(calls, 2);
  stop(); fake.tick(); fake.visibility(false); fake.visibility(true); await settle();
  assert.equal(calls, 2);
});

test('can defer initial detail refresh and does not request anything while initially hidden', async () => {
  const fake = clock(); let calls = 0;
  const stop = startVisiblePolling(async () => { calls++; }, { immediate: false, environment: fake.environment });
  assert.equal(calls, 0); fake.tick(); await settle(); assert.equal(calls, 1); stop();
  fake.visibility(false);
  const stopHidden = startVisiblePolling(async () => { calls++; }, { environment: fake.environment });
  fake.tick(); assert.equal(calls, 1);
  fake.visibility(true); await settle(); assert.equal(calls, 2); stopHidden();
});
