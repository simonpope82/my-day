'use strict';

const crypto = require('crypto');
const { isCategory } = require('../public/shared/categories');
const { osloDate, advanceDue } = require('./dates');
const { parseItem } = require('./parse');

const REPEATS = new Set(['daily', 'weekly', 'monthly', 'yearly']);

function bad(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function cleanTitle(value) {
  return String(value || '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function cleanLink(value) {
  if (value == null || String(value).trim() === '') return '';
  let url;
  try { url = new URL(String(value).trim()); } catch { throw bad('Bad link'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw bad('Bad link');
  if (url.href.length > 2000) throw bad('Bad link');
  return url.href;
}

function cleanSource(value) {
  return String(value || '').replace(/[\u0000-\u001F]/g, '').trim().slice(0, 40);
}

function cleanExternalId(value) {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u001F]/g, '').trim().slice(0, 200);
}

function parseAmountValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || value >= 1e9) throw bad('Bad amount');
    return Math.round(value * 100) / 100;
  }
  const text = String(value).trim();
  if (!text) return null;
  const parsed = parseItem(/kr|nok/i.test(text) ? text : `${text} kr`);
  if (parsed.amount == null) throw bad('Bad amount');
  return parsed.amount;
}

function setDone(item, done, nowIso, opts) {
  const undo = !!(opts && opts.undo);
  if (done) {
    if (item.done) return item;
    if (item.repeat) {
      const occDue = item.due || osloDate(new Date(nowIso));
      item.history = Array.isArray(item.history) ? item.history : [];
      item.history.push({ due: occDue, doneAt: nowIso });
      if (item.history.length > 30) item.history = item.history.slice(-30);
      item.lastDone = nowIso;
      item.due = advanceDue(occDue, item.repeat, item.monthDay);
      item.done = false;
      item.doneAt = null;
      return item;
    }
    item.done = true;
    item.doneAt = nowIso;
    return item;
  }
  if (item.done) {
    item.done = false;
    item.doneAt = null;
    return item;
  }
  if (undo && Array.isArray(item.history) && item.history.length) {
    const last = item.history.pop();
    if (last && last.due) item.due = last.due;
    item.lastDone = item.history.length ? item.history[item.history.length - 1].doneAt : null;
  }
  return item;
}

function applyFields(item, body, now) {
  if (body.title != null) {
    const title = cleanTitle(body.title);
    if (!title) throw bad('Need a title');
    item.title = title;
  }
  if (body.category != null) {
    if (!isCategory(body.category)) throw bad('Unknown group');
    item.category = body.category;
  }
  if (body.notes != null) item.notes = String(body.notes).replace(/[\u0000-\u0008]/g, '').slice(0, 2000);
  if (body.repeat !== undefined) {
    if (body.repeat == null || body.repeat === '' || body.repeat === 'none') item.repeat = null;
    else if (REPEATS.has(body.repeat)) item.repeat = body.repeat;
    else throw bad('Bad repeat');
  }
  if (body.due !== undefined && body.due !== null && body.due !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.due))) throw bad('Bad date');
    item.due = String(body.due);
    item.monthDay = Number(item.due.slice(8, 10));
  } else if (body.due === null || body.due === '') {
    item.due = null;
  }
  if (body.dueText) {
    const parsed = parseItem(String(body.dueText), { now });
    if (!parsed.due) throw bad('No date in that');
    item.due = parsed.due;
    item.monthDay = parsed.monthDay;
    if (parsed.repeat) item.repeat = parsed.repeat;
  }
  if (body.amount !== undefined) {
    const amount = parseAmountValue(body.amount);
    item.amount = amount;
    item.currency = amount == null ? null : 'NOK';
  }
  if (body.link !== undefined) item.link = cleanLink(body.link);
  if (body.source !== undefined) item.source = cleanSource(body.source);
  if (body.externalId !== undefined) item.externalId = cleanExternalId(body.externalId);
  if (body.done !== undefined) setDone(item, Boolean(body.done), now.toISOString(), { undo: Boolean(body.undo) });
  if (item.repeat && !item.due) {
    item.due = osloDate(now);
    item.monthDay = Number(item.due.slice(8, 10));
  }
  item.updatedAt = now.toISOString();
  return item;
}

function createItem(body, now) {
  const nowIso = now.toISOString();
  const text = body && body.text != null ? String(body.text) : '';
  const parsed = text.trim() ? parseItem(text, { now }) : {
    title: '',
    category: 'todo',
    due: null,
    amount: null,
    currency: null,
    repeat: null,
    monthDay: null,
  };
  const item = {
    id: crypto.randomUUID(),
    title: parsed.title,
    category: parsed.category,
    due: parsed.due,
    amount: parsed.amount,
    currency: parsed.currency,
    notes: '',
    repeat: parsed.repeat,
    monthDay: parsed.monthDay,
    done: false,
    doneAt: null,
    lastDone: null,
    history: [],
    link: '',
    source: '',
    externalId: '',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const patch = { ...body };
  delete patch.text;
  delete patch.done;
  delete patch.undo;
  if (!patch.title && item.title) delete patch.title;
  if (!patch.category) delete patch.category;
  applyFields(item, patch, now);
  if (!cleanTitle(item.title)) throw bad('Need words');
  if (!isCategory(item.category)) item.category = 'todo';
  return item;
}

function emptyDoc() {
  return { v: 1, items: [] };
}

module.exports = { createItem, applyFields, setDone, emptyDoc, cleanTitle, cleanExternalId };
