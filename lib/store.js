'use strict';

const fs = require('fs');
const path = require('path');
const { emptyDoc } = require('./items');

function queue(store) {
  let chain = Promise.resolve();
  return {
    kind: store.kind,
    load: () => store.load(),
    ready: () => (store.ready ? store.ready() : Promise.resolve()),
    update(mutator) {
      const run = chain.then(() => store.update(mutator));
      chain = run.then(() => {}, () => {});
      return run;
    },
  };
}

function createFileStore(file) {
  function read() {
    if (!fs.existsSync(file)) return emptyDoc();
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      const err = new Error('Data file is not valid');
      err.status = 500;
      throw err;
    }
    if (!doc || !Array.isArray(doc.items)) {
      const err = new Error('Data file is not valid');
      err.status = 500;
      throw err;
    }
    doc.v = 1;
    return doc;
  }
  function write(doc) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`);
    fs.renameSync(tmp, file);
  }
  return {
    kind: 'file',
    async load() {
      return read();
    },
    async update(mutator) {
      const draft = structuredClone(read());
      mutator(draft);
      if (!draft || !Array.isArray(draft.items)) {
        const err = new Error('Bad update');
        err.status = 500;
        throw err;
      }
      draft.v = 1;
      draft.updatedAt = new Date().toISOString();
      write(draft);
      return draft;
    },
  };
}

function createGithubStore({ repo, branch, filePath, token, fetchImpl }) {
  const fetchFn = fetchImpl || globalThis.fetch;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'my-day',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const encoded = filePath.split('/').map((part) => encodeURIComponent(part)).join('/');
  const contentsUrl = `https://api.github.com/repos/${repo}/contents/${encoded}`;

  async function request(url, options) {
    const res = await fetchFn(url, options);
    const text = await res.text();
    let json = null;
    if (text) {
      try { json = JSON.parse(text); } catch { json = { message: text.slice(0, 200) }; }
    }
    return { res, json };
  }

  async function assertRepo() {
    const { res } = await request(`https://api.github.com/repos/${repo}`, { headers });
    if (!res.ok) {
      const err = new Error('Cannot read the data repo. Check GITHUB_TOKEN and DATA_REPO.');
      err.status = 503;
      throw err;
    }
  }

  async function loadRaw() {
    const { res, json } = await request(`${contentsUrl}?ref=${encodeURIComponent(branch)}`, { headers });
    if (res.status === 404) {
      const message = (json && json.message) || '';
      if (/No commit found|not a valid ref|Branch .* not found/i.test(message)) {
        const err = new Error(`Data branch "${branch}" was not found in ${repo}.`);
        err.status = 503;
        throw err;
      }
      if (message === 'Not Found' || /not found/i.test(message)) return { doc: emptyDoc(), sha: null };
      const err = new Error('Could not read items');
      err.status = 503;
      throw err;
    }
    if (!res.ok) {
      const err = new Error('Could not read items');
      err.status = 503;
      throw err;
    }
    let doc;
    try {
      doc = JSON.parse(Buffer.from(String(json.content || '').replace(/\n/g, ''), 'base64').toString('utf8'));
    } catch {
      const err = new Error('Data file is not valid');
      err.status = 500;
      throw err;
    }
    if (!doc || !Array.isArray(doc.items)) {
      const err = new Error('Data file is not valid');
      err.status = 500;
      throw err;
    }
    doc.v = 1;
    return { doc, sha: json.sha };
  }

  async function save(doc, sha) {
    const body = {
      message: 'my-day: update items',
      content: Buffer.from(`${JSON.stringify(doc, null, 2)}\n`).toString('base64'),
      branch,
    };
    if (sha) body.sha = sha;
    const { res, json } = await request(contentsUrl, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 409 || res.status === 422) return { ok: false };
    if (!res.ok) {
      const err = new Error('Could not save items');
      err.status = 503;
      err.detail = json && json.message;
      throw err;
    }
    return { ok: true };
  }

  return {
    kind: 'github',
    async ready() {
      await assertRepo();
      const { sha } = await loadRaw();
      if (!sha) await save(emptyDoc(), null);
    },
    async load() {
      return (await loadRaw()).doc;
    },
    async update(mutator) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const { doc, sha } = await loadRaw();
        const draft = structuredClone(doc);
        mutator(draft);
        if (!draft || !Array.isArray(draft.items)) {
          const err = new Error('Bad update');
          err.status = 500;
          throw err;
        }
        draft.v = 1;
        draft.updatedAt = new Date().toISOString();
        const saved = await save(draft, sha);
        if (saved.ok) return draft;
      }
      const err = new Error('Could not save items');
      err.status = 503;
      throw err;
    },
  };
}

function createStoreFromEnv() {
  if (process.env.DATA_FILE) return queue(createFileStore(process.env.DATA_FILE));
  const token = process.env.GITHUB_TOKEN || '';
  if (token) {
    return queue(createGithubStore({
      repo: process.env.DATA_REPO || 'simonpope82/my-day',
      branch: process.env.DATA_BRANCH || 'data',
      filePath: process.env.DATA_PATH || 'items.json',
      token,
    }));
  }
  const production = process.env.RENDER === 'true' || process.env.NODE_ENV === 'production';
  if (production) {
    const err = new Error('GITHUB_TOKEN is required so data survives restarts.');
    err.status = 503;
    throw err;
  }
  return queue(createFileStore(path.join(process.cwd(), 'data', 'local-items.json')));
}

module.exports = { createFileStore: (file) => queue(createFileStore(file)), createGithubStore, createStoreFromEnv };
