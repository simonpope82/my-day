'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalizeBrief, applyBrief, briefFor } = require('../lib/briefs');
const { osloDate } = require('../lib/dates');
const { createFileStore } = require('../lib/store');
const { listen } = require('../server');
const { resetRateLimit } = require('../lib/auth');

const sample = {
  date: '2026-11-24',
  sections: [
    { key: 'jobs', title: 'Jobs', emoji: '💼', lines: [{ text: 'Electrician, Ås', link: 'https://example.com/job/1' }] },
    { key: 'weather', title: 'Weather', emoji: '🌧️', lines: [{ text: '6°. Rain this afternoon.' }, { text: 'Coat and boots.' }] },
    { key: 'parcels', title: 'Parcels', emoji: '📦', lines: [{ text: 'Posten Ås. Code 4821.' }] },
  ],
};

test('weather is stored first and old days are dropped', () => {
  const brief = normalizeBrief(sample);
  assert.deepEqual(brief.sections.map((section) => section.key), ['weather', 'parcels', 'jobs']);
  let doc = { v: 1, days: [] };
  for (let day = 1; day <= 16; day++) {
    const date = `2026-11-${String(day).padStart(2, '0')}`;
    doc = applyBrief(doc, { date, sections: brief.sections });
  }
  doc = applyBrief(doc, brief);
  assert.equal(doc.days.length, 14);
  assert.equal(doc.days[0].date, '2026-11-24');
  assert.equal(briefFor(doc, '2026-11-24').sections[0].key, 'weather');
  assert.equal(briefFor(doc, '2026-11-01'), null);
  assert.equal(brief.sections[2].lines[0].link, 'https://example.com/job/1');
});

test('a bad link is refused', () => {
  assert.throws(() => normalizeBrief({
    date: '2026-11-24',
    sections: [{ key: 'jobs', title: 'Jobs', lines: [{ text: 'Ad', link: 'javascript:alert(1)' }] }],
  }), /Bad link/);
});

test('posting a brief shows on today and the same date overwrites', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myday-brief-'));
  const items = path.join(dir, 'items.json');
  const briefs = path.join(dir, 'brief.json');
  process.env.APP_PIN = '258013';
  process.env.API_TOKEN = 'assistant-token-test-123';
  process.env.SESSION_SECRET = 'session-secret-test-123';
  process.env.BRIEF_FILE = briefs;
  delete process.env.GITHUB_TOKEN;
  resetRateLimit();
  const todayDate = osloDate(new Date());
  const morning = { ...sample, date: todayDate };
  const server = await listen(createFileStore(items), 0, '127.0.0.1');
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${process.env.API_TOKEN}`, 'Content-Type': 'application/json' };
  try {
    const locked = await fetch(`${base}/api/brief?date=${todayDate}`);
    assert.equal(locked.status, 401);
    const posted = await fetch(`${base}/api/brief`, { method: 'POST', headers, body: JSON.stringify(morning) });
    assert.equal(posted.status, 200);
    const again = await fetch(`${base}/api/brief`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...morning, sections: [{ key: 'weather', title: 'Weather', emoji: '☀️', lines: [{ text: 'Sunny. Light jacket.' }] }] }),
    });
    assert.equal(again.status, 200);
    const saved = await fetch(`${base}/api/brief?date=${todayDate}`, { headers });
    const body = await saved.json();
    assert.equal(body.brief.sections.length, 1);
    assert.equal(body.brief.sections[0].lines[0].text, 'Sunny. Light jacket.');
    const today = await fetch(`${base}/api/today`, { headers });
    const view = await today.json();
    assert.equal(view.brief.date, todayDate);
    assert.equal(view.brief.sections[0].key, 'weather');
    const missing = await fetch(`${base}/api/brief?date=2020-01-01`, { headers });
    assert.equal((await missing.json()).brief, null);
    const file = JSON.parse(fs.readFileSync(briefs, 'utf8'));
    assert.equal(file.days.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.BRIEF_FILE;
  }
});
