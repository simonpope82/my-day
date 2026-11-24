'use strict';

const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
  check: svg(`<path ${S} d="M5 12.5 10 17 19 7"/>`),
  sun: svg(`<circle ${S} cx="12" cy="12" r="4"/><path ${S} d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>`),
  list: svg(`<path ${S} d="M9 7h11M9 12h11M9 17h11"/><path ${S} d="M4 7h.01M4 12h.01M4 17h.01"/>`),
  grid: svg(`<rect ${S} x="3" y="3" width="7" height="7" rx="1"/><rect ${S} x="14" y="3" width="7" height="7" rx="1"/><rect ${S} x="3" y="14" width="7" height="7" rx="1"/><rect ${S} x="14" y="14" width="7" height="7" rx="1"/>`),
  plus: svg(`<path ${S} d="M12 5v14M5 12h14"/>`),
  lock: svg(`<rect ${S} x="5" y="11" width="14" height="10" rx="2"/><path ${S} d="M8 11V8a4 4 0 0 1 8 0v3"/>`),
  close: svg(`<path ${S} d="M6 6l12 12M18 6 6 18"/>`),
  back: svg(`<path ${S} d="M15 5 8 12l7 7"/>`),
  bills: svg(`<path ${S} d="M7 3h10a1 1 0 0 1 1 1v17l-2.2-1.4L13 21l-2.5-1.5L8 21l-2-1.4L4 21V4a1 1 0 0 1 1-1z"/><path ${S} d="M8 8h8M8 12h8M8 16h5"/>`),
  todo: svg(`<circle ${S} cx="12" cy="12" r="8"/><path ${S} d="M8.5 12.2 11 14.5 15.5 9.5"/>`),
  family: svg(`<circle ${S} cx="8" cy="9" r="2.2"/><circle ${S} cx="16" cy="9" r="2.2"/><path ${S} d="M4.5 18c.6-2.2 2.2-3.4 3.5-3.4S11 15.8 11.5 18M12.5 18c.6-2.2 2.2-3.4 3.5-3.4S18.9 15.8 19.5 18"/>`),
  health: svg(`<path ${S} d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z"/>`),
  work: svg(`<rect ${S} x="3" y="7" width="18" height="13" rx="2"/><path ${S} d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>`),
  business: svg(`<rect ${S} x="4" y="3" width="16" height="18" rx="1"/><path ${S} d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M10 21v-4h4v4"/>`),
  email: svg(`<rect ${S} x="3" y="5" width="18" height="14" rx="2"/><path ${S} d="m4 7 8 6 8-6"/>`),
  home: svg(`<path ${S} d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>`),
  money: svg(`<circle ${S} cx="12" cy="12" r="8"/><path ${S} d="M12 7.5v9M9.5 9.5c.6-1 1.4-1.4 2.5-1.4 1.4 0 2.4.7 2.4 1.8S13.4 12 12 12s-2.6.7-2.6 1.9 1.2 1.9 2.6 1.9c1.1 0 2-.4 2.6-1.2"/>`),
  other: svg(`<circle ${S} cx="6" cy="12" r="1.2"/><circle ${S} cx="12" cy="12" r="1.2"/><circle ${S} cx="18" cy="12" r="1.2"/>`),
  calendar: svg(`<rect ${S} x="3" y="5" width="18" height="16" rx="2"/><path ${S} d="M3 10h18M8 3v4M16 3v4"/>`),
};

const REPEATS = [
  ['', 'None'],
  ['daily', 'Day'],
  ['weekly', 'Week'],
  ['monthly', 'Month'],
  ['yearly', 'Year'],
];

const state = {
  boot: true,
  authed: false,
  view: 'today',
  group: null,
  pin: '',
  data: null,
  items: [],
  recentDone: [],
  sheet: null,
  edit: null,
  draft: '',
  preview: null,
  catPicked: null,
  confirmDelete: false,
  toast: '',
  busy: false,
  loginError: '',
  shake: false,
};

