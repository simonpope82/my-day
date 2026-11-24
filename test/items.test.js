'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createItem, setDone } = require('../lib/items');
const { advanceDue, osloDate } = require('../lib/dates');
const { buildToday } = require('../lib/today');

const now = new Date('2026-11-24T07:00:00Z');

test('monthly advance keeps the original day after a short month', () => {
  assert.equal(advanceDue('2026-01-31', 'monthly', 31), '2026-02-28');
  assert.equal(advanceDue('2026-02-28', 'monthly', 31), '2026-03-31');
});

test('ticking a repeating item moves it forward and can be undone', () => {
  const item = createItem({ text: 'husleie hver måned den 31. 100kr' }, new Date('2026-01-10T08:00:00Z'));
  assert.equal(item.repeat, 'monthly');
  const firstDue = item.due;
  setDone(item, true, '2026-01-10T09:00:00Z');
  assert.equal(item.done, false);
  assert.notEqual(item.due, firstDue);
  assert.equal(item.history.length, 1);
  assert.equal(item.history[0].due, firstDue);
  setDone(item, false, '2026-01-10T10:00:00Z', { undo: true });
  assert.equal(item.due, firstDue);
  assert.equal(item.history.length, 0);
});

test('today view puts late items first and counts done', () => {
  const today = osloDate(now);
  const late = createItem({ text: 'pay electricity bill yesterday 1200kr' }, now);
  const dentist = createItem({ text: 'ring tannlege i dag' }, now);
  const soon = createItem({ text: 'eu-kontroll bil neste uke' }, now);
  const bins = createItem({ title: 'Take bins out', category: 'home', due: today }, now);
  setDone(bins, true, now.toISOString());
  const view = buildToday([late, dentist, soon, bins], now);
  assert.equal(view.overdue[0].title, late.title);
  assert.ok(view.today.some((item) => item.id === dentist.id));
  assert.ok(view.upcoming.some((item) => item.id === soon.id));
  assert.equal(view.doneToday.length, 1);
  assert.equal(view.counts.done, 1);
  assert.equal(view.counts.total, view.overdue.length + view.today.length + 1);
  assert.match(view.summary[0], /^Late:/);
});
