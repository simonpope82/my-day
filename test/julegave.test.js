'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFileStore } = require('../lib/store');
const { listen } = require('../server');
const { resetRateLimit } = require('../lib/auth');
const { storeOptions, pinIsSet } = require('../lib/julegave');

process.env.APP_PIN = '258013';
process.env.API_TOKEN = 'assistant-token-test-123';
process.env.SESSION_SECRET = 'session-secret-test-123';
delete process.env.GITHUB_TOKEN;
delete process.env.COOKIE_SECURE;

const itemsFile = path.join(os.tmpdir(), `myday-items-${process.pid}.json`);
const giftFile = path.join(os.tmpdir(), `myday-julegave-${process.pid}.json`);
const briefFile = path.join(os.tmpdir(), `myday-brief-${process.pid}.json`);
let server;
let base;

test.before(async () => {
  resetRateLimit();
  const briefStore = createFileStore(briefFile, {
    empty: () => ({ v: 1, days: [] }),
    accept: (doc) => doc && Array.isArray(doc.days),
    message: 'test brief',
    ensureFile: false,
  });
  server = await listen(
    createFileStore(itemsFile),
    0,
    '127.0.0.1',
    briefStore,
    createFileStore(giftFile, storeOptions()),
  );
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(itemsFile, { force: true });
  fs.rmSync(giftFile, { force: true });
  fs.rmSync(briefFile, { force: true });
});

function tokenHeaders(extra) {
  return {
    Authorization: `Bearer ${process.env.API_TOKEN}`,
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
}

function sessionHeaders(token, extra) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
}

test('julegave status is public and starts with no PIN', async () => {
  const res = await fetch(`${base}/api/julegave/status`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { pinSet: false });
  const locked = await fetch(`${base}/api/julegave`);
  assert.equal(locked.status, 401);
});

test('julegave CORS allows GitHub Pages and blocks others', async () => {
  const ok = await fetch(`${base}/api/julegave/status`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://simonpope82.github.io',
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://simonpope82.github.io');
  assert.match(ok.headers.get('access-control-allow-headers') || '', /Authorization/i);
  const blocked = await fetch(`${base}/api/julegave/status`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.test' },
  });
  assert.equal(blocked.status, 403);
});

test('first PIN becomes the PIN, later checks it, and assistant token can read and write', async () => {
  const short = await fetch(`${base}/api/julegave/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '12' }),
  });
  assert.equal(short.status, 400);

  const set = await fetch(`${base}/api/julegave/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '2468' }),
  });
  assert.equal(set.status, 200);
  const setBody = await set.json();
  assert.equal(setBody.ok, true);
  assert.equal(setBody.set, true);
  assert.equal(typeof setBody.token, 'string');

  const status = await fetch(`${base}/api/julegave/status`);
  assert.deepEqual(await status.json(), { pinSet: true });

  const raw = JSON.parse(fs.readFileSync(giftFile, 'utf8'));
  assert.equal(pinIsSet(raw), true);
  assert.equal(String(raw.pinHash).includes('2468'), false);
  assert.match(raw.pinHash, /^scrypt\$/);

  const wrong = await fetch(`${base}/api/julegave/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '0000' }),
  });
  assert.equal(wrong.status, 401);

  const unlock = await fetch(`${base}/api/julegave/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '2468' }),
  });
  assert.equal(unlock.status, 200);
  const session = (await unlock.json()).token;
  assert.equal(typeof session, 'string');

  const empty = await fetch(`${base}/api/julegave`, { headers: sessionHeaders(session) });
  assert.equal(empty.status, 200);
  const emptyBody = await empty.json();
  assert.deepEqual(emptyBody.rows, []);
  assert.deepEqual(emptyBody.cols, []);
  assert.equal(emptyBody.pinHash, undefined);

  const sheet = {
    rows: [{ id: 'r1', name: 'Sophie' }],
    cols: [{ id: 'c1', name: 'Me & Nina' }],
    cells: {
      'r1:c1': { state: 'orange', text: 'Lego', price: 199, tip: '199 kr at Extra', tipLink: 'https://www.prisjakt.no/' },
    },
  };
  const put = await fetch(`${base}/api/julegave`, {
    method: 'PUT',
    headers: tokenHeaders(),
    body: JSON.stringify(sheet),
  });
  assert.equal(put.status, 200);
  const saved = await put.json();
  assert.equal(saved.pinHash, undefined);
  assert.equal(saved.rows[0].name, 'Sophie');
  assert.equal(saved.cells['r1:c1'].state, 'orange');
  assert.equal(saved.cells['r1:c1'].price, 199);

  const got = await fetch(`${base}/api/julegave`, { headers: sessionHeaders(session) });
  const again = await got.json();
  assert.equal(again.cells['r1:c1'].text, 'Lego');
  assert.equal(again.cells['r1:c1'].tip, '199 kr at Extra');

  const stolen = await fetch(`${base}/api/julegave`, {
    method: 'PUT',
    headers: tokenHeaders(),
    body: JSON.stringify({ ...sheet, pinHash: 'hack' }),
  });
  assert.equal(stolen.status, 200);
  const onDisk = JSON.parse(fs.readFileSync(giftFile, 'utf8'));
  assert.equal(onDisk.pinHash.startsWith('scrypt$'), true);
  assert.notEqual(onDisk.pinHash, 'hack');
});

test('changing the PIN needs the old PIN', async () => {
  const unlock = await fetch(`${base}/api/julegave/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '2468' }),
  });
  const token = (await unlock.json()).token;

  const badOld = await fetch(`${base}/api/julegave/pin`, {
    method: 'PUT',
    headers: sessionHeaders(token),
    body: JSON.stringify({ oldPin: '0000', newPin: '1357' }),
  });
  assert.equal(badOld.status, 401);

  const changed = await fetch(`${base}/api/julegave/pin`, {
    method: 'PUT',
    headers: tokenHeaders(),
    body: JSON.stringify({ oldPin: '2468', newPin: '1357' }),
  });
  assert.equal(changed.status, 200);
  const newToken = (await changed.json()).token;

  const oldPin = await fetch(`${base}/api/julegave/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '2468' }),
  });
  assert.equal(oldPin.status, 401);

  const next = await fetch(`${base}/api/julegave`, { headers: sessionHeaders(newToken) });
  assert.equal(next.status, 200);
});

test('julegave session cannot call My Day APIs', async () => {
  const unlock = await fetch(`${base}/api/julegave/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1357' }),
  });
  const token = (await unlock.json()).token;
  const today = await fetch(`${base}/api/today`, { headers: sessionHeaders(token) });
  assert.equal(today.status, 401);
});
