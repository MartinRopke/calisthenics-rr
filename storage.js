/* Storage adapter: server file (/api/state), localStorage and the workout draft.
   Pure parts (migrate, serializeState, parseState) have no side effects.
   createStorage takes its dependencies (fetch, localStorage, clock) so Node tests need no browser. */

export const SCHEMA_VERSION = 1;
export const LS_KEY = 'treinoRR.v1';
export const DRAFT_KEY = 'treinoRR.draft';
export const API_URL = '/api/state';
const DRAFT_MAX_AGE_MS = 8 * 3600 * 1000;

const isPlainObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/* Brings a loaded state up to SCHEMA_VERSION. Returns a new object, never mutates the input.
   State saved before versioning has no schemaVersion: it keeps every field and gets the stamp. */
export function migrate(obj) {
  if (!isPlainObject(obj)) return null;
  const out = { ...obj };
  if (typeof out.schemaVersion !== 'number') out.schemaVersion = SCHEMA_VERSION;
  return out;
}

/* JSON text to persist: the state plus schemaVersion. `sessions` stays an array (server.mjs checks it). */
export function serializeState(state) {
  return JSON.stringify({ ...state, schemaVersion: SCHEMA_VERSION });
}

/* Parses stored JSON text and migrates it. Returns null when empty or corrupt. */
export function parseState(raw) {
  if (!raw) return null;
  try { return migrate(JSON.parse(raw)); } catch { return null; }
}

export function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/* Defaults are read lazily so importing this file in Node never touches browser globals. */
export function createStorage({
  fetch: fetchFn = typeof globalThis.fetch === 'function' ? (...a) => globalThis.fetch(...a) : null,
  localStorage: ls = globalThis.localStorage,
  timeoutMs = 3000,
  now = Date.now,
} = {}) {
  const lsGet = (key) => { try { return ls ? ls.getItem(key) : null; } catch { return null; } };
  const lsSet = (key, value) => { try { if (ls) ls.setItem(key, value); } catch { /* storage full or blocked */ } };
  const lsRemove = (key) => { try { if (ls) ls.removeItem(key); } catch { /* ignore */ } };

  /* Server copy, migrated. null when the endpoint is missing, fails or times out. */
  async function loadServer() {
    if (!fetchFn) return null;
    try {
      const r = await withTimeout(fetchFn(API_URL, { cache: 'no-store' }), timeoutMs);
      if (!r.ok) return null;
      return migrate(await r.json());
    } catch { return null; }
  }

  const loadLocal = () => parseState(lsGet(LS_KEY));
  const saveLocal = (state) => lsSet(LS_KEY, serializeState(state));

  /* PUTs the state to the server file. Resolves { ok }. */
  async function pushServer(state) {
    if (!fetchFn) return { ok: false };
    try {
      const r = await fetchFn(API_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: serializeState(state) });
      return { ok: !!r.ok };
    } catch { return { ok: false }; }
  }

  /* Writes localStorage always and the server file when opts.server is true. Resolves { ok }. */
  async function save(state, { server = false } = {}) {
    saveLocal(state);
    return server ? pushServer(state) : { ok: true };
  }

  const saveDraft = (w) => { if (w && w.phase !== 'summary') lsSet(DRAFT_KEY, JSON.stringify(w)); };
  const clearDraft = () => lsRemove(DRAFT_KEY);
  function loadDraft() {
    try {
      const d = JSON.parse(lsGet(DRAFT_KEY) || 'null');
      if (d && d.startedAt && now() - d.startedAt < DRAFT_MAX_AGE_MS && d.steps) return d;
    } catch { /* corrupt draft */ }
    return null;
  }

  return { loadServer, loadLocal, saveLocal, pushServer, save, saveDraft, clearDraft, loadDraft };
}
