'use strict';

const { osloDate, addDays, nextWeekday, nextDayOfMonth, makeDate } = require('./dates');

const WEEKDAYS = [
  { dow: 0, names: ['sunday', 'søndag', 'sondag'] },
  { dow: 1, names: ['monday', 'mandag'] },
  { dow: 2, names: ['tuesday', 'tirsdag'] },
  { dow: 3, names: ['wednesday', 'onsdag'] },
  { dow: 4, names: ['thursday', 'torsdag'] },
  { dow: 5, names: ['friday', 'fredag'] },
  { dow: 6, names: ['saturday', 'lørdag', 'lordag'] },
];

const MONTHS = [
  ['januar', 'january', 'jan'],
  ['februar', 'february', 'feb'],
  ['mars', 'march', 'mar'],
  ['april', 'apr'],
  ['mai', 'may'],
  ['juni', 'june', 'jun'],
  ['juli', 'july', 'jul'],
  ['august', 'aug'],
  ['september', 'sep', 'sept'],
  ['oktober', 'october', 'okt', 'oct'],
  ['november', 'nov'],
  ['desember', 'december', 'des', 'dec'],
];

const KEYWORDS = [
  ['health', ['tannlege', 'dentist', 'lege', 'legetime', 'doctor', 'doktor', 'apotek', 'pharmacy', 'helse', 'health', 'medisin', 'medicine', 'trening', 'gym', 'fysio', 'sykehus', 'hospital', 'vaksine', 'vaccine']],
  ['family', ['familie', 'family', 'mamma', 'pappa', 'mum', 'mom', 'dad', 'barn', 'barna', 'kids', 'skole', 'school', 'barnehage', 'sfo', 'foreldremøte', 'foreldremote']],
  ['work', ['jobb', 'jobben', 'job', 'work', 'arbeid', 'møte', 'mote', 'meeting', 'kunde', 'client', 'kontor', 'office', 'prosjekt', 'project']],
  ['home', ['bil', 'bilen', 'car', 'hus', 'huset', 'house', 'hytte', 'hytta', 'cabin', 'vask', 'tak', 'roof', 'rør', 'ror', 'oppvask', 'plen', 'hage', 'garden', 'dekk', 'tyre', 'tire', 'eu-kontroll', 'eukontroll', 'bensin', 'diesel', 'verksted', 'nøkkel', 'nokkel', 'kjøleskap', 'kjoleskap']],
  ['bills', ['bill', 'bills', 'invoice', 'regning', 'faktura', 'strøm', 'strom', 'strømregning', 'stromregning', 'electricity', 'husleie', 'rent', 'internet', 'mobilregning', 'forsikring', 'insurance', 'kommunale', 'abonnement', 'subscription', 'nettleie']],
  ['money', ['lønn', 'lonn', 'salary', 'bank', 'vipps', 'overfør', 'overfor', 'transfer', 'betale', 'betal', 'pay', 'penger', 'money', 'skatt', 'tax', 'lån', 'lan', 'loan']],
  ['todo', ['todo', 'to-do', 'oppgave', 'husk', 'remember', 'kjøp', 'kjop', 'buy', 'hente', 'handle']],
];

function isLetter(ch) {
  return /[\p{L}\p{N}]/u.test(ch || '');
}

