import { fileURLToPath } from 'node:url';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

let server, sessionHome, SessionEntry, clearTabAuth;
const values = new Map();
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
before(async () => {
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  } });
  server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' });
  ({ sessionHome } = await server.ssrLoadModule(fileURLToPath(new URL("../../frontend-shared/src/app/sessionHome.ts", import.meta.url))));
  ({ SessionEntry } = await server.ssrLoadModule(fileURLToPath(new URL("../../frontend-shared/src/app/SessionEntry.tsx", import.meta.url))));
  ({ clearTabAuth } = await server.ssrLoadModule(fileURLToPath(new URL("../../frontend-shared/src/features/auth/services/authService.ts", import.meta.url))));
});
after(async () => {
  await server?.close();
  if (previousStorage) Object.defineProperty(globalThis, 'sessionStorage', previousStorage);
  else delete globalThis.sessionStorage;
});
const session = role => ({ role, token: 'test-token', username: 'test', fullName: 'Test', email: 'test@example.com' });

for (const [role, home] of [['admin', '/admin'], ['student', '/student'], ['faculty', '/dashboard']]) {
  test(`${role} returning to a login entry is routed to its own workspace without rendering the login form`, () => {
    values.clear();
    values.set('examflow_auth', JSON.stringify(session(role)));
    values.set('access_token', 'test-token');
    assert.equal(sessionHome(session(role), 'test-token'), home);
    const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/login'] },
      createElement(SessionEntry, null, createElement('p', null, 'LOGIN_FORM'))));
    assert.doesNotMatch(html, /LOGIN_FORM/);
  });
}
test('missing credentials and unrecognized roles do not redirect into a workspace', () => {
  assert.equal(sessionHome(null, 'test-token'), null);
  assert.equal(sessionHome(session('admin'), undefined), null);
  assert.equal(sessionHome(session('unknown'), 'test-token'), null);
});
test('clearing the session on logout allows the login form to appear again', () => {
  values.set('examflow_auth', JSON.stringify(session('admin')));
  values.set('access_token', 'test-token');
  values.set('refresh_token', 'test-refresh');
  clearTabAuth();
  assert.equal(values.size, 0);
  const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/login'] },
    createElement(SessionEntry, null, createElement('p', null, 'LOGIN_FORM'))));
  assert.match(html, /LOGIN_FORM/);
});
