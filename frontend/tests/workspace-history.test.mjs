import { fileURLToPath } from 'node:url';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let server, action;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' });
  ({ workspaceHistoryAction: action } = await server.ssrLoadModule(fileURLToPath(new URL("../../frontend-shared/src/app/workspaceHistory.ts", import.meta.url))));
});
after(async () => { await server?.close(); });
for (const identity of ['admin:test', 'student:test']) {
  test(`${identity}: Back at the workspace boundary restores the home entry repeatedly`, () => {
    const floor = { identity, kind: 'floor' }, workspace = { identity, kind: 'workspace' };
    assert.equal(action(identity, null), 'seed');
    assert.equal(action(identity, null, floor), 'push');
    assert.equal(action(identity, identity, workspace), 'none');
    for (let i = 0; i < 4; i++) {
      assert.equal(action(identity, identity, floor), 'push');
      assert.equal(action(identity, identity, workspace), 'none');
    }
  });
}
test('refreshing or navigating within the workspace does not add duplicate boundary entries', () => {
  assert.equal(action('admin:test', null, { identity: 'admin:test', kind: 'workspace' }), 'none');
  assert.equal(action('admin:test', 'admin:test'), 'none');
});
test('logout disables the boundary and a different account gets its own boundary', () => {
  assert.equal(action(null, 'admin:test', { identity: 'admin:test', kind: 'floor' }), 'none');
  assert.equal(action('student:new', 'admin:test', { identity: 'admin:test', kind: 'floor' }), 'seed');
});