function el(tag, attrs, kids) {
  const node = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  });
  const list = kids == null ? [] : Array.isArray(kids) ? kids : [kids];
  list.forEach((kid) => {
    if (kid == null || kid === false) return;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  });
  return node;
}

function ico(name) {
  return el('span', { class: 'ico', html: ICONS[name] || ICONS.other });
}

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function friendly(iso) {
  if (!iso) return '';
  const today = state.data && state.data.date;
  if (today && iso === today) return 'Today';
  if (today && iso === addDays(today, 1)) return 'Tomorrow';
  if (today && iso === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()];
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return y && today && iso.slice(0, 4) !== today.slice(0, 4) ? `${wd} ${d} ${mon} ${y}` : `${wd} ${d} ${mon}`;
}

function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[dt.getUTCDay()]} ${d} ${months[m - 1]}`;
}

function formatKr(n) {
  const text = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 }).format(n);
  return `${text} kr`;
}

function repeatWord(id) {
  return (REPEATS.find((row) => row[0] === id) || ['', ''])[1];
}

function toast(message) {
  state.toast = message;
  render();
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    state.toast = '';
    render();
  }, 2200);
}

async function api(path, options) {
  let res;
  try {
    res = await fetch(path, {
      method: options && options.method,
      headers: { 'Content-Type': 'application/json' },
      body: options && options.body,
    });
  } catch {
    throw new Error('No connection');
  }
  if (res.status === 401) {
    state.authed = false;
    state.boot = false;
    state.sheet = null;
    render();
    throw new Error('Locked');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Try again');
  return body;
}

async function refresh() {
  const [today, list] = await Promise.all([api('/api/today'), api('/api/items')]);
  state.data = today;
  state.items = list.items || [];
  state.recentDone = list.recentDone || [];
  state.authed = true;
  state.boot = false;
  if (!state.sheet) render();
}

function go(view, group) {
  state.view = view;
  state.group = group || null;
  state.sheet = null;
  const hash = view === 'today' ? '#/' : group ? `#/groups/${group}` : `#/${view}`;
  if (location.hash !== hash) location.hash = hash;
  else render();
}

function readHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'open') return { view: 'open', group: null };
  if (parts[0] === 'groups') return { view: 'groups', group: parts[1] || null };
  return { view: 'today', group: null };
}

