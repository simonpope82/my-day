'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createGithubStore } = require('../lib/store');

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() { return JSON.stringify(body); },
  };
}

test('github store creates a missing file and retries a conflict', async () => {
  let sha = null;
  let doc = null;
  let puts = 0;
  const fetchImpl = async (url, options = {}) => {
    if (!url.includes('/contents/')) return response(200, { private: true });
    if (options.method === 'PUT') {
      puts += 1;
      const body = JSON.parse(options.body);
      if (puts === 2) return response(409, { message: 'sha' });
      doc = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
      sha = `sha-${puts}`;
      return response(200, { content: { sha } });
    }
    if (!doc) return response(404, { message: 'Not Found' });
    return response(200, {
      sha,
      content: Buffer.from(JSON.stringify(doc)).toString('base64'),
    });
  };
  const store = createGithubStore({
    repo: 'simonpope82/my-day',
    branch: 'data',
    filePath: 'items.json',
    token: 'test-token',
    fetchImpl,
  });
  await store.ready();
  assert.equal((await store.load()).items.length, 0);
  const saved = await store.update((draft) => {
    draft.items.push({ id: '1', title: 'Milk', done: false });
  });
  assert.equal(saved.items[0].title, 'Milk');
  assert.ok(puts >= 3);
  const again = await store.load();
  assert.equal(again.items.length, 1);
});

test('missing data branch is an error, not an empty list', async () => {
  const fetchImpl = async (url) => {
    if (!url.includes('/contents/')) return response(200, { private: true });
    return response(404, { message: 'No commit found for the ref data' });
  };
  const store = createGithubStore({
    repo: 'simonpope82/my-day',
    branch: 'data',
    filePath: 'items.json',
    token: 'test-token',
    fetchImpl,
  });
  await assert.rejects(() => store.ready(), /branch/i);
});
