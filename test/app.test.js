import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const server = createApp().listen(0);
const base = () => `http://127.0.0.1:${server.address().port}`;

test('health', async () => {
  assert.deepEqual(await (await fetch(`${base()}/health`)).json(), { ok: true });
});

test('search requires q', async () => {
  assert.equal((await fetch(`${base()}/search`)).status, 400);
});

test('bad id rejected', async () => {
  assert.equal((await fetch(`${base()}/title/movie/abc`)).status, 400);
});

test.after(() => server.close());