async function tick(item) {
  if (state.busy) return;
  state.busy = true;
  const undo = !!(item.showDone || item.occurrenceDone || item.done);
  try {
    await api(`/api/items/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify(undo ? { done: false, undo: true } : { done: true }),
    });
    if (navigator.vibrate) navigator.vibrate(12);
    await refresh();
  } catch (err) {
    if (err.message !== 'Locked') toast(err.message);
  } finally {
    state.busy = false;
    render();
  }
}

function openAdd() {
  state.sheet = 'add';
  state.draft = '';
  state.preview = null;
  state.catPicked = null;
  render();
  const input = document.getElementById('add-text');
  if (input) input.focus();
}

let parseTimer;
function onDraft(value, caret) {
  state.draft = value;
  clearTimeout(parseTimer);
  parseTimer = setTimeout(() => runParse(caret), 160);
}

async function runParse(caret) {
  const text = state.draft;
  if (!text.trim()) {
    state.preview = null;
    return;
  }
  try {
    const parsed = await api('/api/parse', { method: 'POST', body: JSON.stringify({ text }) });
    if (state.draft !== text) return;
    state.preview = parsed;
    render();
    const input = document.getElementById('add-text');
    if (input) {
      input.focus();
      const pos = caret == null ? input.value.length : caret;
      input.setSelectionRange(pos, pos);
    }
  } catch (err) {
    if (err.message !== 'Locked') state.preview = null;
  }
}

async function saveAdd() {
  const text = state.draft.trim();
  if (!text || state.busy) return;
  state.busy = true;
  render();
  try {
    const body = { text };
    if (state.catPicked) body.category = state.catPicked;
    const saved = await api('/api/items', { method: 'POST', body: JSON.stringify(body) });
    state.sheet = null;
    state.draft = '';
    await refresh();
    const when = saved.item && saved.item.due ? friendly(saved.item.due) : '';
    state.busy = false;
    toast(when ? `Added · ${when}` : 'Added');
  } catch (err) {
    state.busy = false;
    if (err.message !== 'Locked') toast(err.message);
  }
}

function openEdit(item) {
  const real = state.items.find((row) => row.id === item.id) || item;
  const dateLabel = real.due ? friendly(real.due) : '';
  state.edit = {
    id: real.id,
    title: real.title,
    category: real.category,
    notes: real.notes || '',
    repeat: real.repeat || '',
    dateText: dateLabel,
    dateLabel,
    dateOrig: real.due || '',
    amountText: real.amount == null ? '' : String(real.amount),
  };
  state.confirmDelete = false;
  state.sheet = 'edit';
  render();
}

async function saveEdit() {
  const edit = state.edit;
  if (!edit || state.busy) return;
  const body = {
    title: edit.title,
    category: edit.category,
    notes: edit.notes,
    repeat: edit.repeat || 'none',
  };
  const dateText = edit.dateText.trim();
  if (!dateText) body.due = null;
  else if (dateText === edit.dateLabel) body.due = edit.dateOrig || null;
  else body.dueText = dateText;
  body.amount = edit.amountText.trim() ? edit.amountText.trim() : null;
  state.busy = true;
  try {
    await api(`/api/items/${edit.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    state.sheet = null;
    await refresh();
    state.busy = false;
    toast('Saved');
  } catch (err) {
    state.busy = false;
    if (err.message !== 'Locked') toast(err.message);
  }
}

async function removeItem() {
  if (!state.confirmDelete) {
    state.confirmDelete = true;
    render();
    return;
  }
  try {
    await api(`/api/items/${state.edit.id}`, { method: 'DELETE' });
    state.sheet = null;
    await refresh();
    toast('Deleted');
  } catch (err) {
    if (err.message !== 'Locked') toast(err.message);
  }
}

async function submitPin() {
  state.loginError = '';
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ pin: state.pin }) });
    state.pin = '';
    await refresh();
  } catch (err) {
    state.pin = '';
    state.shake = true;
    state.loginError = err.message === 'Locked' ? 'Wrong code' : err.message;
    render();
    setTimeout(() => { state.shake = false; }, 400);
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  state.authed = false;
  state.sheet = null;
  state.data = null;
  render();
}

function meta(item, late) {
  const bits = [];
  if (late) bits.push('Late');
  bits.push(MYDAY.byId(item.category).name);
  if (item.due) bits.push(friendly(item.due));
  if (item.amount != null) bits.push(formatKr(item.amount));
  if (item.repeat) bits.push(repeatWord(item.repeat));
  if (item.notes) bits.push('Note');
  return bits.join(' · ');
}

function card(item, late) {
  const cat = MYDAY.byId(item.category);
  const done = !!(item.done || item.showDone);
  return el('article', { class: `card${late ? ' late' : ''}${done ? ' done' : ''}` }, [
    el('button', {
      class: `tick${done ? ' on' : ''}`,
      type: 'button',
      'aria-pressed': done ? 'true' : 'false',
      'aria-label': `${done ? 'Undo' : 'Done'}: ${item.title}`,
      onclick: (event) => { event.stopPropagation(); tick(item); },
    }, [el('span', { html: ICONS.check })]),
    el('button', { class: 'card-main', type: 'button', onclick: () => openEdit(item) }, [
      el('span', { class: 'badge', style: `background:${cat.tint};color:${cat.color}`, html: ICONS[item.category] || ICONS.other }),
      el('span', { class: 'card-text' }, [
        el('span', { class: 'title' }, item.title),
        el('span', { class: 'meta' }, meta(item, late)),
      ]),
    ]),
  ]);
}

function section(title, items, late) {
  if (!items || !items.length) return null;
  return el('section', {}, [
    el('h2', { class: 'section' }, title),
    el('div', { class: 'stack' }, items.map((item) => card(item, late))),
  ]);
}

