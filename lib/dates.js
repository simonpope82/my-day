'use strict';

const ZONE = 'Europe/Oslo';

function osloDate(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function osloWeekdayName(date) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, weekday: 'long' }).format(date);
}

function osloHour(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === 'hour').value);
}

function splitIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function makeDate(y, m, d) {
  const dim = daysInMonth(y, m);
  const day = Math.max(1, Math.min(d, dim));
  return `${y}-${pad(m)}-${pad(day)}`;
}

function addDays(iso, n) {
  const { y, m, d } = splitIso(iso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function weekday(iso) {
  const { y, m, d } = splitIso(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function nextWeekday(today, dow, opts) {
  const strictNext = !!(opts && opts.next);
  const cur = weekday(today);
  let delta = (dow - cur + 7) % 7;
  if (strictNext) delta = delta === 0 ? 7 : delta + 7;
  return addDays(today, delta);
}

function nextDayOfMonth(today, day) {
  let { y, m, d } = splitIso(today);
  if (day < d) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return makeDate(y, m, day);
}

function advanceDue(iso, repeat, monthDay) {
  if (!iso || !repeat) return iso;
  if (repeat === 'daily') return addDays(iso, 1);
  if (repeat === 'weekly') return addDays(iso, 7);
  const { y, m, d } = splitIso(iso);
  if (repeat === 'yearly') return makeDate(y + 1, m, monthDay || d);
  if (repeat === 'monthly') {
    let nm = m + 1;
    let ny = y;
    if (nm > 12) {
      nm = 1;
      ny += 1;
    }
    return makeDate(ny, nm, monthDay || d);
  }
  return iso;
}

module.exports = {
  ZONE,
  osloDate,
  osloWeekdayName,
  osloHour,
  addDays,
  weekday,
  nextWeekday,
  nextDayOfMonth,
  makeDate,
  advanceDue,
};