function findPhrases(text, phrases) {
  const lower = text.toLowerCase();
  const found = [];
  for (const phrase of phrases) {
    const p = phrase.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const i = lower.indexOf(p, from);
      if (i < 0) break;
      const before = i === 0 || !isLetter(lower[i - 1]);
      const after = i + p.length >= lower.length || !isLetter(lower[i + p.length]);
      if (before && after) found.push({ start: i, end: i + p.length, phrase: p });
      from = i + Math.max(1, p.length);
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  return found;
}

function earliest(matches) {
  if (!matches.length) return null;
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  return matches[0];
}

function blank(text, start, end) {
  return text.slice(0, start) + ' '.repeat(Math.max(0, end - start)) + text.slice(end);
}

function tidyTitle(text) {
  let s = text.replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[-–—,:.]+/, '').replace(/[-–—,:.]+$/, '').trim();
  s = s.replace(/\beu(?=-)/gi, 'EU');
  if (/^(på|pa|den|on|at|the|og|and)$/i.test(s)) return '';
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function scoreCategory(text) {
  const lower = text.toLowerCase();
  let best = { id: 'todo', score: 0 };
  for (const [id, words] of KEYWORDS) {
    let score = 0;
    const hits = findPhrases(lower, words);
    const used = [];
    for (const hit of hits) {
      if (used.some((u) => !(hit.end <= u.start || hit.start >= u.end))) continue;
      used.push(hit);
      score += hit.phrase.length >= 6 ? 3 : 2;
    }
    if (score > best.score) best = { id, score };
  }
  return best.id;
}

function weekdayPhrases() {
  const list = [];
  for (const w of WEEKDAYS) {
    for (const name of w.names) {
      list.push({ phrase: `neste ${name}`, dow: w.dow, next: true });
      list.push({ phrase: `next ${name}`, dow: w.dow, next: true });
      list.push({ phrase: `på ${name}`, dow: w.dow, next: false });
      list.push({ phrase: `pa ${name}`, dow: w.dow, next: false });
      list.push({ phrase: `on ${name}`, dow: w.dow, next: false });
      list.push({ phrase: name, dow: w.dow, next: false });
    }
  }
  return list;
}

function repeatPhrases() {
  const list = [
    { phrase: 'every day', repeat: 'daily' },
    { phrase: 'each day', repeat: 'daily' },
    { phrase: 'hver dag', repeat: 'daily' },
    { phrase: 'daglig', repeat: 'daily' },
    { phrase: 'daily', repeat: 'daily' },
    { phrase: 'every week', repeat: 'weekly' },
    { phrase: 'each week', repeat: 'weekly' },
    { phrase: 'hver uke', repeat: 'weekly' },
    { phrase: 'ukentlig', repeat: 'weekly' },
    { phrase: 'weekly', repeat: 'weekly' },
    { phrase: 'every month', repeat: 'monthly' },
    { phrase: 'each month', repeat: 'monthly' },
    { phrase: 'hver måned', repeat: 'monthly' },
    { phrase: 'hver maned', repeat: 'monthly' },
    { phrase: 'hver mnd', repeat: 'monthly' },
    { phrase: 'månedlig', repeat: 'monthly' },
    { phrase: 'manedlig', repeat: 'monthly' },
    { phrase: 'monthly', repeat: 'monthly' },
    { phrase: 'every year', repeat: 'yearly' },
    { phrase: 'hvert år', repeat: 'yearly' },
    { phrase: 'hvert ar', repeat: 'yearly' },
    { phrase: 'årlig', repeat: 'yearly' },
    { phrase: 'arlig', repeat: 'yearly' },
    { phrase: 'yearly', repeat: 'yearly' },
  ];
  for (const w of WEEKDAYS) {
    for (const name of w.names) {
      list.push({ phrase: `hver ${name}`, repeat: 'weekly', dow: w.dow });
      list.push({ phrase: `every ${name}`, repeat: 'weekly', dow: w.dow });
    }
  }
  return list;
}

function findRepeat(text) {
  const phrases = repeatPhrases();
  const matches = [];
  for (const p of phrases) {
    for (const hit of findPhrases(text, [p.phrase])) {
      matches.push({ ...hit, repeat: p.repeat, dow: p.dow });
    }
  }
  return earliest(matches);
}

function findDate(text, today) {
  const matches = [];

  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) {
    const [y, m, d] = iso[0].split('-').map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      matches.push({ start: iso.index, end: iso.index + iso[0].length, date: makeDate(y, m, d) });
    }
  }

  const numeric = /(?:^|[^\p{L}\p{N}])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=$|[^\p{L}\p{N}])/giu;
  let m;
  while ((m = numeric.exec(text))) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    let year = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
    if (year < 100) year += 2000;
    const lead = m[0].length - m[0].trimStart().length;
    const start = m.index + lead;
    const end = m.index + m[0].length;
    matches.push({ start, end, date: makeDate(year, month, day) });
  }

  const monthAlt = MONTHS.flat().join('|');
  const dayMonth = new RegExp(`(\\d{1,2})\\.?\\s+(${monthAlt})\\b`, 'giu');
  while ((m = dayMonth.exec(text))) {
    const day = Number(m[1]);
    const month = monthIndex(m[2]);
    if (!month || day < 1 || day > 31) continue;
    const year = Number(today.slice(0, 4));
    matches.push({ start: m.index, end: m.index + m[0].length, date: makeDate(year, month, day) });
  }
  const monthDay = new RegExp(`\\b(${monthAlt})\\s+(\\d{1,2})\\.?`, 'giu');
  while ((m = monthDay.exec(text))) {
    const month = monthIndex(m[1]);
    const day = Number(m[2]);
    if (!month || day < 1 || day > 31) continue;
    const year = Number(today.slice(0, 4));
    matches.push({ start: m.index, end: m.index + m[0].length, date: makeDate(year, month, day) });
  }

  const den = /(?:^|[^\p{L}\p{N}])den\s+(\d{1,2})\.?(?=$|[^\p{L}\p{N}])/giu;
  while ((m = den.exec(text))) {
    const day = Number(m[1]);
    if (day < 1 || day > 31) continue;
    const lead = m[0].length - m[0].trimStart().length;
    const start = m.index + lead;
    matches.push({ start, end: m.index + m[0].length, date: nextDayOfMonth(today, day) });
  }

  const relatives = [
    { phrases: ['i overmorgen', 'overimorgen', 'day after tomorrow'], days: 2 },
    { phrases: ['i morgen', 'imorgen', 'i morgon', 'imorgon', 'tomorrow'], days: 1 },
    { phrases: ['i går', 'igår', 'i gar', 'igar', 'yesterday'], days: -1 },
    { phrases: ['i dag', 'idag', 'today'], days: 0 },
    { phrases: ['neste uke', 'next week', 'om en uke', 'om ei uke', 'in a week'], days: 7 },
  ];
  for (const rel of relatives) {
    for (const hit of findPhrases(text, rel.phrases)) {
      matches.push({ start: hit.start, end: hit.end, date: addDays(today, rel.days) });
    }
  }

  const inDays = /(?:^|[^\p{L}\p{N}])(?:om|in)\s+(\d{1,3})\s+dager?|(?:^|[^\p{L}\p{N}])in\s+(\d{1,3})\s+days?/giu;
  while ((m = inDays.exec(text))) {
    const n = Number(m[1] || m[2]);
    if (!n && n !== 0) continue;
    const lead = m[0].length - m[0].trimStart().length;
    matches.push({ start: m.index + lead, end: m.index + m[0].length, date: addDays(today, n) });
  }

  for (const w of weekdayPhrases()) {
    for (const hit of findPhrases(text, [w.phrase])) {
      matches.push({
        start: hit.start,
        end: hit.end,
        date: nextWeekday(today, w.dow, { next: w.next }),
      });
    }
  }

  return earliest(matches);
}

