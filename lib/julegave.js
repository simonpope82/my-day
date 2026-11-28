'use strict';

const crypto = require('crypto');

const STATES = new Set(['red', 'orange', 'green', 'off']);

function emptyDoc() {
  return { v: 1, pinHash: '', rows: [], cols: [], cells: {}, updatedAt: null };
}

function accept(doc) {
  return Boolean(doc && Array.isArray(doc.rows) && Array.isArray(doc.cols) && doc.cells && typeof doc.cells === 'object' && !Array.isArray(doc.cells));
}

function storeOptions() {
  return {
    empty: emptyDoc,
    accept,
    message: 'my-day: update julegave',
    ensureFile: false,
  };
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizePin(value) {
  const pin = String(value == null ? '' : value).trim();
  if (!/^\d{4,8}$/.test(pin)) throw fail(400, 'PIN must be 4 to 8 digits');
  return pin;
}

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPin(pin, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !parts[1] || !parts[2]) return false;
  let check;
  try {
    check = crypto.scryptSync(String(pin), parts[1], 32, { N: 16384, r: 8, p: 1 });
  } catch {
    return false;
  }
  const expected = Buffer.from(parts[2], 'hex');
  if (expected.length !== check.length) return false;
  return crypto.timingSafeEqual(check, expected);
}

function cleanId(value) {
  return String(value == null ? '' : value).trim().slice(0, 80);
}

function cleanName(value) {
  return String(value == null ? '' : value).trim().slice(0, 80);
}

function cleanText(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function cleanLink(value) {
  const link = String(value == null ? '' : value).trim();
  if (!link) return '';
  try {
    const url = new URL(link);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString().slice(0, 500);
  } catch {
    return '';
  }
}

function cleanPrice(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100000000) return null;
  return Math.round(n * 100) / 100;
}

function normalizePeople(list, label) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw fail(400, `Bad ${label}`);
  const out = [];
  const seen = new Set();
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const id = cleanId(row.id);
    const name = cleanName(row.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name });
  }
  return out;
}

function normalizeCell(value) {
  const src = value && typeof value === 'object' ? value : {};
  const state = STATES.has(src.state) ? src.state : (src.status && STATES.has(src.status) ? src.status : 'red');
  return {
    state,
    text: cleanText(src.text, 200),
    price: cleanPrice(src.price),
    tip: cleanText(src.tip, 200),
    tipLink: cleanLink(src.tipLink),
  };
}

function normalizeCells(cells) {
  if (cells == null) return {};
  if (!cells || typeof cells !== 'object' || Array.isArray(cells)) throw fail(400, 'Bad cells');
  const out = {};
  for (const [key, value] of Object.entries(cells)) {
    const id = String(key || '').trim().slice(0, 160);
    if (!id.includes(':')) continue;
    out[id] = normalizeCell(value);
  }
  return out;
}

function normalizeSheet(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'Bad data');
  return {
    rows: normalizePeople(body.rows, 'rows'),
    cols: normalizePeople(body.cols, 'cols'),
    cells: normalizeCells(body.cells),
  };
}

function publicView(doc) {
  const src = accept(doc) ? doc : emptyDoc();
  return {
    v: 1,
    updatedAt: src.updatedAt || null,
    rows: Array.isArray(src.rows) ? src.rows : [],
    cols: Array.isArray(src.cols) ? src.cols : [],
    cells: src.cells && typeof src.cells === 'object' ? src.cells : {},
  };
}

function isEmptySheet(doc) {
  const view = publicView(doc);
  if (view.rows.length || view.cols.length) return false;
  return Object.keys(view.cells).length === 0;
}

function pinIsSet(doc) {
  return Boolean(doc && doc.pinHash);
}

module.exports = {
  STATES,
  emptyDoc,
  accept,
  storeOptions,
  normalizePin,
  hashPin,
  verifyPin,
  normalizeSheet,
  publicView,
  isEmptySheet,
  pinIsSet,
};
