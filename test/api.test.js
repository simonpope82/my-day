'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFileStore } = require('../lib/store');
const { listen } = require('../server');
const { resetRateLimit } = require('../lib/auth');

process.env.APP_PIN = '258013';
process.env.API_TOKEN = 'assistant-token-test-123';
process.env.SESSION_SECRET = 'session-secret-test-123';
delete process.env.GITHUB_TOKEN;
delete process.env.COOKIE_SECURE;

const file = path.join(os.tmpdir(), `myday-${process.pid}.json`);
let server;
let base;

test.before(async () => {
  resetRateLimit();
  const store = createFileStore(file);
  server = await listen(store, 0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(file, { force: true });
});

function authHeaders(extra) {
  return {
    Authorization: `Bearer ${process.env.API_TOKEN}`,
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
}

test('health is public and today is locked', async () => {
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
  const today = await fetch(`${base}/api/today`);
  assert.equal(today.status, 401);
  const html = await fetch(`${base}/`);
  const text = await html.text();
  assert.match(text, /My Day/);
  assert.equal(text.includes('electricity'), false);
  assert.match(text, /manifest.webmanifest/);
});

test('wrong code and right code', async () => {
  const wrong = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Host: new URL(base).host },
    body: JSON.stringify({ pin: '0000' }),
  });
  assert.equal(wrong.status, 401);
  const right = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Host: new URL(base).host },
    body: JSON.stringify({ pin: process.env.APP_PIN }),
  });
  assert.equal(right.status, 200);
  const cookie = right.headers.get('set-cookie') || '';
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /myday=/);
  const me = await fetch(`${base}/api/me`, { headers: { cookie: cookie.split(';')[0] } });
  assert.equal(me.status, 200);
});

test('assistant can add, read today, tick, and the file keeps it', async () => {
  const added = await fetch(`${base}/api/items`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text: 'pay electricity bill friday 1200kr' }),
  });
  assert.equal(added.status, 201);
  const { item } = await added.json();
  assert.equal(item.category, 'bills');
  assert.equal(item.amount, 1200);
  assert.equal(item.done, false);

  const today = await fetch(`${base}/api/today`, { headers: authHeaders() });
  const view = await today.json();
  assert.ok(view.summary.some((line) => line.includes(item.title)));

  const patched = await fetch(`${base}/api/items/${item.id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ done: true }),
  });
  assert.equal(patched.status, 200);
  const after = (await patched.json()).item;
  assert.equal(after.done, true);

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(raw.items.find((row) => row.id === item.id).done, true);

  const again = createFileStore(file);
  const loaded = await again.load();
  assert.equal(loaded.items.find((row) => row.id === item.id).done, true);
});

test('category override, open list, and cross-site cookie block', async () => {
  const added = await fetch(`${base}/api/items`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text: 'buy milk', category: 'family' }),
  });
  const { item } = await added.json();
  assert.equal(item.category, 'family');
  const open = await fetch(`${base}/api/items?done=false&category=family`, { headers: authHeaders() });
  const body = await open.json();
  assert.ok(body.items.some((row) => row.id === item.id));

  const login = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: process.env.APP_PIN }),
  });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const blocked = await fetch(`${base}/api/items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie,
      Origin: 'https://evil.test',
      Host: new URL(base).host,
    },
    body: JSON.stringify({ text: 'stolen' }),
  });
  assert.equal(blocked.status, 403);
});

test('email externalId is kept once, even after it is done', async () => {
  const payload = {
    title: 'Please reply',
    category: 'email',
    source: 'gmail',
    externalId: 'gmail:abc',
    link: 'https://mail.google.com/mail/u/0/#inbox/abc',
  };
  const first = await fetch(`${base}/api/items`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  assert.equal(first.status, 201);
  const created = (await first.json()).item;
  assert.equal(created.category, 'email');
  assert.equal(created.link, payload.link);
  await fetch(`${base}/api/items/${created.id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ done: true }),
  });
  const second = await fetch(`${base}/api/items`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ ...payload, title: 'A different title' }),
  });
  assert.equal(second.status, 200);
  const again = (await second.json()).item;
  assert.equal(again.id, created.id);
  assert.equal(again.done, true);
  assert.equal(again.title, 'Please reply');
  const today = await fetch(`${base}/api/today`, { headers: authHeaders() });
  const view = await today.json();
  assert.equal(view.today.some((item) => item.id === created.id), false);
  const bad = await fetch(`${base}/api/items`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title: 'Nope', link: 'javascript:alert(1)' }),
  });
  assert.equal(bad.status, 400);
});

test('repeat tick advances and undo restores', async () => {
  const added = await fetch(`${base}/api/items`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text: 'trening hver uke' }),
  });
  const { item } = await added.json();
  assert.equal(item.repeat, 'weekly');
  const next = await fetch(`${base}/api/items/${item.id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ done: true }),
  });
  const moved = (await next.json()).item;
  assert.equal(moved.done, false);
  assert.notEqual(moved.due, item.due);
  const undone = await fetch(`${base}/api/items/${item.id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ done: false, undo: true }),
  });
  assert.equal((await undone.json()).item.due, item.due);
});
