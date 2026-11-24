'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MYDAY = Object.assign(root.MYDAY || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CATEGORIES = [
    { id: 'bills', name: 'Bills', color: '#C65D12', tint: '#FDE6D4' },
    { id: 'todo', name: 'To-do', color: '#1D5FD0', tint: '#E3EDFC' },
    { id: 'family', name: 'Family', color: '#C23B6E', tint: '#FDE3EE' },
    { id: 'health', name: 'Health', color: '#0E8A52', tint: '#DDF5E8' },
    { id: 'work', name: 'Work', color: '#5B3CC4', tint: '#EBE4FB' },
    { id: 'business', name: 'Business', color: '#123A63', tint: '#E4EEF6' },
    { id: 'email', name: 'Email', color: '#0369A1', tint: '#E0F2FE' },
    { id: 'home', name: 'Home', color: '#0C7C86', tint: '#D9F3F4' },
    { id: 'money', name: 'Money', color: '#8A6800', tint: '#FBF0CC' },
    { id: 'other', name: 'Other', color: '#5E6670', tint: '#ECEDEF' },
  ];

  const IDS = new Set(CATEGORIES.map((c) => c.id));

  function byId(id) {
    return CATEGORIES.find((c) => c.id === id) || CATEGORIES.find((c) => c.id === 'other');
  }

  function isCategory(id) {
    return IDS.has(id);
  }

  return { CATEGORIES, byId, isCategory };
});
