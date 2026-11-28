'use strict';

process.env.TZ = process.env.TZ || 'Europe/Oslo';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createStoreFromEnv, createBriefStoreFromEnv, createJulegaveStoreFromEnv } = require('./lib/store');
const { createItem, applyFields, cleanExternalId } = require('./lib/items');
const { buildToday, recentDone } = require('./lib/today');
const { osloDate, osloWeekdayName } = require('./lib/dates');
const { upcomingEvents, eventSummary } = require('./lib/calendars');
const { normalizeBrief, applyBrief, briefFor } = require('./lib/briefs');
const { isCategory, CATEGORIES } = require('./public/shared/categories');
const auth = require('./lib/auth');
const julegave = require('./lib/julegave');

function loadSecrets() {
  const file = path.join(__dirname, 'secrets.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim();
  }
}
loadSecrets();

const publicDir = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; manifest-src 'self'; script-src 'self'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}

function send(res, status, body, extra) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...securityHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
    ...(extra || {}),
  });
  res.end(payload);
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100000) throw fail(413, 'Too big');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw fail(400, 'Bad JSON');
  }
}

function requireUser(req) {
  if (auth.bearerOk(req)) return 'token';
  if (auth.cookieOk(req)) {
    if (!auth.originOk(req)) throw fail(403, 'Blocked');
    return 'cookie';
  }
  throw fail(401, 'Locked');
}

const JULEGAVE_ORIGIN = 'https://simonpope82.github.io';

function julegaveCors(req) {
  const origin = req.headers.origin;
  if (origin !== JULEGAVE_ORIGIN) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function requireJulegaveUser(req) {
  if (auth.bearerOk(req)) return 'token';
  if (auth.julegaveSessionOk(req)) return 'session';
  throw fail(401, 'Locked');
}

async function loadJulegave(store) {
  try {
    return await store.load();
  } catch (err) {
    if (err && err.status === 503) throw err;
    return julegave.emptyDoc();
  }
}

async function julegaveApi(req, res, store, pathname) {
  const cors = julegaveCors(req);
  if (req.method === 'OPTIONS') {
    if (req.headers.origin && req.headers.origin !== JULEGAVE_ORIGIN) throw fail(403, 'Blocked');
    res.writeHead(204, { ...securityHeaders(), ...cors, 'Cache-Control': 'no-store' });
    return res.end();
  }

  if (req.method === 'GET' && pathname === '/api/julegave/status') {
    const doc = await loadJulegave(store);
    return send(res, 200, { pinSet: julegave.pinIsSet(doc) }, cors);
  }

  if (req.method === 'POST' && pathname === '/api/julegave/pin') {
    const limit = auth.rateLimit(`julegave:${auth.clientIp(req)}`);
    if (limit.blocked) throw fail(429, 'Wait a minute');
    const body = await readJson(req);
    let pin;
    try {
      pin = julegave.normalizePin(body.pin);
    } catch (err) {
      throw err;
    }
    let set = false;
    try {
      await store.update((draft) => {
        if (!julegave.pinIsSet(draft)) {
          draft.pinHash = julegave.hashPin(pin);
          set = true;
          return;
        }
        if (!julegave.verifyPin(pin, draft.pinHash)) throw fail(401, 'Wrong code');
        return { skip: true };
      });
    } catch (err) {
      if (err && err.status === 401) limit.fail();
      throw err;
    }
    return send(res, 200, { ok: true, token: auth.signJulegaveSession(), set }, cors);
  }

  if (req.method === 'PUT' && pathname === '/api/julegave/pin') {
    requireJulegaveUser(req);
    const limit = auth.rateLimit(`julegave-change:${auth.clientIp(req)}`);
    if (limit.blocked) throw fail(429, 'Wait a minute');
    const body = await readJson(req);
    const oldPin = julegave.normalizePin(body.oldPin);
    const newPin = julegave.normalizePin(body.newPin);
    let changed = false;
    try {
      await store.update((draft) => {
        if (!julegave.pinIsSet(draft)) throw fail(400, 'No PIN yet');
        if (!julegave.verifyPin(oldPin, draft.pinHash)) throw fail(401, 'Wrong code');
        draft.pinHash = julegave.hashPin(newPin);
        changed = true;
      });
    } catch (err) {
      if (err && err.status === 401) {
        limit.fail();
      }
      throw err;
    }
    if (!changed) throw fail(400, 'No PIN yet');
    return send(res, 200, { ok: true, token: auth.signJulegaveSession() }, cors);
  }

  if (pathname !== '/api/julegave') throw fail(404, 'Not found');
  requireJulegaveUser(req);

  if (req.method === 'GET') {
    const doc = await loadJulegave(store);
    return send(res, 200, julegave.publicView(doc), cors);
  }

  if (req.method === 'PUT') {
    const sheet = julegave.normalizeSheet(await readJson(req));
    const saved = await store.update((draft) => {
      draft.rows = sheet.rows;
      draft.cols = sheet.cols;
      draft.cells = sheet.cells;
      // pinHash is preserved on the draft automatically
    });
    return send(res, 200, julegave.publicView(saved), cors);
  }

  throw fail(405, 'No');
}

function safeFile(urlPath) {
  let decoded = urlPath;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const full = path.resolve(publicDir, `.${path.posix.normalize(`/${decoded}`)}`);
  if (full !== publicDir && !full.startsWith(`${publicDir}${path.sep}`)) return null;
  return full;
}

function cacheControl(filePath) {
  const base = path.basename(filePath);
  if (base === 'sw.js' || base === 'app.js' || base === 'app.css' || base === 'index.html') return 'no-cache';
  return 'public, max-age=86400';
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  const type = MIME[ext] || 'application/octet-stream';
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    ...securityHeaders(),
    'Content-Type': type,
    'Cache-Control': cacheControl(filePath),
    'Content-Length': body.length,
  });
  res.end(body);
}