function progress(counts) {
  const pct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
  return el('div', { class: 'progress' }, [
    el('p', { class: 'count' }, [
      el('strong', {}, String(counts.done)),
      ' of ',
      el('strong', {}, String(counts.total)),
      ' done',
    ]),
    el('div', {
      class: 'track',
      role: 'progressbar',
      'aria-valuenow': String(counts.done),
      'aria-valuemax': String(counts.total),
      'aria-label': counts.label,
    }, [el('div', { class: 'fill', style: `width:${pct}%` })]),
  ]);
}

function eventWhen(event) {
  if (event.allDay) return 'All day';
  if (event.start && event.end) return `${event.start}–${event.end}`;
  return event.start || '';
}

function eventCard(event, showDate) {
  const bits = [];
  if (showDate && event.date) bits.push(friendly(event.date));
  if (event.calendar) bits.push(event.calendar);
  if (event.location) bits.push(event.location);
  return el('article', { class: 'card event' }, [
    el('span', { class: 'when' }, eventWhen(event)),
    el('span', {
      class: 'badge cal',
      style: `background:#e7f0ff;color:${event.color || '#1d5fd0'}`,
      html: ICONS.calendar,
    }),
    el('span', { class: 'card-text' }, [
      el('span', { class: 'title' }, event.title),
      bits.length ? el('span', { class: 'meta' }, bits.join(' · ')) : null,
    ]),
  ]);
}

function eventLists() {
  const data = state.data || {};
  const today = data.date || '';
  const until = today ? addDays(today, 7) : '';
  const all = data.events || [];
  return {
    today: all.filter((event) => event.date === today),
    soon: all.filter((event) => today && event.date > today && event.date <= until),
  };
}

function comingUpSection(tasks, events) {
  const rows = [
    ...events.map((event) => ({ kind: 'event', date: event.date, sort: event.start || '00:00', event })),
    ...tasks.map((item) => ({ kind: 'task', date: item.due || '9999-99-99', sort: '99:99', item })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.sort.localeCompare(b.sort));
  if (!rows.length) return null;
  return el('section', {}, [
    el('h2', { class: 'section' }, 'Coming up'),
    el('div', { class: 'stack' }, rows.map((row) => (row.kind === 'event' ? eventCard(row.event, true) : card(row.item, false)))),
  ]);
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch { /* not a link */ }
  return '';
}

function openLink(url, label) {
  const href = safeHttpUrl(url);
  if (!href) return null;
  return el('a', {
    class: 'open-link',
    href,
    target: '_blank',
    rel: 'noopener noreferrer',
    onclick: (event) => event.stopPropagation(),
  }, label || 'Open');
}

function briefPanel(brief) {
  if (!brief || !Array.isArray(brief.sections) || !brief.sections.length) return null;
  return el('div', { class: 'brief' }, brief.sections.map((section) => el('details', {
    class: 'brief-card',
    'data-key': section.key || 'note',
    open: true,
  }, [
    el('summary', {}, [
      el('span', { class: 'emoji', 'aria-hidden': 'true' }, section.emoji || '📌'),
      el('span', { class: 'brief-title' }, section.title || 'Note'),
    ]),
    el('ul', {}, section.lines.map((line) => {
      const href = safeHttpUrl(line.link);
      return el('li', {}, href
        ? el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, line.text)
        : line.text);
    })),
  ])));
}

function replyRows() {
  return (state.items || []).filter((item) => item.category === 'email' && !item.done);
}

function replySection() {
  const rows = replyRows();
  if (!rows.length) return null;
  const cat = MYDAY.byId('email');
  return el('section', {}, [
    el('h2', { class: 'section' }, [
      'Reply to',
      el('span', { class: 'pill' }, String(rows.length)),
    ]),
    el('div', { class: 'stack' }, rows.map((item) => el('article', { class: 'reply' }, [
      el('button', {
        class: `tick${item.done ? ' on' : ''}`,
        type: 'button',
        'aria-label': `Done: ${item.title}`,
        onclick: () => tick(item),
      }, [el('span', { html: ICONS.check })]),
      el('span', { class: 'badge', style: `background:${cat.tint};color:${cat.color}`, html: ICONS.email }),
      el('button', { class: 'reply-title', type: 'button', onclick: () => openEdit(item) }, [
        el('span', { class: 'title' }, item.title),
        item.source ? el('span', { class: 'meta' }, item.source) : null,
      ]),
      openLink(item.link, 'Open'),
    ]))),
  ]);
}

