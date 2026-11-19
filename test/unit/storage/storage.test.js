import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHistoryStore,
  mergeBackup,
  UNSYNCED_KEY,
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

const defaults = () => ({
  v: 1,
  settings: { hasBar: false, hasDip: false, restMain: 90, restCore: 60 },
  levels: { pull: { idx: 0 }, squat: { idx: 0 }, hinge: { idx: 0 } },
  sessions: [],
});
const sess = (id, date = '2026-10-0' + id.slice(1)) => ({ id, date, entries: {} });
const stateWith = (...sessions) => ({ ...defaults(), sessions });

// A fake /api/state: GET answers `file` (null = endpoint missing), PUTs are recorded and answer `putOk`.
const fakeServer = ({ file = null, putOk = true, hangPut = false } = {}) => {
  const srv = { file, puts: [], putOk, release: [] };
  srv.fetch = async (url, opts = {}) => {
    if (opts.method === 'PUT') {
      srv.puts.push(JSON.parse(opts.body));
      if (hangPut) await new Promise((r) => srv.release.push(r));
      return { ok: srv.putOk };
    }
    if (srv.file === null) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => JSON.parse(JSON.stringify(srv.file)) };
  };
  return srv;
};
const ids = (state) => state.sessions.map((s) => s.id);

describe('history store load: the server file is the source of truth', () => {
  it('uses the file and drops a session that only the browser copy still has', async () => {
    const srv = fakeServer({ file: stateWith(sess('s1')) });
    const ls = memoryStore({ [LS_KEY]: JSON.stringify(stateWith(sess('s1'), sess('s2'))) });
    const store = createHistoryStore({ fetch: srv.fetch, localStorage: ls });
    const got = await store.load(defaults());
    assert.deepEqual(ids(got), ['s1']);
    assert.deepEqual(ids(JSON.parse(ls.data[LS_KEY])), ['s1']);
    assert.equal(store.status(), 'file');
    assert.equal(srv.puts.length, 0);
  });

  it('sends an unsynced browser copy to the file and keeps it', async () => {
    const srv = fakeServer({ file: stateWith(sess('s1')) });
    const ls = memoryStore({
      [LS_KEY]: JSON.stringify(stateWith(sess('s1'), sess('s2'))),
      [UNSYNCED_KEY]: '1',
    });
    const store = createHistoryStore({ fetch: srv.fetch, localStorage: ls });
    const got = await store.load(defaults());
    assert.deepEqual(ids(got), ['s1', 's2']);
    assert.deepEqual(ids(srv.puts[0]), ['s1', 's2']);
    assert.equal(UNSYNCED_KEY in ls.data, false);
    assert.equal(store.status(), 'file');
  });

  it('sends the browser copy to a file that was never written', async () => {
    const srv = fakeServer({ file: {} });
    const ls = memoryStore({ [LS_KEY]: JSON.stringify(stateWith(sess('s1'))) });
    const store = createHistoryStore({ fetch: srv.fetch, localStorage: ls });
    const got = await store.load(defaults());
    assert.deepEqual(ids(got), ['s1']);
    assert.deepEqual(ids(srv.puts[0]), ['s1']);
  });

  it('uses the browser copy when the file is missing', async () => {
    const srv = fakeServer({ file: null });
    const ls = memoryStore({ [LS_KEY]: JSON.stringify(stateWith(sess('s1'))) });
    const store = createHistoryStore({ fetch: srv.fetch, localStorage: ls });
    assert.deepEqual(ids(await store.load(defaults())), ['s1']);
    assert.equal(store.status(), 'local');
  });

  it('uses the browser copy when the file times out', async () => {
    const ls = memoryStore({ [LS_KEY]: JSON.stringify(stateWith(sess('s1'))) });
    const store = createHistoryStore({
      fetch: () => new Promise(() => {}),
      localStorage: ls,
      timeoutMs: 20,
    });
    assert.deepEqual(ids(await store.load(defaults())), ['s1']);
    assert.equal(store.status(), 'local');
  });

  it('works without fetch or browser storage at all', async () => {
    const store = createHistoryStore({ fetch: null, localStorage: null });
    assert.deepEqual(await store.load(defaults()), defaults());
    assert.equal(store.status(), 'local');
  });

  it('fills missing keys from the defaults and ignores unknown levels', async () => {
    const file = { settings: { hasBar: true }, levels: { squat: { idx: 2 }, old: { idx: 9 } } };
    const store = createHistoryStore({
      fetch: fakeServer({ file }).fetch,
      localStorage: memoryStore(),
    });
    const got = await store.load(defaults());
    assert.deepEqual(got.settings, { ...defaults().settings, hasBar: true });
    assert.deepEqual(got.levels, { ...defaults().levels, squat: { idx: 2 } });
    assert.deepEqual(got.sessions, []);
    assert.equal(got.v, 1);
  });

  it('migrates a browser copy saved before schemaVersion', async () => {
    const ls = memoryStore({ [LS_KEY]: JSON.stringify(oldState()) });
    const store = createHistoryStore({ fetch: null, localStorage: ls });
    assert.deepEqual(ids(await store.load(defaults())), ['s1', 's2']);
  });

  it('survives corrupt or throwing browser storage', async () => {
    const corrupt = memoryStore({ [LS_KEY]: '{broken', [DRAFT_KEY]: '{broken' });
    const s1 = createHistoryStore({ fetch: null, localStorage: corrupt });
    assert.deepEqual(await s1.load(defaults()), defaults());
    assert.equal(s1.loadDraft(), null);
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
    const s2 = createHistoryStore({ fetch: null, localStorage: bad });
    assert.deepEqual(await s2.load(defaults()), defaults());
    await s2.save(defaults());
    s2.clearDraft();
    assert.equal(s2.loadDraft(), null);
  });
});

