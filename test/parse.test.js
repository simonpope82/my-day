'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseItem } = require('../lib/parse');
const { osloDate, addDays, nextWeekday, nextDayOfMonth } = require('../lib/dates');

const now = new Date('2026-11-24T07:00:00Z');
const today = osloDate(now);

function parse(text) {
  return parseItem(text, { now });
}

test('oslo date rolls over at local midnight', () => {
  assert.equal(osloDate(new Date('2026-11-24T22:30:00Z')), '2026-11-24');
  assert.equal(osloDate(new Date('2026-11-24T23:30:00Z')), '2026-11-25');
});

test('pay electricity bill friday 1200kr', () => {
  const item = parse('pay electricity bill friday 1200kr');
  assert.equal(item.title, 'Pay electricity bill');
  assert.equal(item.category, 'bills');
  assert.equal(item.amount, 1200);
  assert.equal(item.due, nextWeekday(today, 5));
  assert.equal(item.repeat, null);
});

test('ring tannlege i morgen', () => {
  const item = parse('ring tannlege i morgen');
  assert.equal(item.title, 'Ring tannlege');
  assert.equal(item.category, 'health');
  assert.equal(item.due, addDays(today, 1));
  assert.equal(item.amount, null);
});

test('keeps a real title that starts with på', () => {
  const item = parse('på hytta i morgen');
  assert.equal(item.title, 'På hytta');
  assert.equal(item.category, 'home');
  assert.equal(item.due, addDays(today, 1));
});

test('buy milk is a to-do with no date', () => {
  const item = parse('buy milk');
  assert.equal(item.title, 'Buy milk');
  assert.equal(item.category, 'todo');
  assert.equal(item.due, null);
});

test('family beats a generic to-do word', () => {
  const item = parse('hente barn i morgen');
  assert.equal(item.category, 'family');
  assert.equal(item.title, 'Hente barn');
  assert.equal(item.due, addDays(today, 1));
});

test('work meeting on monday', () => {
  const item = parse('møte med kunde mandag');
  assert.equal(item.category, 'work');
  assert.equal(item.title, 'Møte med kunde');
  assert.equal(item.due, nextWeekday(today, 1));
});

test('weekly training', () => {
  const item = parse('trening hver uke');
  assert.equal(item.category, 'health');
  assert.equal(item.repeat, 'weekly');
  assert.equal(item.due, today);
  assert.equal(item.title, 'Trening');
});

test('monthly insurance amount', () => {
  const item = parse('forsikring hver måned 450kr');
  assert.equal(item.category, 'bills');
  assert.equal(item.repeat, 'monthly');
  assert.equal(item.amount, 450);
  assert.equal(item.due, today);
  assert.equal(item.title, 'Forsikring');
});

test('money today', () => {
  const item = parse('betale 200 kr i dag');
  assert.equal(item.category, 'money');
  assert.equal(item.amount, 200);
  assert.equal(item.due, today);
  assert.equal(item.title, 'Betale');
});

test('thousands separator and decimal comma', () => {
  assert.equal(parse('1.200 kr faktura fredag').amount, 1200);
  assert.equal(parse('1.200 kr faktura fredag').category, 'bills');
  assert.equal(parse('1.200 kr faktura fredag').due, nextWeekday(today, 5));
  assert.equal(parse('99,50 kr apotek').amount, 99.5);
  assert.equal(parse('99,50 kr apotek').category, 'health');
  assert.equal(parse('kr 1 200 husleie').amount, 1200);
});

test('den 15 and numeric dates', () => {
  const rent = parse('husleie den 15. 8500 kr');
  assert.equal(rent.category, 'bills');
  assert.equal(rent.amount, 8500);
  assert.equal(rent.title, 'Husleie');
  assert.equal(rent.due, nextDayOfMonth(today, 15));
  const bill = parse('strømregning 15.11');
  assert.equal(bill.due, '2026-11-15');
  assert.equal(bill.category, 'bills');
  assert.equal(bill.amount, null);
});

test('car check next week', () => {
  const item = parse('eu-kontroll bil neste uke');
  assert.equal(item.category, 'home');
  assert.equal(item.due, addDays(today, 7));
  assert.equal(item.title, 'EU-kontroll bil');
});

test('neste fredag is the friday after the upcoming one', () => {
  const item = parse('neste fredag vipps 300 kr');
  assert.equal(item.due, nextWeekday(today, 5, { next: true }));
  assert.equal(item.category, 'money');
  assert.equal(item.amount, 300);
});

test('iso date and every weekday', () => {
  assert.equal(parse('jobb 2026-12-01').due, '2026-12-01');
  const item = parse('trening hver mandag');
  assert.equal(item.repeat, 'weekly');
  assert.equal(item.due, nextWeekday(today, 1));
  assert.equal(item.category, 'health');
});