function monthIndex(name) {
  const n = name.toLowerCase();
  for (let i = 0; i < MONTHS.length; i++) {
    if (MONTHS[i].includes(n)) return i + 1;
  }
  return 0;
}

function parseNumber(intPart, sep, frac) {
  const digits = intPart.replace(/[ .\u00a0]/g, '');
  if (!digits) return null;
  let n = Number(digits);
  if (!Number.isFinite(n)) return null;
  if (frac != null && frac !== '') {
    const decimal = sep === ',' || (sep === '.' && frac.length <= 2 && !/[ .\u00a0]/.test(intPart));
    if (decimal) n = Number(`${digits}.${frac}`);
  }
  if (!Number.isFinite(n) || n < 0 || n >= 1e9) return null;
  return Math.round(n * 100) / 100;
}

function findAmount(text) {
  const patterns = [
    /(?:kr|nok)\s*(\d{1,3}(?:[ .\u00a0]\d{3})+|\d+)(?:([,.])(\d{1,2}))?/giu,
    /(\d{1,3}(?:[ .\u00a0]\d{3})+|\d+)(?:([,.])(\d{1,2}))?\s*(?:kr|nok)/giu,
    /(\d{1,3}(?:[ .\u00a0]\d{3})+|\d+)\s*,-/giu,
  ];
  const matches = [];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) {
      const value = parseNumber(m[1], m[2], m[3]);
      if (value == null) continue;
      matches.push({ start: m.index, end: m.index + m[0].length, value });
    }
  }
  return earliest(matches);
}

function parseItem(text, opts) {
  const now = (opts && opts.now) || new Date();
  const today = osloDate(now);
  const raw = String(text || '').replace(/[\u0000-\u001F]/g, ' ').trim();
  let working = raw;

  let repeat = null;
  let due = null;

  const rep = findRepeat(working);
  if (rep) {
    repeat = rep.repeat;
    if (rep.dow != null) due = nextWeekday(today, rep.dow, { next: false });
    working = blank(working, rep.start, rep.end);
  }

  const date = findDate(working, today);
  if (date) {
    due = date.date;
    working = blank(working, date.start, date.end);
  }

  const amountHit = findAmount(working);
  let amount = null;
  if (amountHit) {
    amount = amountHit.value;
    working = blank(working, amountHit.start, amountHit.end);
  }

  if (repeat && !due) due = today;

  const title = tidyTitle(working) || tidyTitle(raw);
  const category = scoreCategory(raw);

  return {
    title,
    category,
    due,
    amount,
    currency: amount == null ? null : 'NOK',
    repeat,
    monthDay: due ? Number(due.slice(8, 10)) : null,
  };
}

module.exports = { parseItem, scoreCategory };
