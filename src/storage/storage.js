/* History store: loads and saves the state, reports the sync status and keeps the workout draft.
   The server file (/api/state) is the source of truth whenever it answers (ADR 0013). The browser copy in
   localStorage is a cache that only wins while it is marked unsynced, and is then sent to the file.
   Pure parts (migrate, serializeState, parseState, mergeBackup) have no side effects.
   createHistoryStore takes its dependencies (fetch, localStorage, clock) so Node tests need no browser. */

import { WORKOUT_VERSION } from '../domain/workout.js';
import { sortSessions } from '../domain/logic.js';

export const SCHEMA_VERSION = 1;
export const LS_KEY = 'treinoRR.v1';
export const DRAFT_KEY = 'treinoRR.draft';
/* Set while the browser copy holds changes the file does not have yet. Never part of the saved state. */
export const UNSYNCED_KEY = 'treinoRR.unsynced';
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
  try {
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/* Levels of the exercises `levels` already knows, taken from `from`. Returns a new object. */
function knownLevels(levels, from) {
  const out = { ...levels };
  for (const k of Object.keys(from || {})) if (out[k] && from[k]) out[k] = from[k];
  return out;
}

/* The full state: missing keys come from the defaults, levels only for exercises the defaults know. */
function withDefaults(loaded, defaults) {
  const base = loaded || {};
  return {
    ...defaults,
    settings: { ...defaults.settings, ...(base.settings || {}) },
    levels: knownLevels(defaults.levels, base.levels),
    sessions: Array.isArray(base.sessions) ? base.sessions.filter((x) => x && x.id) : [],
  };
}

/* Backup import is additive: sessions from the backup are added by id and sorted by date. Settings and the
   levels of known exercises come from the backup. Returns a new state, never mutates its inputs. */
export function mergeBackup(state, backup) {
  const settings = { ...state.settings, ...(backup.settings || {}) };
  const levels = knownLevels(state.levels, backup.levels);
  const seen = new Set(state.sessions.map((x) => x.id));
  const sessions = state.sessions.slice();
  for (const x of backup.sessions || [])
    if (x && x.id && !seen.has(x.id)) {
      sessions.push(x);
      seen.add(x.id);
    }
  return { ...state, settings, levels, sessions: sortSessions(sessions) };
}

/* Sync status codes. The Settings view words them. */
export const SYNC = { LOADING: 'loading', FILE: 'file', FILE_ERROR: 'file-error', LOCAL: 'local' };

/* Defaults are read lazily so importing this file in Node never touches browser globals. */
export function createHistoryStore({
  fetch: fetchFn = typeof globalThis.fetch === 'function' ? (...a) => globalThis.fetch(...a) : null,
  localStorage: ls = globalThis.localStorage,
  timeoutMs = 3000,
  now = Date.now,
} = {}) {
  const lsGet = (key) => {
    try {
      return ls ? ls.getItem(key) : null;
    } catch {
      return null;
    }
  };
  const lsSet = (key, value) => {
    try {
      if (ls) ls.setItem(key, value);
    } catch {
      /* storage full or blocked */
    }
  };
  const lsRemove = (key) => {
    try {
      if (ls) ls.removeItem(key);
    } catch {
      /* ignore */
    }
  };

  let status = SYNC.LOADING;
  let fileMode = false;
  const listeners = [];
  const setStatus = (code) => {
    if (code === status) return;
    status = code;
    for (const fn of listeners) fn(code);
  };
  const markUnsynced = (on) => (on ? lsSet(UNSYNCED_KEY, '1') : lsRemove(UNSYNCED_KEY));

  /* Server copy, migrated. null when the endpoint is missing, fails or times out. */
  async function loadFile() {
    if (!fetchFn) return null;
    try {
      const r = await withTimeout(fetchFn(API_URL, { cache: 'no-store' }), timeoutMs);
      if (!r.ok) return null;
      return migrate(await r.json());
    } catch {
      return null;
    }
  }
  async function putFile(body) {
    try {
      const r = await withTimeout(
        fetchFn(API_URL, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body,
        }),
        timeoutMs
      );
      return !!r.ok;
    } catch {
      return false;
    }
  }

  /* Saves to the file run one at a time. While one is in flight only the newest state waits for its turn. */
  let pending = null;
  let running = null;
  async function drain() {
    while (pending) {
      const body = pending;
      pending = null;
      const ok = await putFile(body);
      markUnsynced(!ok);
      setStatus(ok ? SYNC.FILE : SYNC.FILE_ERROR);
    }
    running = null;
  }

  /* Writes the browser copy at once, then queues the file. Resolves once the file has the newest state
     (or the save failed). Without a file the browser copy stays marked unsynced for the next load. */
  function save(state) {
    const body = serializeState(state);
    lsSet(LS_KEY, body);
    if (!fileMode) {
      markUnsynced(true);
      return Promise.resolve();
    }
    pending = body;
    if (!running) running = drain();
    return running;
  }

  async function load(defaults) {
    const local = parseState(lsGet(LS_KEY));
    const unsynced = lsGet(UNSYNCED_KEY) === '1';
    const file = await loadFile();
    if (!file) {
      setStatus(SYNC.LOCAL);
      return withDefaults(local, defaults);
    }
    fileMode = true;
    const neverWritten = !Array.isArray(file.sessions);
    if (local && (unsynced || neverWritten)) {
      const state = withDefaults(local, defaults);
      await save(state);
      return state;
    }
    const state = withDefaults(file, defaults);
    lsSet(LS_KEY, serializeState(state));
    markUnsynced(false);
    setStatus(SYNC.FILE);
    return state;
  }

  const saveDraft = (w) => {
    if (w && w.phase !== 'summary') lsSet(DRAFT_KEY, JSON.stringify(w));
  };
  const clearDraft = () => lsRemove(DRAFT_KEY);
  function loadDraft() {
    try {
      const d = JSON.parse(lsGet(DRAFT_KEY) || 'null');
      if (
        d &&
        d.v === WORKOUT_VERSION &&
        d.startedAt &&
        now() - d.startedAt < DRAFT_MAX_AGE_MS &&
        d.steps
      )
        return d;
    } catch {
      /* corrupt draft, or one saved by older code */
    }
    return null;
  }

  return {
    load,
    save,
    status: () => status,
    onStatus: (fn) => listeners.push(fn),
    saveDraft,
    clearDraft,
    loadDraft,
  };
}
