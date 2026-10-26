import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('warning session status follows Vietnam schedule and preserves explicit closure', async () => {
  const server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' });
  try {
    const { warningSessionStage: stage } = await server.ssrLoadModule(fileURLToPath(new URL('../src/features/admin/components/WarningSessionStatus.tsx', import.meta.url)));
    const start = '2026-10-22T13:40:00', end = '2026-10-22T20:00:00';
    assert.equal(stage('scheduled', start, end, Date.parse('2026-10-22T13:39:59+07:00')), 'scheduled');
    assert.equal(stage('scheduled', start, end, Date.parse('2026-10-22T13:40:00+07:00')), 'ongoing');
    assert.equal(stage('scheduled', start, end, Date.parse('2026-10-22T16:00:00+07:00')), 'ongoing');
    assert.equal(stage('scheduled', start, end, Date.parse('2026-10-22T20:00:00+07:00')), 'completed');
    assert.equal(stage('cancelled', start, end, Date.parse('2026-10-22T16:00:00+07:00')), 'cancelled');
    assert.equal(stage('completed', start, end, Date.parse('2026-10-22T16:00:00+07:00')), 'completed');
    assert.equal(stage('scheduled', '', '', 0), 'scheduled');
  } finally { await server.close(); }
});
