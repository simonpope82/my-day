'use strict';

const crypto = require('crypto');

function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const right = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(left, right);
}

function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.API_TOKEN || '';
}

function signSession() {
  const body = Buffer.from(JSON.stringify({
    exp: Date.now() + 60 * 24 * 60 * 60 * 1000,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySession(token, audience) {
  if (!token || !sessionSecret()) return false;
  const text = String(token);
  const dot = text.indexOf('.');
  if (dot <= 0) return false;
  const body = text.slice(0, dot);
  const sig = text.slice(dot + 1);
  const expected = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof data.exp !== 'number' || data.exp <= Date.now()) return false;
    if (audience) return data.aud === audience;
    return data.aud == null || data.aud === 'myday';
  } catch {
    return false;
  }
}

function signJulegaveSession() {
  const body = Buffer.from(JSON.stringify({
    aud: 'julegave',
    exp: Date.now() + 60 * 24 * 60 * 60 * 1000,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function julegaveSessionOk(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(\S+)\s*$/i);
  if (!match) return false;
  return verifySession(match[1], 'julegave');
}

const attempts = new Map();

function rateLimit(ip) {
  const now = Date.now();
  let row = attempts.get(ip);
  if (!row || now > row.reset) {
    row = { fails: 0, reset: now + 10 * 60 * 1000 };
    attempts.set(ip, row);
  }
  return {
    blocked: row.fails >= 5,
    fail() { row.fails += 1; },
  };
}

function resetRateLimit() {
  attempts.clear();
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const key = part.slice(0, i).trim();
    if (!key) return;
    try { out[key] = decodeURIComponent(part.slice(i + 1).trim()); }
    catch { out[key] = part.slice(i + 1).trim(); }
  });
  return out;
}

function clientIp(req) {
  if (process.env.TRUST_PROXY === '1' || process.env.RENDER === 'true') {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || 'local';
}

function bearerOk(req) {
  const token = process.env.API_TOKEN || '';
  if (token.length < 16) return false;
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(\S+)\s*$/i);
  if (!match) return false;
  return safeEqual(match[1], token);
}

function cookieOk(req) {
  return verifySession(parseCookies(req.headers.cookie).myday);
}

function originOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  let host = '';
  try { host = new URL(origin).host; } catch { return false; }
  const expected = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  return host === expected;
}

function cookieHeader(req, value, maxAge) {
  const secure = process.env.COOKIE_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https';
  const parts = [`myday=${value}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function assertSecrets() {
  if ((process.env.APP_PIN || '').length < 4) {
    throw new Error('Set APP_PIN to at least 4 characters.');
  }
  if ((process.env.API_TOKEN || '').length < 16) {
    throw new Error('Set API_TOKEN to at least 16 characters.');
  }
}

module.exports = {
  safeEqual,
  signSession,
  signJulegaveSession,
  verifySession,
  rateLimit,
  resetRateLimit,
  clientIp,
  bearerOk,
  cookieOk,
  julegaveSessionOk,
  originOk,
  cookieHeader,
  assertSecrets,
};
