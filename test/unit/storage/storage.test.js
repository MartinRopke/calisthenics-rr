import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStorage,
  migrate,
  serializeState,
  parseState,
  SCHEMA_VERSION,
  LS_KEY,
  DRAFT_KEY,
} from '../../../src/storage/storage.js';

const memoryStore = (initial = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
};
const okJson = (obj) => async () => ({ ok: true, json: async () => obj });

// State as saved before schemaVersion existed: only `v: 1`, real-looking sessions.
const oldState = () => ({
  v: 1,
  settings: { hasBar: true, hasDip: false, restMain: 90, restCore: 60 },
  levels: { pull: { idx: 2, first: false }, squat: { idx: 1, first: true } },
  sessions: [
    {
      id: 's1',
      date: '2026-10-05',
      entries: { squat: { levelId: 'squat-2', sets: [5, 5, 5], targets: [5, 5, 5] } },
    },
    {
      id: 's2',
      date: '2026-10-07',
      entries: { squat: { levelId: 'squat-2', sets: [6, 6, 6], targets: [6, 6, 6] } },
    },
  ],
});

describe('schemaVersion and migrate', () => {
  it('starts at 1', () => assert.equal(SCHEMA_VERSION, 1));

  it('migrates a state saved before schemaVersion without losing data', () => {
    const old = oldState();
    const m = migrate(old);
    assert.equal(m.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(m.sessions, old.sessions);
    assert.deepEqual(m.settings, old.settings);
    assert.deepEqual(m.levels, old.levels);
    assert.equal(m.v, 1);
  });

  it('does not mutate its input', () => {
    const old = oldState();
    migrate(old);
    assert.equal('schemaVersion' in old, false);
  });

  it('is idempotent', () => {
    const once = migrate(oldState());
    assert.deepEqual(migrate(once), once);
  });

  it('returns null for non objects', () => {
    assert.equal(migrate(null), null);
    assert.equal(migrate('x'), null);
    assert.equal(migrate([1]), null);
  });

  it('keeps a newer schemaVersion untouched', () => {
    const future = { ...oldState(), schemaVersion: 99 };
    assert.equal(migrate(future).schemaVersion, 99);
  });

  it('serializeState stamps schemaVersion and keeps sessions an array', () => {
    const obj = JSON.parse(serializeState(oldState()));
    assert.equal(obj.schemaVersion, 1);
    assert.ok(Array.isArray(obj.sessions));
    assert.equal(obj.sessions.length, 2);
  });

  it('parseState returns null for corrupt JSON', () => {
    assert.equal(parseState('{nope'), null);
    assert.equal(parseState(null), null);
  });
});

describe('createStorage load', () => {
  it('loads from the server when /api/state answers', async () => {
    const calls = [];
    const fetch = async (url) => {
      calls.push(url);
      return okJson(oldState())();
    };
    const s = createStorage({ fetch, localStorage: memoryStore() });
    const got = await s.loadServer();
    assert.equal(calls[0], '/api/state');
    assert.equal(got.sessions.length, 2);
    assert.equal(got.schemaVersion, 1);
  });

  it('treats an empty server file as reachable but empty', async () => {
    const s = createStorage({ fetch: okJson({}), localStorage: memoryStore() });
    const got = await s.loadServer();
    assert.notEqual(got, null);
    assert.deepEqual(got.sessions ?? [], []);
  });

  it('returns null when the endpoint is missing (404)', async () => {
    const fetch = async () => ({ ok: false, json: async () => ({}) });
    const s = createStorage({ fetch, localStorage: memoryStore() });
    assert.equal(await s.loadServer(), null);
  });

  it('returns null when fetch rejects', async () => {
    const s = createStorage({
      fetch: async () => {
        throw new Error('offline');
      },
      localStorage: memoryStore(),
    });
    assert.equal(await s.loadServer(), null);
  });

  it('returns null when the server times out', async () => {
    const s = createStorage({
      fetch: () => new Promise(() => {}),
      localStorage: memoryStore(),
      timeoutMs: 20,
    });
    assert.equal(await s.loadServer(), null);
  });

  it('works without fetch at all', async () => {
    const s = createStorage({ fetch: null, localStorage: memoryStore() });
    assert.equal(await s.loadServer(), null);
  });

  it('falls back to localStorage and migrates the old shape', () => {
    const ls = memoryStore({ [LS_KEY]: JSON.stringify(oldState()) });
    const s = createStorage({ fetch: null, localStorage: ls });
    const got = s.loadLocal();
    assert.equal(got.sessions.length, 2);
    assert.equal(got.schemaVersion, 1);
  });

  it('corrupt localStorage JSON does not crash', () => {
    const ls = memoryStore({ [LS_KEY]: '{broken', [DRAFT_KEY]: '{broken' });
    const s = createStorage({ fetch: null, localStorage: ls });
    assert.equal(s.loadLocal(), null);
    assert.equal(s.loadDraft(), null);
  });

  it('missing localStorage object does not crash', () => {
    const s = createStorage({ fetch: null, localStorage: null });
    assert.equal(s.loadLocal(), null);
    s.saveLocal({ sessions: [] });
    s.saveDraft({ startedAt: 1, steps: [] });
    assert.equal(s.loadDraft(), null);
  });

  it('a throwing localStorage does not crash', () => {
    const bad = {
      getItem() {
        throw new Error('x');
      },
      setItem() {
        throw new Error('x');
      },
      removeItem() {
        throw new Error('x');
      },
    };
    const s = createStorage({ fetch: null, localStorage: bad });
    assert.equal(s.loadLocal(), null);
    s.saveLocal({ sessions: [] });
    s.clearDraft();
    assert.equal(s.loadDraft(), null);
  });
});

describe('createStorage save', () => {
  it('save writes localStorage and PUTs to the server with schemaVersion', async () => {
    const ls = memoryStore();
    const puts = [];
    const fetch = async (url, opts) => {
      puts.push({ url, opts });
      return { ok: true };
    };
    const s = createStorage({ fetch, localStorage: ls });
    const res = await s.save(oldState(), { server: true });
    assert.equal(res.ok, true);
    assert.equal(JSON.parse(ls.data[LS_KEY]).schemaVersion, 1);
    assert.equal(puts[0].url, '/api/state');
    assert.equal(puts[0].opts.method, 'PUT');
    assert.equal(puts[0].opts.headers['Content-Type'], 'application/json');
    const body = JSON.parse(puts[0].opts.body);
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.sessions.length, 2);
  });

  it('save skips the server when not in server mode', async () => {
    let called = false;
    const s = createStorage({
      fetch: async () => {
        called = true;
        return { ok: true };
      },
      localStorage: memoryStore(),
    });
    const res = await s.save(oldState(), { server: false });
    assert.equal(called, false);
    assert.equal(res.ok, true);
  });

  it('save reports a server failure but still wrote locally', async () => {
    const ls = memoryStore();
    const s = createStorage({ fetch: async () => ({ ok: false }), localStorage: ls });
    const res = await s.save(oldState(), { server: true });
    assert.equal(res.ok, false);
    assert.ok(ls.data[LS_KEY]);
  });

  it('save reports a rejected fetch as a failure', async () => {
    const s = createStorage({
      fetch: async () => {
        throw new Error('x');
      },
      localStorage: memoryStore(),
    });
    assert.equal((await s.save(oldState(), { server: true })).ok, false);
  });
});

