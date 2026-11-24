'use strict';

const fs = require('fs');
const path = require('path');
const ical = require('node-ical');
const { osloDate, addDays } = require('./dates');

const OK_TTL = 15 * 60 * 1000;
const ERR_TTL = 2 * 60 * 1000;
const PALETTE = ['#1d5fd0', '#c23b6e', '#0e8a52', '#5b3cc4', '#0c7c86', '#c65d12'];
const cache = new Map();

function pad(n) {
  return String(n).padStart(2, '0');
}

function ymdLocal(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function hmLocal(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localMidnight(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function decodeMaybeB64(value) {
  const text = String(value).trim();
  if (/^[{[<]/.test(text) || /^(https?|webcal):\/\//i.test(text)) return text;
  try {
    const decoded = Buffer.from(text, 'base64').toString('utf8');
    if (/^[{[<]/.test(decoded.trim()) || /BEGIN:VCALENDAR/.test(decoded) || /https?:\/\//.test(decoded)) return decoded;
  } catch { /* keep the original text */ }
  return text;
}

function readFamilyData() {
  if (process.env.FAMILY_DATA_JSON) return decodeMaybeB64(process.env.FAMILY_DATA_JSON);
  const secretsDir = process.env.SECRETS_DIR || '/etc/secrets';
  for (const file of [path.join(secretsDir, 'family-data.json'), path.join(process.cwd(), 'config', 'family-data.json')]) {
    try {
      if (fs.statSync(file).isFile()) return fs.readFileSync(file, 'utf8');
    } catch { /* try the next place */ }
  }
  return '';
}

function splitUrls(text) {
  return String(text)
    .split(/\s*(?:\n|,(?=\s*(?:https?:|webcal:)))\s*/i)
    .map((part) => part.trim())
    .filter((part) => /^(https?|webcal):\/\//i.test(part));
}

function sourcesFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  if (raw.startsWith('{') || raw.startsWith('[')) {
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : (data.calendars || []);
    if (!Array.isArray(list)) return [];
    return list.filter((cal) => cal && cal.url && cal.enabled !== false).map((cal, index) => ({
      id: String(cal.id || `cal-${index + 1}`),
      name: String(cal.name || `Calendar ${index + 1}`).slice(0, 40),
      url: String(cal.url).trim(),
      color: cal.color || PALETTE[index % PALETTE.length],
    }));
  }
  return splitUrls(raw).map((url, index) => ({
    id: `cal-${index + 1}`,
    name: `Calendar ${index + 1}`,
    url,
    color: PALETTE[index % PALETTE.length],
  }));
}

function configuredCalendars(text) {
  return sourcesFromText(text == null ? readFamilyData() : text);
}

function expandIcs(parsed, from, to) {
  const out = [];
  for (const key of Object.keys(parsed || {})) {
    const ev = parsed[key];
    if (!ev || ev.type !== 'VEVENT' || !ev.start) continue;
    if (ev.status === 'CANCELLED') continue;
    const allDay = ev.datetype === 'date' || ev.start.dateOnly === true;
    const dur = ev.end ? ev.end - ev.start : (allDay ? 86400000 : 3600000);
    const push = (start, src, endOverride, allDayOverride) => {
      const end = endOverride || new Date(start.getTime() + (src.end && src.start ? src.end - src.start : dur));
      if (end <= from || start >= to) return;
      const summary = src.summary && src.summary.val != null ? src.summary.val : src.summary;
      const location = src.location && src.location.val != null ? src.location.val : src.location;
      out.push({
        start,
        end,
        allDay: allDayOverride ?? allDay,
        title: String(summary || 'Event').replace(/\s+/g, ' ').trim().slice(0, 160),
        location: String(location || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      });
    };
    if (ev.rrule) {
      let dates = [];
      try {
        dates = ev.rrule.between(new Date(from.getTime() - dur - 86400000), new Date(to.getTime() + 86400000), true);
      } catch { dates = []; }
      for (const occurrence of dates) {
        const dayKey = occurrence.toISOString().slice(0, 10);
        if (ev.exdate && (ev.exdate[dayKey] || ev.exdate[occurrence.toISOString()])) continue;
        let start;
        if (allDay) start = new Date(occurrence.getUTCFullYear(), occurrence.getUTCMonth(), occurrence.getUTCDate());
        else {
          start = new Date(
            occurrence.getFullYear(),
            occurrence.getMonth(),
            occurrence.getDate(),
            ev.start.getHours(),
            ev.start.getMinutes()
          );
        }
        const override = ev.recurrences && ev.recurrences[dayKey];
        if (override) {
          if (override.status !== 'CANCELLED') push(new Date(override.start), override);
          continue;
        }
        push(start, ev);
      }
    } else {
      let start = new Date(ev.start);
      if (allDay) start = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const end = ev.end ? new Date(ev.end) : null;
      if (!allDay && end && dur >= 20 * 3600000 && start.getHours() <= 3 && end.getHours() <= 3 && start.getMinutes() === 0 && end.getMinutes() === 0) {
        push(new Date(start.getFullYear(), start.getMonth(), start.getDate()), ev, new Date(end.getFullYear(), end.getMonth(), end.getDate()), true);
      } else push(start, ev);
    }
  }
  return out;
}

function toEvent(cal, item, index) {
  const date = ymdLocal(item.start);
  return {
    id: `${cal.id}-${date}-${item.allDay ? 'day' : hmLocal(item.start)}-${index}`,
    title: item.title,
    date,
    start: item.allDay ? null : hmLocal(item.start),
    end: item.allDay ? null : hmLocal(item.end),
    allDay: !!item.allDay,
    calendar: cal.name,
    color: cal.color,
    location: item.location || '',
  };
}

async function fetchCalendar(url, fetchImpl) {
  const hit = cache.get(url);
  const ttl = hit && hit.error && !hit.text ? ERR_TTL : OK_TTL;
  if (hit && Date.now() - hit.at < ttl) return hit;
  const href = url.replace(/^webcal:\/\//i, 'https://');
  try {
    const res = await fetchImpl(href, {
      headers: { 'User-Agent': 'MyDay/1.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Not an iCal file');
    const entry = { at: Date.now(), text, error: null };
    cache.set(url, entry);
    return entry;
  } catch (err) {
    if (hit && hit.text) return { ...hit, error: 'Calendar did not load' };
    const entry = { at: Date.now(), text: '', error: 'Calendar did not load' };
    cache.set(url, entry);
    return entry;
  }
}

async function upcomingEvents(now = new Date(), opts = {}) {
  const fetchImpl = (opts && opts.fetchImpl) || globalThis.fetch;
  let sources = [];
  try {
    sources = configuredCalendars(opts && Object.prototype.hasOwnProperty.call(opts, 'text') ? opts.text : undefined);
  } catch {
    return { events: [], error: 'Calendar settings are not valid' };
  }
  if (!sources.length) return { events: [], error: null };
  const today = osloDate(now);
  const until = addDays(today, 7);
  const from = localMidnight(today);
  const to = localMidnight(addDays(today, 8));
  const failed = [];
  const parsed = [];
  await Promise.all(sources.map(async (cal) => {
    const got = await fetchCalendar(cal.url, fetchImpl);
    if (!got.text) {
      failed.push(cal.name);
      return;
    }
    try {
      parsed.push({ cal, data: ical.sync.parseICS(got.text) });
    } catch {
      failed.push(cal.name);
    }
    if (got.error) failed.push(cal.name);
  }));
  const events = [];
  for (const { cal, data } of parsed) {
    let index = 0;
    for (const item of expandIcs(data, from, to)) {
      const event = toEvent(cal, item, index);
      index += 1;
      if (event.date < today || event.date > until) continue;
      events.push(event);
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || String(a.start || '').localeCompare(String(b.start || '')) || a.title.localeCompare(b.title));
  const names = [...new Set(failed)];
  return {
    events,
    error: names.length ? 'Calendar not loaded' : null,
  };
}

function eventSummary(event) {
  const when = event.allDay ? 'all day' : [event.start, event.end].filter(Boolean).join('–');
  const who = event.calendar ? ` · ${event.calendar}` : '';
  return `Event: ${event.date} · ${when} · ${event.title}${who}`;
}

function clearCalendarCache() {
  cache.clear();
}

module.exports = {
  sourcesFromText,
  expandIcs,
  upcomingEvents,
  eventSummary,
  clearCalendarCache,
  ymdLocal,
};