function todayScreen() {
  const data = state.data;
  const openToday = data.today || [];
  const late = data.overdue || [];
  const soon = data.upcoming || [];
  const done = data.doneToday || [];
  const events = eventLists();
  const bits = [
    header('Today', data.date ? shortDate(data.date) : ''),
    briefPanel(data.brief),
  ];
  if (data.counts && data.counts.total) bits.push(progress(data.counts));
  if (events.today.length) {
    bits.push(el('section', {}, [
      el('h2', { class: 'section' }, 'Calendar'),
      el('div', { class: 'stack' }, events.today.map((event) => eventCard(event, false))),
    ]));
  } else if (data.calendarError && !events.soon.length) bits.push(el('p', { class: 'quiet' }, 'Calendar not loaded'));
  if (!late.length && !openToday.length) {
    if (done.length) bits.push(el('div', { class: 'banner' }, 'All done'));
    else if (!soon.length && !events.soon.length && !events.today.length && !(data.brief && data.brief.sections && data.brief.sections.length)) {
      bits.push(el('div', { class: 'empty' }, [
        el('div', { class: 'sun', html: ICONS.sun }),
        el('h2', {}, 'Nothing today'),
        el('p', {}, 'Tap + to add'),
      ]));
    } else if (!events.today.length && !(data.brief && data.brief.sections && data.brief.sections.length)) bits.push(el('p', { class: 'quiet' }, 'Nothing today.'));
  }
  bits.push(replySection());
  bits.push(section('Late', late, true));
  bits.push(section('Today', openToday, false));
  bits.push(comingUpSection(soon, events.soon));
  bits.push(section('Done', done, false));
  return bits;
}

function sortOpen(items) {
  const today = (state.data && state.data.date) || '9999-99-99';
  return items.slice().sort((a, b) => {
    const rank = (item) => (!item.due ? 2 : item.due < today ? 0 : 1);
    return rank(a) - rank(b) || String(a.due || '').localeCompare(String(b.due || ''));
  });
}

function openScreen() {
  const items = sortOpen(state.items.filter((item) => !item.done));
  const bits = [header('Not done', `${items.length} open`)];
  if (!items.length) {
    bits.push(el('div', { class: 'empty' }, [
      el('div', { class: 'sun', html: ICONS.check }),
      el('h2', {}, 'All done'),
    ]));
  } else bits.push(el('div', { class: 'stack', style: 'margin-top:16px' }, items.map((item) => card(item, item.due && state.data && item.due < state.data.date))));
  if (state.recentDone.length) bits.push(section('Done', state.recentDone, false));
  return bits;
}

function groupsScreen() {
  if (state.group) {
    const cat = MYDAY.byId(state.group);
    const items = sortOpen(state.items.filter((item) => !item.done && item.category === cat.id));
    const done = state.recentDone.filter((item) => item.category === cat.id);
    return [
      el('div', { class: 'back-row' }, [
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Back', onclick: () => go('groups') }, [ico('back')]),
        el('h1', {}, cat.name),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Lock', onclick: logout }, [ico('lock')]),
      ]),
      items.length
        ? el('div', { class: 'stack', style: 'margin-top:16px' }, items.map((item) => card(item, item.due && state.data && item.due < state.data.date)))
        : el('p', { class: 'quiet' }, 'Nothing here'),
      section('Done', done, false),
    ];
  }
  return [
    header('Groups', 'Tap one'),
    el('div', { class: 'tiles' }, MYDAY.CATEGORIES.map((cat) => {
      const count = state.items.filter((item) => !item.done && item.category === cat.id).length;
      return el('button', {
        class: 'tile',
        type: 'button',
        style: `background:${cat.tint};color:${cat.color}`,
        onclick: () => go('groups', cat.id),
      }, [ico(cat.id), el('strong', {}, cat.name), el('span', {}, String(count))]);
    })),
  ];
}