describe('draft', () => {
  const draft = (over = {}) => ({ startedAt: 1000, steps: [1], phase: 'work', ...over });

  it('saves, loads and clears under treinoRR.draft', () => {
    const ls = memoryStore();
    const s = createStorage({ fetch: null, localStorage: ls, now: () => 2000 });
    s.saveDraft(draft());
    assert.ok(ls.data[DRAFT_KEY]);
    assert.deepEqual(s.loadDraft(), draft());
    s.clearDraft();
    assert.equal(ls.data[DRAFT_KEY], undefined);
    assert.equal(s.loadDraft(), null);
  });

  it('does not save a finished (summary) or null workout', () => {
    const ls = memoryStore();
    const s = createStorage({ fetch: null, localStorage: ls });
    s.saveDraft(draft({ phase: 'summary' }));
    s.saveDraft(null);
    assert.equal(ls.data[DRAFT_KEY], undefined);
  });

  it('ignores drafts older than 8 hours or without steps', () => {
    const ls = memoryStore();
    const s = createStorage({ fetch: null, localStorage: ls, now: () => 1000 + 8 * 3600 * 1000 });
    s.saveDraft(draft());
    assert.equal(s.loadDraft(), null);
    const s2 = createStorage({ fetch: null, localStorage: ls, now: () => 2000 });
    ls.data[DRAFT_KEY] = JSON.stringify({ startedAt: 1000 });
    assert.equal(s2.loadDraft(), null);
  });
});
