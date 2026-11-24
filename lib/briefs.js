'use strict';

const KEEP_DAYS = 14;
const ORDER = ['weather', 'birthdays', 'parcels', 'jobs'];
const DEFAULT_EMOJI = { weather: '🌤️', birthdays: '🎂', parcels: '📦', jobs: '💼' };

function bad(message) {
  const err = new Error(message);
  err.status = message === 'Bad date' || message === 'Bad link' || message === 'Need a section' ? 400 : 400;
  return err;
}

function cleanText(value, max) {
  return String(value || '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanLink(value) {
  if (value == null || String(value).trim() === '') return '';
  let url;
  try { url = new URL(String(value).trim()); } catch { throw bad('Bad link'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw bad('Bad link');
  if (url.href.length > 2000) throw bad('Bad link');
  return url.href;
}

function cleanLine(line) {
  const text = cleanText(line && line.text, 140);
  if (!text) return null;
  const link = cleanLink(line && line.link);
  return link ? { text, link } : { text };
}

function cleanSection(section, index) {
  const key = String((section && section.key) || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || `part-${index + 1}`;
  const title = cleanText(section && section.title, 40) || key;
  const emoji = Array.from(String((section && section.emoji) || DEFAULT_EMOJI[key] || '📌')).slice(0, 4).join('') || '📌';
  const lines = (Array.isArray(section && section.lines) ? section.lines : []).slice(0, 8).map(cleanLine).filter(Boolean);
  if (!lines.length) return null;
  return { key, title, emoji, lines };
}

function normalizeBrief(body) {
  const date = String((body && body.date) || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('Bad date');
  const raw = Array.isArray(body.sections) ? body.sections.slice(0, 8) : [];
  const sections = raw.map((section, index) => ({ section: cleanSection(section, index), index })).filter((row) => row.section);
  if (!sections.length) throw bad('Need a section');
  sections.sort((a, b) => {
    const ia = ORDER.indexOf(a.section.key);
    const ib = ORDER.indexOf(b.section.key);
    const oa = ia === -1 ? 100 + a.index : ia;
    const ob = ib === -1 ? 100 + b.index : ib;
    return oa - ob;
  });
  return { date, sections: sections.map((row) => row.section) };
}

function applyBrief(doc, brief) {
  const base = doc && Array.isArray(doc.days) ? doc : { v: 1, days: [] };
  const days = base.days.filter((day) => day && day.date !== brief.date);
  days.push({
    date: brief.date,
    updatedAt: new Date().toISOString(),
    sections: brief.sections,
  });
  days.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { v: 1, days: days.slice(0, KEEP_DAYS), updatedAt: new Date().toISOString() };
}

function briefFor(doc, date) {
  const day = ((doc && doc.days) || []).find((row) => row && row.date === date);
  if (!day) return null;
  return { date: day.date, sections: day.sections || [] };
}

module.exports = { normalizeBrief, applyBrief, briefFor, KEEP_DAYS };