function header(title, sub) {
  return el('header', { class: 'top' }, [
    el('div', {}, [el('h1', {}, title), sub ? el('p', { class: 'date' }, sub) : null]),
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Lock', onclick: logout }, [ico('lock')]),
  ]);
}

function chips(selected, onPick) {
  return el('div', { class: 'chips' }, MYDAY.CATEGORIES.map((cat) => el('button', {
    type: 'button',
    class: `chip${selected === cat.id ? ' on' : ''}`,
    style: `background:${cat.tint};color:${cat.color}`,
    onclick: () => onPick(cat.id),
  }, [ico(cat.id), cat.name])));
}

function addSheet() {
  const picked = state.catPicked || (state.preview && state.preview.category) || 'todo';
  const previewBits = [];
  if (state.preview) {
    if (state.preview.due) previewBits.push(friendly(state.preview.due));
    if (state.preview.amount != null) previewBits.push(formatKr(state.preview.amount));
    if (state.preview.repeat) previewBits.push(repeatWord(state.preview.repeat));
    previewBits.unshift(MYDAY.byId(picked).name);
  }
  return el('div', { class: 'sheet' }, [
    el('div', { class: 'panel' }, [
      el('div', { class: 'sheet-top' }, [
        el('h1', {}, 'Add'),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => { state.sheet = null; render(); } }, [ico('close')]),
      ]),
      el('textarea', {
        id: 'add-text',
        class: 'field',
        rows: '2',
        placeholder: 'One line…',
        enterkeyhint: 'done',
        autocomplete: 'off',
        autocapitalize: 'sentences',
        oninput: (event) => onDraft(event.target.value, event.target.selectionStart),
        onkeydown: (event) => { if (event.key === 'Enter') { event.preventDefault(); saveAdd(); } },
      }, state.draft),
      el('p', { class: 'preview' }, previewBits.join(' · ')),
      chips(picked, (id) => {
        state.catPicked = state.catPicked === id ? null : id;
        render();
        const input = document.getElementById('add-text');
        if (input) input.focus();
      }),
      el('button', { class: 'save', type: 'button', disabled: state.busy ? 'disabled' : null, onclick: saveAdd }, 'Save'),
    ]),
  ]);
}

function editSheet() {
  const edit = state.edit;
  return el('div', { class: 'sheet' }, [
    el('div', { class: 'panel' }, [
      el('div', { class: 'sheet-top' }, [
        el('h1', {}, 'Edit'),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => { state.sheet = null; render(); } }, [ico('close')]),
      ]),
      el('label', { class: 'label', for: 'edit-title' }, 'Title'),
      el('input', {
        id: 'edit-title',
        class: 'field',
        value: edit.title,
        oninput: (event) => { edit.title = event.target.value; },
      }),
      chips(edit.category, (id) => { edit.category = id; render(); }),
      el('label', { class: 'label', for: 'edit-date' }, 'Date'),
      el('input', {
        id: 'edit-date',
        class: 'field',
        value: edit.dateText,
        placeholder: 'friday, tomorrow, 15.11',
        oninput: (event) => { edit.dateText = event.target.value; },
      }),
      el('label', { class: 'label', for: 'edit-amount' }, 'Amount'),
      el('input', {
        id: 'edit-amount',
        class: 'field',
        inputmode: 'decimal',
        value: edit.amountText,
        placeholder: '1200',
        oninput: (event) => { edit.amountText = event.target.value; },
      }),
      el('span', { class: 'label' }, 'Repeat'),
      el('div', { class: 'reps' }, REPEATS.map(([id, name]) => el('button', {
        type: 'button',
        class: `rep${edit.repeat === id ? ' on' : ''}`,
        onclick: () => { edit.repeat = id; render(); },
      }, name))),
      el('label', { class: 'label', for: 'edit-notes' }, 'Note'),
      el('textarea', {
        id: 'edit-notes',
        class: 'field',
        rows: '3',
        oninput: (event) => { edit.notes = event.target.value; },
      }, edit.notes),
      el('button', { class: 'save', type: 'button', onclick: saveEdit }, 'Save'),
      el('button', { class: 'danger', type: 'button', onclick: removeItem }, state.confirmDelete ? 'Delete' : 'Delete?'),
      state.confirmDelete ? el('button', { class: 'text-btn', type: 'button', onclick: () => { state.confirmDelete = false; render(); } }, 'Keep') : null,
    ]),
  ]);
}