const loadedStore = async (srv, ls = memoryStore()) => {
  const store = createHistoryStore({ fetch: srv.fetch, localStorage: ls });
  await store.load(defaults());
  return store;
};

describe('history store save', () => {
  it('writes the browser copy and PUTs the state with schemaVersion to the file', async () => {
    const srv = fakeServer({ file: stateWith() });
    const ls = memoryStore();
    const store = await loadedStore(srv, ls);
    await store.save(stateWith(sess('s1')));
    assert.deepEqual(ids(JSON.parse(ls.data[LS_KEY])), ['s1']);
    assert.equal(srv.puts.length, 1);
    assert.equal(srv.puts[0].schemaVersion, 1);
    assert.equal(UNSYNCED_KEY in srv.puts[0], false);
    assert.equal(store.status(), 'file');
  });

  it('marks the browser copy unsynced when the file save fails, and clears it on the next success', async () => {
    const srv = fakeServer({ file: stateWith() });
    const ls = memoryStore();
    const store = await loadedStore(srv, ls);
    srv.putOk = false;
    await store.save(stateWith(sess('s1')));
    assert.equal(ls.data[UNSYNCED_KEY], '1');
    assert.equal(store.status(), 'file-error');
    srv.putOk = true;
    await store.save(stateWith(sess('s1')));
    assert.equal(UNSYNCED_KEY in ls.data, false);
    assert.equal(store.status(), 'file');
  });

  it('a failed save reaches the file on the next load', async () => {
    const srv = fakeServer({ file: stateWith() });
    const ls = memoryStore();
    const store = await loadedStore(srv, ls);
    srv.putOk = false;
    await store.save(stateWith(sess('s1')));
    srv.putOk = true;
    srv.puts.length = 0;
    const again = createHistoryStore({ fetch: srv.fetch, localStorage: ls });
    assert.deepEqual(ids(await again.load(defaults())), ['s1']);
    assert.deepEqual(ids(srv.puts[0]), ['s1']);
  });

  it('a save made while the file was unreachable at load reaches the file on the next load', async () => {
    const srv = fakeServer({ file: null });
    const ls = memoryStore();
    const store = await loadedStore(srv, ls);
    await store.save(stateWith(sess('s1')));
    assert.equal(srv.puts.length, 0);
    srv.file = stateWith();
    const again = createHistoryStore({ fetch: srv.fetch, localStorage: ls });
    assert.deepEqual(ids(await again.load(defaults())), ['s1']);
    assert.deepEqual(ids(srv.puts[0]), ['s1']);
  });

  it('sends saves one at a time, and only the newest of those that piled up', async () => {
    const srv = fakeServer({ file: stateWith(), hangPut: true });
    const store = await loadedStore(srv);
    const done = [
      store.save(stateWith(sess('s1'))),
      store.save(stateWith(sess('s1'), sess('s2'))),
      store.save(stateWith(sess('s1'), sess('s2'), sess('s3'))),
    ];
    await new Promise((r) => setImmediate(r));
    assert.equal(srv.puts.length, 1);
    srv.release.shift()();
    await new Promise((r) => setImmediate(r));
    assert.equal(srv.puts.length, 2);
    assert.deepEqual(ids(srv.puts[1]), ['s1', 's2', 's3']);
    srv.release.shift()();
    await Promise.all(done);
    assert.equal(srv.puts.length, 2);
  });

  it('tells listeners when the status changes', async () => {
    const srv = fakeServer({ file: stateWith() });
    const store = createHistoryStore({ fetch: srv.fetch, localStorage: memoryStore() });
    const seen = [];
    store.onStatus((code) => seen.push(code));
    assert.equal(store.status(), 'loading');
    await store.load(defaults());
    srv.putOk = false;
    await store.save(stateWith());
    assert.deepEqual(seen, ['file', 'file-error']);
  });
});

