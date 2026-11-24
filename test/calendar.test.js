'use strict';

process.env.TZ = 'Europe/Oslo';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ical = require('node-ical');
const { sourcesFromText, upcomingEvents, eventSummary, clearCalendarCache } = require('../lib/calendars');
const { createFileStore } = require('../lib/store');
const { listen } = require('../server');
const { resetRateLimit } = require('../lib/auth');

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//MyDay test//EN
BEGIN:VEVENT
UID:once@test
DTSTART:20261124T083000Z
DTEND:20261124T093000Z
SUMMARY:Dentist
END:VEVENT
BEGIN:VEVENT
UID:weekly@test
DTSTART;TZID=Europe/Oslo:20261102T180000
DTEND;TZID=Europe/Oslo:20261102T193000
RRULE:FREQ=WEEKLY;BYDAY=MO
SUMMARY:Handball
END:VEVENT
BEGIN:VEVENT
UID:allday@test
DTSTART;VALUE=DATE:20261125
DTEND;VALUE=DATE:20261126
SUMMARY:Nina away
END:VEVENT
END:VCALENDAR
`;

const now = new Date('2026-11-24T07:00:00Z');

test('family JSON and a comma-separated list both become calendars', () => {
  const fromJson = sourcesFromText(JSON.stringify({
    calendars: [
      { id: 'tay', name: 'Tay', url: 'https://example.test/tay.ics', color: '#4f8cff', enabled: true },
      { name: 'Old', url: 'https://example.test/old.ics', enabled: false },
      { name: 'Nina', url: 'webcal://example.test/nina.ics' },
    ],
  }));
  assert.deepEqual(fromJson.map((cal) => cal.name), ['Tay', 'Nina']);
  assert.equal(fromJson[0].color, '#4f8cff');
  assert.equal(fromJson[1].url, 'webcal://example.test/nina.ics');
  const fromList = sourcesFromText('https://example.test/a.ics, https://example.test/b.ics');
  assert.equal(fromList.length, 2);
  assert.equal(fromList[1].url, 'https://example.test/b.ics');
});

test('expands today, all-day, and a weekly repeat in Oslo time', async () => {
  clearCalendarCache();
  let calls = 0;
  const result = await upcomingEvents(now, {
    text: 'https://example.test/family.ics',
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, async text() { return ICS; } };
    },
  });
  assert.equal(result.error, null);
  const dentist = result.events.find((event) => event.title === 'Dentist');
  const away = result.events.find((event) => event.title === 'Nina away');
  const ball = result.events.find((event) => event.title === 'Handball');
  assert.equal(dentist.date, '2026-11-24');
  assert.equal(dentist.start, '09:30');
  assert.equal(dentist.end, '10:30');
  assert.equal(dentist.allDay, false);
  assert.equal(away.date, '2026-11-25');
  assert.equal(away.allDay, true);
  assert.equal(away.start, null);
  assert.ok(ball);
  assert.equal(ball.date, '2026-11-30');
  assert.equal(ball.start, '18:00');
  assert.equal(ball.end, '19:30');
  assert.equal(result.events.some((event) => event.date === '2026-11-23'), false);
  assert.match(eventSummary(dentist), /Event: 2026-11-24 · 09:30–10:30 · Dentist/);

  const again = await upcomingEvents(now, {
    text: 'https://example.test/family.ics',
    fetchImpl: async () => { calls += 1; throw new Error('should be cached'); },
  });
  assert.equal(again.events.length, result.events.length);
  assert.equal(calls, 1);
});

test('a broken calendar leaves the tasks in place', async () => {
  clearCalendarCache();
  const previous = process.env.FAMILY_DATA_JSON;
  process.env.APP_PIN = '258013';
  process.env.API_TOKEN = 'assistant-token-test-123';
  process.env.SESSION_SECRET = 'session-secret-test-123';
  process.env.FAMILY_DATA_JSON = 'https://example.test/broken.ics';
  delete process.env.GITHUB_TOKEN;
  resetRateLimit();
  const file = path.join(os.tmpdir(), `myday-cal-${process.pid}.json`);
  const store = createFileStore(file);
  const realFetch = global.fetch;
  global.fetch = (url, opts) => {
    if (String(url).includes('example.test')) return Promise.reject(new Error('offline'));
    return realFetch(url, opts);
  };
  const server = await listen(store, 0, '127.0.0.1');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const added = await fetch(`${base}/api/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'buy milk' }),
    });
    assert.equal(added.status, 201);
    const today = await fetch(`${base}/api/today`, { headers: { Authorization: `Bearer ${process.env.API_TOKEN}` } });
    assert.equal(today.status, 200);
    const body = await today.json();
    assert.ok(body.today.some((item) => item.title === 'Buy milk') || body.summary.some((line) => line.includes('Buy milk')));
    assert.deepEqual(body.events, []);
    assert.equal(body.calendarError, 'Calendar not loaded');
  } finally {
    global.fetch = realFetch;
    if (previous == null) delete process.env.FAMILY_DATA_JSON;
    else process.env.FAMILY_DATA_JSON = previous;
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(file, { force: true });
    clearCalendarCache();
  }
});

test('node-ical can read the fixture', () => {
  const parsed = ical.sync.parseICS(ICS);
  assert.ok(Object.values(parsed).some((item) => item.summary === 'Handball' && item.rrule));
});