function loginScreen() {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return el('div', { class: `lock${state.shake ? ' shake' : ''}` }, [
    el('h1', {}, 'My Day'),
    el('p', { class: 'date' }, 'Your code'),
    el('div', { class: 'dots', 'aria-label': `${state.pin.length} digits` }, Array.from({ length: Math.max(6, state.pin.length) }, (_, i) => el('i', { class: i < state.pin.length ? 'on' : '' }))),
    el('p', { class: 'wrong', role: 'alert' }, state.loginError),
    el('div', { class: 'pad' }, keys.map((key) => {
      if (!key) return el('span', {});
      if (key === 'del') {
        return el('button', { type: 'button', 'aria-label': 'Delete', onclick: () => { state.pin = state.pin.slice(0, -1); render(); } }, '⌫');
      }
      return el('button', { type: 'button', onclick: () => { if (state.pin.length < 12) { state.pin += key; render(); } } }, key);
    })),
    el('button', { class: 'go', type: 'button', onclick: submitPin }, 'Go'),
  ]);
}

function shell(children) {
  return el('div', { class: 'app', 'data-view': state.group ? 'group' : state.view }, [
    state.toast ? el('p', { class: 'toast', role: 'status' }, state.toast) : null,
    ...children.filter(Boolean),
    state.sheet ? null : el('button', { class: 'fab', type: 'button', 'aria-label': 'Add', onclick: openAdd }, [ico('plus')]),
    state.sheet ? null : el('nav', { class: 'nav' }, [
      ['today', 'Today', 'sun'],
      ['open', 'Not done', 'list'],
      ['groups', 'Groups', 'grid'],
    ].map(([id, label, name]) => el('button', {
      type: 'button',
      class: state.view === id ? 'on' : '',
      onclick: () => go(id),
    }, [ico(name), el('span', {}, label)]))),
    state.sheet === 'add' ? addSheet() : null,
    state.sheet === 'edit' ? editSheet() : null,
  ]);
}

function render() {
  const root = document.getElementById('app');
  root.className = '';
  if (state.boot) {
    root.replaceChildren(el('div', { class: 'boot' }, 'Loading…'));
    return;
  }
  if (!state.authed) {
    root.replaceChildren(loginScreen());
    return;
  }
  let children = [];
  if (state.view === 'open') children = openScreen();
  else if (state.view === 'groups') children = groupsScreen();
  else children = todayScreen();
  root.replaceChildren(shell(children));
}

document.addEventListener('keydown', (event) => {
  if (state.authed || state.boot) return;
  if (/^\d$/.test(event.key)) {
    if (state.pin.length < 12) state.pin += event.key;
    render();
  } else if (event.key === 'Backspace') {
    state.pin = state.pin.slice(0, -1);
    render();
  } else if (event.key === 'Enter') submitPin();
});

window.addEventListener('hashchange', () => {
  const next = readHash();
  state.view = next.view;
  state.group = next.group;
  if (state.authed) render();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.authed && !state.sheet) refresh().catch(() => {});
});
setInterval(() => {
  if (state.authed && !state.sheet && document.visibilityState === 'visible') refresh().catch(() => {});
}, 90000);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

const start = readHash();
state.view = start.view;
state.group = start.group;
api('/api/me').then(() => refresh()).catch(() => {
  state.boot = false;
  state.authed = false;
  render();
});