describe('backup import', () => {
  it('adds the backup sessions by id, sorted by date, and never removes any', () => {
    const state = stateWith(sess('s2', '2026-10-07'), sess('s4', '2026-10-20'));
    const backup = stateWith(sess('s1', '2026-10-01'), sess('s2', '2026-10-07'));
    assert.deepEqual(ids(mergeBackup(state, backup)), ['s1', 's2', 's4']);
  });

  it('takes the settings and known levels from the backup', () => {
    const backup = { settings: { hasBar: true }, levels: { squat: { idx: 3 }, old: { idx: 1 } } };
    const got = mergeBackup(stateWith(), { ...backup, sessions: [] });
    assert.equal(got.settings.hasBar, true);
    assert.equal(got.settings.restMain, 90);
    assert.deepEqual(got.levels.squat, { idx: 3 });
    assert.equal('old' in got.levels, false);
  });

  it('does not mutate its inputs', () => {
    const state = stateWith(sess('s2'));
    const backup = stateWith(sess('s1'));
    mergeBackup(state, backup);
    assert.deepEqual(ids(state), ['s2']);
  });
});

describe('draft', () => {
  const draft = (over = {}) => ({ startedAt: 1000, steps: [1], phase: 'work', ...over });

  it('saves, loads and clears under treinoRR.draft', () => {
    const ls = memoryStore();
    const s = createHistoryStore({ fetch: null, localStorage: ls, now: () => 2000 });
    s.saveDraft(draft());
    assert.ok(ls.data[DRAFT_KEY]);
    assert.deepEqual(s.loadDraft(), draft());
    s.clearDraft();
    assert.equal(ls.data[DRAFT_KEY], undefined);
    assert.equal(s.loadDraft(), null);
  });

  it('does not save a finished (summary) or null workout', () => {
    const ls = memoryStore();
    const s = createHistoryStore({ fetch: null, localStorage: ls });
    s.saveDraft(draft({ phase: 'summary' }));
    s.saveDraft(null);
    assert.equal(ls.data[DRAFT_KEY], undefined);
  });

  it('ignores drafts older than 8 hours or without steps', () => {
    const ls = memoryStore();
    const s = createHistoryStore({
      fetch: null,
      localStorage: ls,
      now: () => 1000 + 8 * 3600 * 1000,
    });
    s.saveDraft(draft());
    assert.equal(s.loadDraft(), null);
    const s2 = createHistoryStore({ fetch: null, localStorage: ls, now: () => 2000 });
    ls.data[DRAFT_KEY] = JSON.stringify({ startedAt: 1000 });
    assert.equal(s2.loadDraft(), null);
  });
});
