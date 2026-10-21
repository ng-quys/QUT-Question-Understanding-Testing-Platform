import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server, splitDateTime24, joinDateTime24, isBeforeDateTimeMinimum, DateTime24Field;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' });
  ({ splitDateTime24, joinDateTime24, isBeforeDateTimeMinimum } = await server.ssrLoadModule('/src/shared/components/dateTime24.ts'));
  ({ DateTime24Field } = await server.ssrLoadModule('/src/shared/components/DateTime24Field.tsx'));
});
after(async () => { await server?.close(); });

test('afternoon time is preserved as 13:00 without converting the local date or timezone', () => {
  const parts = splitDateTime24('2026-10-21T13:00:00');
  assert.deepEqual(parts, { date: '2026-10-21', hour: '13', minute: '00' });
  assert.equal(joinDateTime24(parts), '2026-10-21T13:00');
});

test('midnight and the last minute of the day are valid but 24:00 and minute 60 are rejected', () => {
  for (const time of ['00:00', '23:59']) assert.equal(joinDateTime24(splitDateTime24(`2026-10-21T${time}`)), `2026-10-21T${time}`);
  assert.equal(joinDateTime24({ date: '2026-10-21', hour: '24', minute: '00' }), '');
  assert.equal(joinDateTime24({ date: '2026-10-21', hour: '13', minute: '60' }), '');
  assert.equal(joinDateTime24({ date: '', hour: '13', minute: '00' }), '');
  assert.equal(joinDateTime24({ date: '2026-10-21', hour: '', minute: '00' }), '');
});

test('minimum compares the full local date and time including an exam crossing midnight', () => {
  assert.equal(isBeforeDateTimeMinimum('2026-10-21T12:59', '2026-10-21T13:00'), true);
  assert.equal(isBeforeDateTimeMinimum('2026-10-21T13:00', '2026-10-21T13:00'), false);
  assert.equal(isBeforeDateTimeMinimum('2026-10-22T00:30', '2026-10-21T23:30'), false);
  assert.equal(isBeforeDateTimeMinimum('', '2026-10-21T13:00'), false);
});

test('editing keeps named form data in the existing API format and renders a selected 24-hour value', () => {
  const html = renderToStaticMarkup(createElement(DateTime24Field, { name: 'endTime', label: 'Kết thúc', value: '2026-10-21T13:00', min: '2026-10-21T12:00', required: true, onChange() {} }));
  assert.match(html, /type="date"/);
  assert.match(html, /min="2026-10-21"/);
  assert.match(html, /class="time-picker-trigger has-value"/);
  assert.match(html, /13:00/);
  assert.match(html, /popover="auto"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /type="hidden" name="endTime" value="2026-10-21T13:00"/);
  assert.doesNotMatch(html, /datetime-local|AM|PM|SA|CH/);
  assert.doesNotMatch(html, /<select /);
});
