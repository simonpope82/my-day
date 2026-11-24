'use strict';

const { osloDate, addDays } = require('./dates');

function onOsloDay(stamp, day) {
  if (!stamp) return false;
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return false;
  return osloDate(date) === day;
}

function doneTodayEntries(items, today) {
  const rows = [];
  for (const item of items) {
    if (item.done && onOsloDay(item.doneAt, today)) {
      rows.push({ ...item, showDone: true });
      continue;
    }
    const history = Array.isArray(item.history) ? item.history : [];
    const hits = history.filter((h) => onOsloDay(h.doneAt, today));
    if (!hits.length) continue;
    const last = hits[hits.length - 1];
    rows.push({
      ...item,
      done: true,
      due: last.due || item.due,
      doneAt: last.doneAt,
      showDone: true,
      occurrenceDone: true,
    });
  }
  rows.sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)));
  return rows;
}

function byDue(a, b) {
  return String(a.due).localeCompare(String(b.due)) || String(a.createdAt).localeCompare(String(b.createdAt));
}

function buildToday(items, now) {
  const today = typeof now === 'string' ? now : osloDate(now || new Date());
  const until = addDays(today, 7);
  const open = items.filter((item) => !item.done);
  const overdue = open.filter((item) => item.due && item.due < today).sort(byDue);
  const todayItems = open
    .filter((item) => item.due === today || !item.due)
    .sort((a, b) => Number(!a.due) - Number(!b.due) || byDue(a, b));
  const upcoming = open.filter((item) => item.due && item.due > today && item.due <= until).sort(byDue);
  const doneToday = doneTodayEntries(items, today);
  const done = doneToday.length;
  const total = overdue.length + todayItems.length + done;
  return {
    date: today,
    timezone: 'Europe/Oslo',
    counts: { done, total, label: `${done} of ${total} done` },
    overdue,
    today: todayItems,
    upcoming,
    doneToday,
    summary: [
      ...overdue.map((item) => summaryLine('Late', item)),
      ...todayItems.map((item) => summaryLine('Today', item)),
      ...upcoming.map((item) => summaryLine('Soon', item)),
      ...doneToday.map((item) => summaryLine('Done', item)),
    ],
  };
}

function summaryLine(prefix, item) {
  const bits = [item.title];
  if (item.due) bits.push(item.due);
  if (item.amount != null) {
    const money = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 }).format(item.amount);
    bits.push(`${money} kr`);
  }
  if (item.repeat) bits.push(item.repeat);
  return `${prefix}: ${bits.join(' · ')}`;
}

function recentDone(items, today, withinDays) {
  const start = addDays(today, -(withinDays || 30));
  return items
    .filter((item) => item.done && item.doneAt && osloDate(new Date(item.doneAt)) >= start)
    .sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)));
}

module.exports = { buildToday, recentDone, onOsloDay };
