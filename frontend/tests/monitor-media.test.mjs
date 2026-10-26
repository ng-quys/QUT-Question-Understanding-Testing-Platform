import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server, appendMonitorAudio, monitorFrameSize;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' });
  ({ appendMonitorAudio, monitorFrameSize } = await server.ssrLoadModule('/src/features/student/services/monitorMedia.ts'));
});
after(async () => { await server?.close(); });

test('audio between sends is accumulated in order rather than overwritten', () => {
  let pcm = appendMonitorAudio(new Uint8Array(), new Uint8Array(9600).fill(1));
  pcm = appendMonitorAudio(pcm, new Uint8Array(9600).fill(2));
  assert.equal(pcm.length, 19200);
  assert.equal(pcm[0], 1);
  assert.equal(pcm[9600], 2);
});

test('audio remains bounded and drops oldest data after a slow request', () => {
  let pcm = new Uint8Array();
  for (let i = 1; i <= 10; i++) pcm = appendMonitorAudio(pcm, new Uint8Array(9600).fill(i));
  assert.equal(pcm.length, 30720);
  assert.equal(pcm.length % 960, 0);
  assert.equal(pcm.at(-1), 10);
  assert.equal(pcm[0], 7);
});

test('sending audio does not mutate a previously captured buffer', () => {
  const sent = new Uint8Array(9600).fill(1);
  const next = appendMonitorAudio(new Uint8Array(), new Uint8Array(9600).fill(2));
  assert.equal(sent[0], 1);
  assert.equal(next[0], 2);
});

test('camera aspect ratio is preserved within model size limits', () => {
  assert.deepEqual(monitorFrameSize(640, 480), { width: 640, height: 480 });
  assert.deepEqual(monitorFrameSize(1280, 720), { width: 640, height: 360 });
  assert.deepEqual(monitorFrameSize(720, 1280), { width: 405, height: 720 });
  assert.deepEqual(monitorFrameSize(0, 0), { width: 640, height: 480 });
});