function findItem(doc, id) {
  return doc.items.find((item) => item.id === id);
}

async function handle(req, res, store, briefs, julegaveStore) {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  if (req.method === 'GET' && pathname === '/health') {
    return send(res, 200, { ok: true });
  }
  if (req.method === 'GET' && pathname === '/robots.txt') {
    const body = 'User-agent: *\nDisallow: /\n';
    res.writeHead(200, { ...securityHeaders(), 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(body);
  }

  try {
    if (pathname.startsWith('/api/')) return await api(req, res, store, url, briefs, julegaveStore);
    if (req.method !== 'GET' && req.method !== 'HEAD') throw fail(405, 'No');
    const rel = pathname === '/' ? '/index.html' : pathname;
    const filePath = safeFile(rel);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      if (pathname === '/' || pathname === '/index.html') throw fail(404, 'Missing');
      throw fail(404, 'Not found');
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, { ...securityHeaders(), 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      return res.end();
    }
    return sendFile(res, filePath);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err.detail || err.message);
    if (!res.headersSent) {
      const extra = pathname.startsWith('/api/julegave') ? julegaveCors(req) : {};
      send(res, status, { error: status >= 500 ? 'Something went wrong' : err.message }, extra);
    }
  }
}

async function api(req, res, store, url, briefs, julegaveStore) {
  const { pathname } = url;

  if (pathname === '/api/julegave' || pathname.startsWith('/api/julegave/')) {
    if (!julegaveStore) throw fail(503, 'Julegave store is not available');
    try {
      return await julegaveApi(req, res, julegaveStore, pathname);
    } catch (err) {
      if (err && err.status && err.status < 500) {
        return send(res, err.status, { error: err.message }, julegaveCors(req));
      }
      throw err;
    }
  }


  if (req.method === 'POST' && pathname === '/api/login') {
    if (!auth.originOk(req)) throw fail(403, 'Blocked');
    const limit = auth.rateLimit(auth.clientIp(req));
    if (limit.blocked) throw fail(429, 'Wait a minute');
    const body = await readJson(req);
    const pin = String(body.pin == null ? '' : body.pin).trim();
    const expected = String(process.env.APP_PIN || '');
    if (!expected || !auth.safeEqual(pin, expected)) {
      limit.fail();
      throw fail(401, 'Wrong code');
    }
    return send(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader(req, auth.signSession(), 60 * 24 * 60 * 60) });
  }

  if (req.method === 'POST' && pathname === '/api/logout') {
    return send(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader(req, '', 0) });
  }

  requireUser(req);

  if (req.method === 'GET' && pathname === '/api/me') return send(res, 200, { ok: true });
  if (req.method === 'GET' && pathname === '/api/categories') return send(res, 200, { categories: CATEGORIES });

  if (req.method === 'POST' && pathname === '/api/parse') {
    const { parseItem } = require('./lib/parse');
    const body = await readJson(req);
    return send(res, 200, parseItem(body.text || '', { now: new Date() }));
  }

  if (req.method === 'GET' && pathname === '/api/today') {
    const doc = await store.load();
    const now = new Date();
    const view = buildToday(doc.items, now);
    view.weekday = osloWeekdayName(now);
    view.events = [];
    try {
      const calendar = await upcomingEvents(now);
      view.events = calendar.events;
      if (calendar.error) view.calendarError = calendar.error;
      if (calendar.events.length) view.summary = view.summary.concat(calendar.events.map(eventSummary));
    } catch {
      view.calendarError = 'Calendar not loaded';
    }
    view.brief = null;
    try {
      if (briefs) view.brief = briefFor(await briefs.load(), view.date);
    } catch {
      view.brief = null;
    }
    return send(res, 200, view);
  }

  if (pathname === '/api/brief' && req.method === 'GET') {
    const date = url.searchParams.get('date') || osloDate(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail(400, 'Bad date');
    const doc = briefs ? await briefs.load() : { days: [] };
    return send(res, 200, { brief: briefFor(doc, date) });
  }

  if (pathname === '/api/brief' && req.method === 'POST') {
    if (!briefs) throw fail(503, 'Brief store is not available');
    const body = await readJson(req);
    const brief = normalizeBrief(body);
    await briefs.update((draft) => {
      const next = applyBrief(draft, brief);
      draft.v = next.v;
      draft.days = next.days;
      draft.updatedAt = next.updatedAt;
    });
    return send(res, 200, { brief });
  }

  if (req.method === 'GET' && pathname === '/api/items') {
    const doc = await store.load();
    let items = doc.items.slice();
    const done = url.searchParams.get('done');
    if (done === 'true') items = items.filter((item) => item.done);
    if (done === 'false') items = items.filter((item) => !item.done);
    const category = url.searchParams.get('category');
    if (category) {
      if (!isCategory(category)) throw fail(400, 'Unknown group');
      items = items.filter((item) => item.category === category);
    }
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (from) items = items.filter((item) => item.due && item.due >= from);
    if (to) items = items.filter((item) => item.due && item.due <= to);
    items.sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')));
    const today = osloDate(new Date());
    return send(res, 200, { items, recentDone: recentDone(doc.items, today, 30) });
  }

  const one = pathname.match(/^\/api\/items\/([0-9a-f-]{36})$/i);

  if (req.method === 'POST' && pathname === '/api/items') {
    const body = await readJson(req);
    const now = new Date();
    const externalId = cleanExternalId(body.externalId);
    let created = true;
    let item = null;
    await store.update((draft) => {
      if (externalId) {
        const existing = draft.items.find((row) => row.externalId === externalId);
        if (existing) {
          item = existing;
          created = false;
          return { skip: true };
        }
      }
      item = createItem(body, now);
      draft.items.push(item);
    });
    return send(res, created ? 201 : 200, { item });
  }

  if (one && req.method === 'GET') {
    const doc = await store.load();
    const item = findItem(doc, one[1]);
    if (!item) throw fail(404, 'Not found');
    return send(res, 200, { item });
  }

  if (one && req.method === 'PATCH') {
    const body = await readJson(req);
    const now = new Date();
    let updated = null;
    await store.update((draft) => {
      const item = findItem(draft, one[1]);
      if (!item) return;
      applyFields(item, body, now);
      updated = item;
    });
    if (!updated) throw fail(404, 'Not found');
    const doc = await store.load();
    return send(res, 200, { item: findItem(doc, one[1]) });
  }

  if (one && req.method === 'DELETE') {
    let removed = false;
    await store.update((draft) => {
      const before = draft.items.length;
      draft.items = draft.items.filter((item) => item.id !== one[1]);
      removed = draft.items.length !== before;
    });
    if (!removed) throw fail(404, 'Not found');
    return send(res, 200, { ok: true });
  }

  throw fail(404, 'Not found');
}

function listen(store, port, host, briefStore, julegaveStore) {
  const briefs = briefStore || createBriefStoreFromEnv();
  const gifts = julegaveStore || createJulegaveStoreFromEnv();
  const server = http.createServer((req, res) => {
    handle(req, res, store, briefs, gifts).catch((err) => {
      console.error(err);
      if (!res.headersSent) send(res, 500, { error: 'Something went wrong' });
    });
  });
  const where = host || process.env.HOST || '0.0.0.0';
  return new Promise((resolve) => {
    server.listen(Number(port), where, () => resolve(server));
  });
}

async function main() {
  try {
    auth.assertSecrets();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  let store;
  try {
    store = createStoreFromEnv();
    await store.ready();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const port = Number(process.env.PORT || 3000);
  const server = await listen(store, port);
  console.log(`My Day on :${server.address().port} (store: ${store.kind})`);
}

if (require.main === module) main();

module.exports = { handle, listen, main };
