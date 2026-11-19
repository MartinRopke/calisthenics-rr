/* App: screens, guided workout and storage. Imports data.js, videos.js and logic.js. */
import { SLOTS, LADDERS, SLOT_ORDER, WARMUP, WIKI_BASE, ytUrl } from './domain/data.js';
import { VIDEOS } from './domain/videos.js';
import { resumeTimers } from './domain/timer.js';
import { createAudio } from './audio/audio.js';
import { scheduleSfx } from './audio/schedule.js';
import {
  ICON_EQUIP,
  esc,
  shortDate,
  todayProjection,
  viewToday,
  viewProgress,
  viewSettings,
  tabbar,
  videoEmbedUrl,
  videoWatchUrl,
  videoCommand,
} from './ui/views.js';
import {
  isoDate,
  defaultState,
  ladderOf,
  currentLevel,
  isActive,
  prescribe,
  setResult,
  SIDE_SWITCH_SECS,
  buildSteps,
  restSeconds,
  warmupItems,
  finishWorkout,
  seriesFor,
  sessionSummaryText,
} from './domain/logic.js';
import { createStorage } from './storage/storage.js';

const store = createStorage();

let state = defaultState();
let tab = 'today';
let W = null; /* workout in progress */
let progTab = 'overview'; /* Progress screen tab: overview, exercises, history */
let dayIdx = 0,
  previewWarm = null; /* day shown on the Today screen: 0 = today, 1..3 = upcoming */
let sheetCtx = null; /* {slot, ctx} of the open sheet */
let sync = { mode: 'local', note: 'Loading…' };
const audio = createAudio(window.AudioContext || window.webkitAudioContext);
let wakeLock = null,
  tickTimer = null,
  toastTimer = null;

function $(s) {
  return document.querySelector(s);
}

/* ---------- Storage ---------- */
let fileMode = false,
  fileQueue = Promise.resolve();
const FILE_NOTE = 'Saved to the file data/treino.json on this computer.';
function filePush() {
  if (!fileMode) return;
  const snap = JSON.parse(JSON.stringify(state));
  fileQueue = fileQueue
    .then(function () {
      return store.pushServer(snap);
    })
    .then(function (r) {
      if (!r.ok) throw new Error('http');
      sync.err = false;
      sync.note = FILE_NOTE;
    })
    .catch(function () {
      sync.err = true;
      sync.note = 'Could not save to the file. Your data stays in this browser.';
      if (tab === 'settings') render();
    });
}
async function fileInit() {
  try {
    const srv = await store.loadServer();
    if (!srv) return false;
    mergeLoaded(srv, null);
    fileMode = true;
    sync = { mode: 'file', note: FILE_NOTE };
    filePush();
    return true;
  } catch {
    return false;
  }
}
function localSave() {
  store.saveLocal(state);
  filePush();
}
function localLoad() {
  mergeLoaded(store.loadLocal(), null);
}
function mergeLoaded(obj, only) {
  if (!obj) return;
  if (obj.settings)
    Object.keys(obj.settings).forEach(function (k) {
      state.settings[k] = obj.settings[k];
    });
  if (obj.levels)
    Object.keys(obj.levels).forEach(function (k) {
      if (state.levels[k] && obj.levels[k]) state.levels[k] = obj.levels[k];
    });
  if (obj.sessions && only !== 'profile') {
    const ids = {};
    state.sessions.forEach(function (s) {
      ids[s.id] = 1;
    });
    obj.sessions.forEach(function (s) {
      if (s && s.id && !ids[s.id]) {
        state.sessions.push(s);
        ids[s.id] = 1;
      }
    });
    state.sessions.sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1;
    });
  }
}
function persistProfile() {
  localSave();
}
async function initStorage() {
  localLoad();
  if (await fileInit()) {
    localSave();
    return;
  }
  sync = { mode: 'local', note: 'No server file here: your data stays only in this browser.' };
}

/* ---------- Workout draft ---------- */
function saveDraft() {
  store.saveDraft(W);
}
function clearDraft() {
  store.clearDraft();
}
function loadDraft() {
  return store.loadDraft();
}

/* ---------- Small formatters ---------- */
function toast(msg) {
  const t = $('#toast');
  t.innerHTML = '<div class="toast" role="status">' + esc(msg) + '</div>';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    t.innerHTML = '';
  }, 2200);
}

/* ---------- Screens ---------- */
let lastTab = '';
function render() {
  let v;
  if (tab === 'today') {
    const today = isoDate(),
      plan = todayProjection(state, today);
    if (dayIdx > plan.proj.length) dayIdx = 0;
    previewWarm = dayIdx > 0 ? plan.proj[dayIdx - 1].warm : null;
    v = viewToday(state, {
      today: today,
      now: new Date(),
      draft: W ? null : loadDraft(),
      dayIdx: dayIdx,
    });
  } else if (tab === 'progress') v = viewProgress(state, { today: isoDate(), progTab: progTab });
  else v = viewSettings(state, { syncNote: sync.note });
  $('#app').innerHTML =
    '<div class="' + (tab !== lastTab ? 'view-enter' : '') + '">' + v + '</div>' + tabbar(tab);
  lastTab = tab;
}

/* ---------- Exercise sheet ---------- */
/* Video: the box shows the thumbnail and only loads the player when tapped (saves data and avoids restarting on every screen). */
function videoHtml(key, q) {
  const v = VIDEOS[key];
  if (!v)
    return (
      '<a class="vid-link" href="' +
      ytUrl(q) +
      '" target="_blank" rel="noopener">Search for a video on YouTube</a>'
    );
  return (
    '<div class="vid-box"><div class="vid"><iframe src="' +
    videoEmbedUrl(v.id) +
    '" title="' +
    esc(v.t) +
    '" loading="lazy" onload="this.classList.add(&quot;ok&quot;)" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>' +
    '<a class="vid-fallback" href="' +
    videoWatchUrl(v.id) +
    '" target="_blank" rel="noopener">Video not loading? Open on YouTube</a></div>' +
    '<p class="vid-cap">' +
    esc(v.t) +
    ' · ' +
    esc(v.c) +
    '</p></div>'
  );
}
/* Switches the captions off in a YouTube player: after it loads (and again as it reports ready), tell it to
   unload its captions module. cc_load_policy=0 in the URL is only a default. */
const YT_ORIGIN = 'https://www.youtube-nocookie.com';
function muteCaptions(frame) {
  const send = () => {
    try {
      const w = frame.contentWindow;
      w.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YT_ORIGIN);
      w.postMessage(videoCommand('unloadModule', ['captions']), YT_ORIGIN);
    } catch {
      /* the frame is gone or not ready: the next try will do */
    }
  };
  for (let ms = 0; ms <= 20000; ms += ms < 3000 ? 600 : 2000) setTimeout(send, ms);
}
document.addEventListener(
  'load',
  (e) => {
    if (e.target && e.target.tagName === 'IFRAME' && e.target.closest('.vid'))
      muteCaptions(e.target);
  },
  true
);
/* The player reports "onReady" once. Later messages (position updates, many per second) are ignored. */
const readySeen = new WeakSet();
window.addEventListener('message', (e) => {
  if (e.origin !== YT_ORIGIN || typeof e.data !== 'string') return;
  let msg;
  try {
    msg = JSON.parse(e.data);
  } catch {
    return;
  }
  if (!msg || msg.event !== 'onReady') return;
  const frame = [...document.querySelectorAll('.vid iframe')].find(
    (f) => f.contentWindow === e.source
  );
  if (frame && !readySeen.has(frame)) {
    readySeen.add(frame);
    muteCaptions(frame);
  }
});
function warmSwap(it) {
  const base = WARMUP.filter(function (w) {
    return w.id === (it.base || it.id);
  })[0];
  if (!base || !base.alts) return '';
  const cur = it.base ? it.id : '';
  return (
    '<div class="swap"><p class="muted small">No equipment? Swap it. Swaps are not from the guide.</p><div class="pathsel" role="group" aria-label="Swap exercise">' +
    '<button data-act="warm-swap" data-base="' +
    base.id +
    '" data-alt="" aria-pressed="' +
    !cur +
    '">' +
    'Band or t-shirt' +
    '</button>' +
    base.alts
      .map(function (a) {
        return (
          '<button data-act="warm-swap" data-base="' +
          base.id +
          '" data-alt="' +
          a.id +
          '" aria-pressed="' +
          (cur === a.id) +
          '">' +
          esc(a.label) +
          '</button>'
        );
      })
      .join('') +
    '</div></div>'
  );
}
function vidTabs(lvl) {
  if (!lvl.setup || !lvl.setup.length) return '';
  const q = esc(lvl.q + ' tutorial');
  return (
    '<div class="pathsel" role="group" aria-label="Equipment options"><button data-act="vid-tab" data-key="' +
    lvl.id +
    '" data-q="' +
    q +
    '" aria-pressed="true">' +
    esc(lvl.std) +
    '</button>' +
    lvl.setup
      .map(function (o) {
        return (
          '<button data-act="vid-tab" data-key="' +
          (o.k || '') +
          '" data-q="' +
          esc(lvl.q + ' ' + (o.q || 'at home')) +
          '" aria-pressed="false">' +
          esc(o.label) +
          '</button>'
        );
      })
      .join('') +
    '</div>'
  );
}
function vidBlock(lvl) {
  return (
    '<div class="vid-wrap">' +
    vidTabs(lvl) +
    '<div class="vid-slot">' +
    videoHtml(lvl.id, lvl.q + ' tutorial') +
    '</div></div>'
  );
}
function openSheet(slot, ctx, lvlId) {
  sheetCtx = { slot: slot, ctx: ctx, lvlId: lvlId || '' };
  renderSheet();
}
/* With the sheet open, the page behind does not scroll. On the workout screen it is already locked. */
function lockPage(on) {
  document.documentElement.classList.toggle('no-scroll', on);
  document.body.classList.toggle('no-scroll', on);
}
function closeSheet() {
  sheetCtx = null;
  $('#sheet').innerHTML = '';
  lockPage(!!W);
}
function levelLocked() {
  return !!(
    W &&
    sheetCtx &&
    sheetCtx.ctx === 'workout' &&
    W.logged[sheetCtx.slot] &&
    W.logged[sheetCtx.slot].sets.length
  );
}
function renderSheet() {
  if (!sheetCtx) return;
  lockPage(true);
  const slot = sheetCtx.slot,
    S = SLOTS[slot],
    lad = ladderOf(state, slot);
  let cur = state.levels[slot].idx,
    lvl = lad[cur];
  const preview = !!sheetCtx.lvlId;
  if (preview)
    lad.forEach(function (l, i) {
      if (l.id === sheetCtx.lvlId) {
        lvl = l;
        cur = i;
      }
    });
  const locked = levelLocked();
  const li = function (arr) {
    return (
      '<ul class="bul">' +
      arr
        .map(function (c) {
          return '<li>' + esc(c) + '</li>';
        })
        .join('') +
      '</ul>'
    );
  };
  let cuesHtml = lvl.cues.length ? li(lvl.cues) : li(S.general || []);
  if (lvl.cues.length && S.general && S.general.length)
    cuesHtml += '<h3>Form for every level</h3>' + li(S.general);
  const ladHtml =
    '<div class="ladder">' +
    lad
      .map(function (l, i) {
        return (
          '<button class="' +
          (i < cur ? 'done' : i === cur ? 'cur' : '') +
          (locked && i !== cur ? ' lock' : '') +
          '" data-act="pick-level" data-slot="' +
          slot +
          '" data-i="' +
          i +
          '"' +
          (locked ? ' disabled' : '') +
          '><span class="mark"></span><span>' +
          esc(l.name) +
          (i === cur ? ' · now' : '') +
          '</span></button>'
        );
      })
      .join('') +
    '</div>';
  const paths = LADDERS[slot].paths;
  let pathHtml = '';
  if (Object.keys(paths).length > 1 && !(sheetCtx.ctx === 'workout')) {
    pathHtml =
      '<h3>Variation</h3><div class="pathsel">' +
      Object.keys(paths)
        .map(function (k) {
          return (
            '<button data-act="set-path" data-slot="' +
            slot +
            '" data-path="' +
            k +
            '" aria-pressed="' +
            (k === state.levels[slot].path) +
            '">' +
            esc(paths[k].label) +
            '</button>'
          );
        })
        .join('') +
      '</div>';
  }
  const hist = seriesFor(state, slot)
    .slice(-3)
    .reverse()
    .map(function (s) {
      return (
        '<li>' +
        shortDate(s.date) +
        ' · ' +
        esc(s.name) +
        ' · ' +
        s.sets.join(' · ') +
        (s.kind === 'hold' ? ' s' : '') +
        '</li>'
      );
    })
    .join('');
  const html =
    '<div class="sheet-bg" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' +
    esc(lvl.name) +
    '"><div class="grab"></div>' +
    '<h2>' +
    esc(lvl.name) +
    '</h2><p class="muted" style="margin-top:6px">' +
    esc(S.label) +
    '. Works ' +
    esc(S.muscles.charAt(0).toLowerCase() + S.muscles.slice(1)) +
    '.</p>' +
    (lvl.equip
      ? '<span class="chip">' + ICON_EQUIP + ' Needs: ' + esc(lvl.equip) + '</span>'
      : '') +
    '<h3>How to</h3>' +
    cuesHtml +
    (lvl.note ? '<div class="note">' + esc(lvl.note) + '</div>' : '') +
    '<h3>Video</h3>' +
    vidBlock(lvl) +
    '<div class="links"><a href="' +
    ytUrl(lvl.q + ' tutorial') +
    '" target="_blank" rel="noopener">More videos on YouTube</a><a href="' +
    WIKI_BASE +
    S.wiki +
    '" target="_blank" rel="noopener">Guide on the r/bodyweightfitness wiki</a></div>' +
    (preview
      ? '<p class="muted small" style="margin-top:14px">This is a preview of a future workout. Your level only changes when you finish workouts.</p>'
      : '<h3>Progression ladder</h3>' +
        (locked
          ? '<p class="muted small" style="margin-bottom:6px">You already did sets of this exercise today, so the level can only change in your next workout.</p>'
          : '<p class="muted small" style="margin-bottom:6px">Tap a step to change level. Use it to adjust your starting point.</p>') +
        ladHtml +
        pathHtml) +
    (hist && !preview ? '<h3>Recent records</h3><ul class="bul">' + hist + '</ul>' : '') +
    '<div class="btn-row" style="margin-top:22px"><button class="btn ghost" data-act="sheet-close">Close</button></div></div>';
  $('#sheet').innerHTML = html;
}

function openWarm(id) {
  const it = (dayIdx > 0 && previewWarm ? previewWarm : warmupItems(state)).filter(function (x) {
    return x.id === id;
  })[0];
  if (!it) return;
  sheetCtx = null;
  $('#sheet').innerHTML =
    '<div class="sheet-bg" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' +
    esc(it.name) +
    '"><div class="grab"></div>' +
    '<h2>' +
    esc(it.name) +
    '</h2><p class="muted" style="margin-top:6px">Warm-up. ' +
    esc(it.n + ' ' + it.unit) +
    '.</p>' +
    (it.equip ? '<span class="chip">' + ICON_EQUIP + ' Needs: ' + esc(it.equip) + '</span>' : '') +
    '<h3>How to</h3><ul class="bul">' +
    it.how
      .map(function (c) {
        return '<li>' + esc(c) + '</li>';
      })
      .join('') +
    '</ul>' +
    (it.q ? '<h3>Video</h3>' + videoHtml('w.' + it.id, it.q) : '') +
    '<div class="btn-row" style="margin-top:22px"><button class="btn ghost" data-act="sheet-close">Close</button></div></div>';
}

function confirmBox(title, text, buttons) {
  $('#sheet').innerHTML =
    '<div class="sheet-bg" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' +
    esc(title) +
    '"><div class="grab"></div><h2>' +
    esc(title) +
    '</h2><p class="muted" style="margin-top:8px">' +
    esc(text) +
    '</p><div style="margin-top:18px;display:grid;gap:10px">' +
    buttons
      .map(function (b) {
        return (
          '<button class="btn ' +
          (b.cls || '') +
          '" data-act="' +
          b.act +
          '"' +
          (b.id ? ' data-id="' + esc(b.id) + '"' : '') +
          '>' +
          esc(b.label) +
          '</button>'
        );
      })
      .join('') +
    '</div></div>';
  sheetCtx = null;
}

/* ---------- Guided workout ---------- */
/* Chimes go into a queue so they do not overlap. Countdown beeps (onTime) skip the queue and play on the second. */
let sfxBase = 0,
  sfxBusy = 0;
function sfx(len, fn, onTime) {
  const now = audio.context ? audio.context.currentTime : 0;
  const plan = scheduleSfx({ now: now, busyUntil: sfxBusy, len: len, onTime: onTime });
  if (!plan) return; /* too late: discard */
  sfxBusy = plan.busyUntil;
  sfxBase = plan.offset;
  fn();
  sfxBase = 0;
}
function tone(freq, t, dur, vol) {
  try {
    const audioCtx = audio.ensureRunning();
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(),
      g = audioCtx.createGain(),
      at = audioCtx.currentTime + sfxBase + t;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol || 0.25, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.start(at);
    o.stop(at + dur + 0.02);
  } catch {
    /* optional feature, ignoring failure is fine */
  }
}
function tickBeep() {
  sfx(
    0.14,
    function () {
      tone(660, 0, 0.12);
    },
    true
  );
}
function goBeep() {
  sfx(
    0.47,
    function () {
      tone(1175, 0, 0.45, 0.3);
    },
    true
  );
  try {
    if (navigator.vibrate) navigator.vibrate(120);
  } catch {
    /* optional feature, ignoring failure is fine */
  }
}
function doneChime() {
  sfx(0.56, function () {
    tone(660, 0, 0.14, 0.2);
    tone(880, 0.12, 0.14, 0.2);
    tone(1320, 0.24, 0.3, 0.2);
  });
}
let lastCue = null;
function cue(key, n) {
  if (lastCue === key) return;
  lastCue = key;
  if (n > 0) tickBeep();
  else goBeep();
}
function prepAudio() {
  audio.ensureRunning();
  try {
    if (navigator.wakeLock && navigator.wakeLock.request)
      navigator.wakeLock.request('screen').then(
        function (l) {
          wakeLock = l;
        },
        function () {}
      );
  } catch {
    /* optional feature, ignoring failure is fine */
  }
}
function newWorkout() {
  const logged = {};
  SLOT_ORDER.filter(function (s) {
    return isActive(state, s);
  }).forEach(function (slot) {
    const p = prescribe(state, slot);
    logged[slot] = { levelId: p.level.id, sets: [], targets: p.targets };
  });
  return {
    startedAt: Date.now(),
    phase: 'warmup',
    warm: {},
    warmI: 0,
    warmEnd: 0,
    steps: buildSteps(state),
    i: 0,
    logged: logged,
    skipped: [],
    value: null,
    restEnd: 0,
    restTotal: 0,
    holdStart: null,
  };
}
function curStep() {
  return W.steps[W.i];
}
function levelOfStep(step) {
  const l = W.logged[step.slot];
  const lad = ladderOf(state, step.slot);
  for (let i = 0; i < lad.length; i++) if (lad[i].id === l.levelId) return lad[i];
  return currentLevel(state, step.slot);
}
function nextIndex(from) {
  for (let i = from; i < W.steps.length; i++) if (W.skipped.indexOf(W.steps[i].slot) < 0) return i;
  return -1;
}
function setDefault() {
  const st = curStep(),
    t = W.logged[st.slot].targets[st.set - 1];
  W.value = t;
  W.holdStart = null;
  W.side = 0;
  W.right = null;
}
/* Holds start on their own: lead = seconds of countdown before (0 when the rest just counted 3, 2, 1). */
function autoStartHold(lead) {
  W.holdTotal = Math.max(1, W.value || 0);
  W.holdStart = Date.now() + lead * 1000;
  lastCue = lead ? null : 'h' + W.i + ':go';
}
function goSet(idx, lead) {
  W.pausedAt = null;
  W.i = idx;
  W.phase = 'set';
  setDefault();
  if (levelOfStep(curStep()).kind === 'hold') autoStartHold(lead == null ? 3 : lead);
  saveDraft();
  renderWorkout();
}
function startWorkout() {
  W = newWorkout();
  prepAudio();
  startTick();
  saveDraft();
  renderWorkout();
}
function resumeWorkout() {
  W = loadDraft();
  if (!W) {
    render();
    return;
  }
  prepAudio();
  startTick();
  if (W.phase === 'rest' && clock() >= W.restEnd) {
    const n = nextIndex(W.i + 1);
    if (n >= 0) {
      goSet(n);
      return;
    }
  }
  renderWorkout();
}
function startTick() {
  clearInterval(tickTimer);
  tickTimer = setInterval(tick, 250);
}
function stopTick() {
  clearInterval(tickTimer);
  tickTimer = null;
  try {
    if (wakeLock && wakeLock.release) wakeLock.release();
  } catch {
    /* optional feature, ignoring failure is fine */
  }
  wakeLock = null;
}
function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60),
    s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
function subUpdate(label, pct) {
  const b = $('#subBar'),
    l = $('#subLabel');
  if (b) b.style.width = Math.max(0, Math.min(100, pct)) + '%';
  if (l) l.textContent = label;
}
function warmGoal(it) {
  return W.warmTotal || it.secs;
}
function holdGoal() {
  const st = curStep();
  return W.holdTotal || W.logged[st.slot].targets[st.set - 1];
}
function timerText(total, elapsed) {
  if (elapsed < 0) return String(Math.ceil(-elapsed));
  return Math.max(0, Math.ceil(total - elapsed)) + ' s';
}
/* During the 3, 2, 1 the adjust buttons are disabled. The time only changes after the count starts. */
function lockAdj(act, on) {
  const bs = document.querySelectorAll('[data-act="' + act + '"]');
  for (let i = 0; i < bs.length; i++) bs[i].disabled = on;
}
/* While paused every timer reads the moment the pause began, so the clocks stay frozen. */
function clock() {
  return (W && W.pausedAt) || Date.now();
}
function pauseBtn() {
  return (
    '<button class="btn ghost" data-act="w-pause">' +
    (W.pausedAt ? 'Resume' : 'Pause') +
    '</button>'
  );
}
function tick() {
  if (!W || W.pausedAt) return;
  /* The browser may suspend the audio mid-workout: wake it every second so the beeps are never lost. */
  if (audio.context && audio.context.state !== 'running') audio.ensureRunning();
  if (W.phase === 'rest') {
    const rem = (W.restEnd - clock()) / 1000,
      el = $('#restTime');
    if (el) el.textContent = fmtClock(rem);
    subUpdate(fmtClock(rem), 100 * (1 - rem / W.restTotal));
    if (rem > 0 && rem <= 3) cue('r' + W.i + ':' + Math.ceil(rem), Math.ceil(rem));
    if (rem <= 0) {
      lastCue = null;
      goBeep();
      const n = nextIndex(W.i + 1);
      if (n >= 0) goSet(n, 0);
      else finishNow();
    }
  } else if (W.phase === 'warmup' && W.warmEnd > 0) {
    const wit = warmupItems(state)[W.warmI || 0],
      wg = warmGoal(wit),
      wel = wg - (W.warmEnd - clock()) / 1000,
      we = $('#warmTime');
    if (wel < 0) {
      if (wel >= -3) cue('w' + W.warmI + ':' + Math.ceil(-wel), Math.ceil(-wel));
    } else if (wel < 1) cue('w' + W.warmI + ':go', 0);
    else if (wg - wel <= 3 && wg - wel > 0 && wg > 6)
      cue('w' + W.warmI + ':e' + Math.ceil(wg - wel), 1);
    if (we) we.textContent = timerText(wg, wel);
    lockAdj('w-warm-adj', wel < 0);
    if (wel >= wg) {
      lastCue = null;
      H['w-warm-next']();
    }
  } else if (W.phase === 'set' && W.holdStart) {
    const el2 = $('#holdTime'),
      hs = (clock() - W.holdStart) / 1000,
      htg = holdGoal();
    if (hs < 0) {
      if (hs >= -3) cue('h' + W.i + ':' + Math.ceil(-hs), Math.ceil(-hs));
    } else if (hs < 1) cue('h' + W.i + ':go', 0);
    else if (htg - hs <= 3 && htg - hs > 0 && htg > 6)
      cue('h' + W.i + ':e' + Math.ceil(htg - hs), 1);
    if (el2) el2.textContent = timerText(htg, hs);
    if (hs >= htg) {
      lastCue = null;
      H['w-log']();
    }
  }
}
function warmGo(d) {
  W.pausedAt = null;
  const n = warmupItems(state).length,
    i = (W.warmI || 0) + d;
  W.warmEnd = 0;
  if (i >= n) {
    H['w-begin']();
    return;
  }
  W.warmI = Math.max(0, i);
  const nx = warmupItems(state)[W.warmI];
  if (d > 0 && nx && nx.secs) {
    W.warmEnd = Date.now() + (nx.secs + 3) * 1000;
    W.warmTotal = nx.secs;
    lastCue = null;
  }
  saveDraft();
  renderWorkout();
}
/* One unit per warmup item and one per workout set. */
function progressInfo() {
  const wn = warmupItems(state).length,
    total = wn + W.steps.length;
  let d;
  if (W.phase === 'summary') d = total;
  else if (W.phase === 'warmup') d = Math.min(W.warmI || 0, wn);
  else d = wn + W.i + (W.phase === 'rest' ? 1 : 0);
  return { done: d, total: total };
}
function groupLabel(step) {
  if (step.group === 'core') return 'Core';
  return 'Pair ' + step.group.slice(1) + ' of 3';
}
let lastKey = '';
function renderWorkout() {
  const ov = $('#overlay');
  if (!W) {
    ov.innerHTML = '';
    document.body.classList.remove('no-scroll');
    return;
  }
  const segs = function () {
    const p = progressInfo();
    let h = '';
    for (let q = 0; q < p.total; q++)
      h += '<i class="' + (q < p.done ? 'done' : q === p.done ? 'cur' : '') + '"></i>';
    return (
      '<div class="w-segs" role="progressbar" aria-valuenow="' +
      p.done +
      '" aria-valuemin="0" aria-valuemax="' +
      p.total +
      '" aria-label="Workout progress">' +
      h +
      '</div>'
    );
  };
  const top = function (label, pct, sub) {
    return (
      '<div class="w-head"><div class="w-top"><button class="w-x" data-act="w-exit" aria-label="Leave workout">×</button><div class="w-bars"><div class="w-row">' +
      segs() +
      '<span class="w-count">' +
      label +
      '</span></div>' +
      (sub || '') +
      '</div></div></div>'
    );
  };
  const topFor = function (sub) {
    const p = progressInfo();
    return top(Math.min(p.done + 1, p.total) + '/' + p.total, (100 * p.done) / p.total, sub);
  };
  const subTime = function (label, pct) {
    return (
      '<div class="w-row"><div class="w-prog sub"><i id="subBar" style="width:' +
      pct +
      '%"></i></div><span class="w-count" id="subLabel">' +
      label +
      '</span></div>'
    );
  };
  let body = '';
  if (W.phase === 'warmup') {
    const items = warmupItems(state),
      wi = Math.min(W.warmI || 0, items.length - 1),
      it = items[wi];
    const hero =
      it.secs && W.warmEnd
        ? '<div class="w-hero timer"><button data-act="w-warm-adj" data-d="-20" aria-label="Minus 20 seconds">−20</button><span class="num" id="warmTime">' +
          (W.warmEnd < 0
            ? '0 s'
            : timerText(warmGoal(it), warmGoal(it) - (W.warmEnd - clock()) / 1000)) +
          '</span><button data-act="w-warm-adj" data-d="20" aria-label="Plus 20 seconds">+20</button></div>'
        : '<div class="w-hero"><span class="num">' +
          esc(it.n) +
          '</span><span class="unit">' +
          esc(it.unit) +
          '</span></div>';
    const main =
      it.secs && W.warmEnd
        ? pauseBtn() + '<button class="btn tape" data-act="w-warm-next">Done</button>'
        : it.secs
          ? '<button class="btn ghost" data-act="w-warm-timer">Start timer</button><button class="btn tape" data-act="w-warm-next">Done</button>'
          : '<button class="btn tape" data-act="w-warm-next">Done</button>';
    body =
      topFor('') +
      '<div class="w-body"><div class="w-title"><p class="w-group">Warm-up · Item ' +
      (wi + 1) +
      ' of ' +
      items.length +
      '</p><h1 class="w-name">' +
      esc(it.name) +
      '</h1></div>' +
      hero +
      '<p class="w-cue"><span>' +
      esc(it.how.join(' · ')) +
      '</span></p>' +
      warmSwap(it) +
      '<div class="vid-keep">' +
      (it.q ? videoHtml('w.' + it.id, it.q) : '') +
      '</div>' +
      '<div class="w-actions">' +
      main +
      '</div>' +
      '<div class="w-links">' +
      (wi > 0 ? '<button data-act="w-warm-back">Back</button>' : '') +
      '<button data-act="w-warm-skip" aria-label="Skip this item">Skip</button><button data-act="w-begin" aria-label="Skip warm-up">Skip all</button><button data-act="w-finish-ask" aria-label="Finish workout">Finish</button></div></div>';
  } else if (W.phase === 'set') {
    const st = curStep(),
      lvl = levelOfStep(st),
      S = SLOTS[st.slot],
      L = W.logged[st.slot],
      tg = L.targets[st.set - 1];
    let unit = lvl.kind === 'hold' ? 'seconds' : 'reps';
    if (lvl.perSide) unit += ' per side';
    const sidesHtml = lvl.perSide
      ? '<div class="sides" aria-label="Sides"><span class="' +
        (W.side ? 'done' : 'cur') +
        '">Right side</span><span class="' +
        (W.side ? 'cur' : '') +
        '">Left side</span></div>'
      : '';
    const hitBtn = '<button class="btn tape" data-act="w-log" data-hit="1">Hit target</button>',
      missBtn = '<button class="btn ghost" data-act="w-log" data-hit="0">Missed</button>';
    let hero, actions;
    if (lvl.kind === 'hold' && W.holdStart) {
      hero =
        '<div class="w-hero"><span class="num" id="holdTime">' +
        timerText(holdGoal(), (clock() - W.holdStart) / 1000) +
        '</span></div>';
      actions =
        pauseBtn() +
        '<button class="btn ghost" data-act="w-log" data-hit="0">Stop, missed</button>';
    } else {
      hero =
        '<div class="w-hero"><span class="num">' +
        tg +
        '</span><span class="unit">' +
        unit +
        ' target</span></div>';
      actions =
        lvl.kind === 'hold'
          ? missBtn +
            '<button class="btn ghost" data-act="w-hold-start">Start timer</button>' +
            hitBtn
          : missBtn + hitBtn;
    }
    body =
      topFor('') +
      '<div class="w-body"><div class="w-title"><p class="w-group">' +
      groupLabel(st) +
      ' · Set ' +
      st.set +
      ' of 3</p><h1 class="w-name">' +
      esc(lvl.name) +
      '</h1></div>' +
      hero +
      sidesHtml +
      '<p class="w-cue"><span>' +
      esc(lvl.cues[0] || (S.general && S.general[0]) || '') +
      '</span></p>' +
      '<div class="vid-keep">' +
      vidBlock(lvl) +
      '</div>' +
      '<div class="w-actions">' +
      actions +
      '</div>' +
      '<div class="w-links"><button data-act="w-back">Back</button><button data-act="w-info">How to</button><button data-act="w-skip" aria-label="Skip exercise">Skip</button><button data-act="w-finish-ask" aria-label="Finish workout">Finish</button></div></div>';
  } else if (W.phase === 'rest') {
    const n = nextIndex(W.i + 1);
    let nextName = 'Rest',
      nextMeta = '',
      nextVid = '';
    if (n >= 0) {
      const ns = W.steps[n],
        nl = levelOfStep(ns),
        nt = W.logged[ns.slot].targets[ns.set - 1];
      nextName = nl.name;
      nextMeta =
        'Set ' +
        ns.set +
        ' of 3 · target ' +
        nt +
        (nl.kind === 'hold' ? ' s' : ' reps') +
        (nl.perSide ? ' per side' : '');
      nextVid = vidBlock(nl);
    }
    const rrem = (W.restEnd - clock()) / 1000;
    body =
      topFor(subTime(fmtClock(rrem), 100 * (1 - rrem / W.restTotal))) +
      '<div class="w-body"><div class="w-title"><p class="w-group">Rest · Up next</p><h1 class="w-name">' +
      esc(nextName) +
      '</h1></div><div class="w-hero"><span class="num" id="restTime">' +
      fmtClock(rrem) +
      '</span></div><p class="w-cue"><span>' +
      esc(nextMeta) +
      '</span></p><div class="vid-keep">' +
      nextVid +
      '</div><div class="w-actions">' +
      pauseBtn() +
      '<button class="btn ghost" data-act="w-rest-add">+ 15 s</button><button class="btn tape" data-act="w-rest-skip">Skip</button></div>' +
      '<div class="w-links"><button data-act="w-back">Back</button><button data-act="w-finish-ask" aria-label="Finish workout">Finish</button></div></div>';
  } else if (W.phase === 'summary') {
    const r = W.result,
      mins = Math.max(1, Math.round(r.session.durationSec / 60));
    const rows = SLOT_ORDER.filter(function (k) {
      return r.session.entries[k];
    })
      .map(function (k) {
        const e = r.session.entries[k];
        return (
          '<div class="res"><span>' +
          esc(e.name) +
          '</span><span class="r">' +
          esc(sessionSummaryText(e)) +
          '</span></div>'
        );
      })
      .join('');
    const ups = r.promotions
      .map(function (p) {
        return (
          '<div class="up-banner">Level up: ' +
          esc(p.from) +
          ' → ' +
          esc(p.to) +
          '. Next time, start at 3 × 5.</div>'
        );
      })
      .join('');
    body =
      top('', 100) +
      '<div class="w-body scrolls"><div class="w-title"><h1 class="w-name">Workout complete</h1></div><p class="w-sub">' +
      mins +
      ' min · ' +
      Object.keys(r.session.entries).length +
      ' exercises</p>' +
      ups +
      '<div style="margin-top:14px;border-top:2px solid var(--ink)">' +
      (rows || '<p class="empty">No sets logged.</p>') +
      '</div>' +
      '<div style="margin-top:auto;padding-top:22px"><button class="btn tape" data-act="w-close">Close</button></div></div>';
  }
  /* Keeps the video iframe between renders (if the video is the same), so it does not reload on every tap. */
  const oldK = ov.querySelector('.vid-keep'),
    oldBody = ov.querySelector('.w-body');
  const key = W.phase + ':' + W.i + ':' + (W.side || 0),
    scr = oldBody && oldBody.scrollTop;
  const tmp = document.createElement('div');
  tmp.innerHTML =
    '<div class="overlay" role="region" aria-label="Workout in progress">' + body + '</div>';
  const newK = tmp.querySelector('.vid-keep'),
    oF = oldK && oldK.querySelector('iframe'),
    nF = newK && newK.querySelector('iframe');
  if (
    oF &&
    nF &&
    oF.getAttribute('src') === nF.getAttribute('src') &&
    oldK.parentNode.className === 'w-body' &&
    newK.parentNode.className === 'w-body'
  ) {
    /* Same video: replace everything around it without touching the iframe (moving an iframe reloads the video). */
    const ob = oldK.parentNode,
      nb = newK.parentNode;
    ov.querySelector('.w-head').replaceWith(tmp.querySelector('.w-head'));
    while (ob.firstChild !== oldK) ob.removeChild(ob.firstChild);
    while (oldK.nextSibling) ob.removeChild(oldK.nextSibling);
    while (nb.firstChild !== newK) ob.insertBefore(nb.firstChild, oldK);
    while (newK.nextSibling) ob.appendChild(newK.nextSibling);
  } else {
    if (key !== lastKey) tmp.firstChild.classList.add('enter');
    ov.innerHTML = '';
    ov.appendChild(tmp.firstChild);
    const nbody = ov.querySelector('.w-body');
    if (nbody && scr && key === lastKey) nbody.scrollTop = scr;
  }
  lastKey = key;
  document.body.classList.add('no-scroll');
}
function logSet() {
  W.pausedAt = null;
  const st = curStep(),
    L = W.logged[st.slot];
  L.sets[st.set - 1] = W.value;
  const n = nextIndex(W.i + 1);
  if (n < 0) {
    finishNow();
    return;
  }
  const secs = restSeconds(state, st.slot);
  W.phase = 'rest';
  W.restTotal = secs;
  W.restEnd = Date.now() + secs * 1000;
  W.holdStart = null;
  saveDraft();
  renderWorkout();
}
function finishNow() {
  const warmDone = Object.keys(W.warm).filter(function (k) {
    return W.warm[k];
  }).length;
  W.warmDone = warmDone;
  const dur = Math.round((Date.now() - W.startedAt) / 1000);
  const anySets = Object.keys(W.logged).some(function (k) {
    return W.logged[k].sets.length;
  });
  const res = finishWorkout(state, W, isoDate(), dur);
  if (anySets) {
    persistProfile();
  } else {
    state.sessions = state.sessions.filter(function (s) {
      return s.id !== res.session.id;
    });
  }
  clearDraft();
  stopTick();
  W.phase = 'summary';
  W.result = res;
  renderWorkout();
}
function closeWorkout() {
  W = null;
  stopTick();
  $('#overlay').innerHTML = '';
  document.body.classList.remove('no-scroll');
  closeSheet();
  render();
}

/* ---------- Events ---------- */
const H = {
  tab: function (el) {
    tab = el.dataset.tab;
    render();
    window.scrollTo(0, 0);
  },
  start: function () {
    startWorkout();
  },
  resume: function () {
    resumeWorkout();
  },
  'discard-draft': function () {
    clearDraft();
    render();
  },
  'open-ex': function (el) {
    openSheet(el.dataset.slot, 'home', el.dataset.lvl);
  },
  'pick-day': function (el) {
    dayIdx = +el.dataset.i;
    render();
  },
  'prog-tab': function (el) {
    progTab = el.dataset.p;
    render();
    window.scrollTo(0, 0);
  },
  'open-warm': function (el) {
    openWarm(el.dataset.id);
  },
  'vid-tab': function (el) {
    el.parentNode.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', b === el ? 'true' : 'false');
    });
    el.closest('.vid-wrap').querySelector('.vid-slot').innerHTML = videoHtml(
      el.dataset.key,
      el.dataset.q
    );
  },
  'warm-swap': function (el) {
    const m = state.settings.warmAlt || (state.settings.warmAlt = {});
    if (el.dataset.alt) m[el.dataset.base] = el.dataset.alt;
    else delete m[el.dataset.base];
    persistProfile();
    renderWorkout();
  },
  'sheet-close': function () {
    closeSheet();
  },
  'pick-level': function (el) {
    const slot = el.dataset.slot,
      i = +el.dataset.i;
    state.levels[slot].idx = i;
    persistProfile();
    if (W && sheetCtx && sheetCtx.ctx === 'workout') {
      const p = prescribe(state, slot);
      W.logged[slot] = { levelId: p.level.id, sets: [], targets: p.targets };
      if (W.phase === 'set' && curStep().slot === slot) setDefault();
      saveDraft();
      renderWorkout();
    } else render();
    renderSheet();
  },
  'set-path': function (el) {
    const slot = el.dataset.slot,
      path = el.dataset.path;
    if (state.levels[slot].path !== path) {
      state.levels[slot] = { path: path, idx: 0 };
      persistProfile();
    }
    render();
    renderSheet();
  },
  'toggle-dip': function () {
    state.settings.hasDip = !state.settings.hasDip;
    persistProfile();
    render();
    toast(state.settings.hasDip ? 'Dip added to your workout' : 'Dip left out of your workout');
  },
  'toggle-bar': function () {
    state.settings.hasBar = !state.settings.hasBar;
    persistProfile();
    render();
    toast(
      state.settings.hasBar ? 'Pull-up added to your workout' : 'Pull-up left out of your workout'
    );
  },
  'rest-main': function (el) {
    state.settings.restMain = Math.max(
      30,
      Math.min(300, state.settings.restMain + 15 * +el.dataset.d)
    );
    persistProfile();
    $('#rm').textContent = state.settings.restMain + ' s';
  },
  'rest-core': function (el) {
    state.settings.restCore = Math.max(
      30,
      Math.min(300, state.settings.restCore + 15 * +el.dataset.d)
    );
    persistProfile();
    $('#rc').textContent = state.settings.restCore + ' s';
  },
  'copy-bk': function () {
    const ta = $('#bk');
    ta.focus();
    ta.select();
    let done = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(
          function () {
            toast('Backup copied');
          },
          function () {
            toast('Text selected, copy it manually');
          }
        );
        done = true;
      }
    } catch {
      /* optional feature, ignoring failure is fine */
    }
    if (!done) toast('Text selected, copy it manually');
  },
  'import-bk': function () {
    try {
      const o = JSON.parse($('#bk').value);
      if (!o || !o.sessions || !o.levels) throw new Error('formato');
      const before = state.sessions.length;
      mergeLoaded(o, null);
      persistProfile();
      render();
      toast(state.sessions.length - before + ' workouts imported');
    } catch {
      toast('Invalid backup. Paste the full text.');
    }
  },
  'sess-del-ask': function (el) {
    const s = state.sessions.filter(function (x) {
      return x.id === el.dataset.id;
    })[0];
    const promoted =
      s &&
      Object.keys(s.entries).some(function (k) {
        return s.entries[k].promotedTo;
      });
    confirmBox(
      'Delete this workout?',
      'It is removed from your history and the next targets are recalculated.' +
        (promoted ? ' Level-ups it caused stay.' : '') +
        ' This cannot be undone.',
      [
        { label: 'Delete workout', act: 'sess-del-do', id: el.dataset.id },
        { label: 'Cancel', act: 'sheet-close', cls: 'ghost' },
      ]
    );
  },
  'sess-del-do': function (el) {
    state.sessions = state.sessions.filter(function (x) {
      return x.id !== el.dataset.id;
    });
    persistProfile();
    closeSheet();
    render();
    toast('Workout deleted');
  },
  'reset-ask': function () {
    confirmBox(
      'Delete everything?',
      'Your logged workouts are deleted and the levels go back to the start. This cannot be undone.',
      [
        { label: 'Delete everything', act: 'reset-do' },
        { label: 'Cancel', act: 'sheet-close', cls: 'ghost' },
      ]
    );
  },
  'reset-do': function () {
    const keepBar = state.settings.hasBar,
      keepDip = state.settings.hasDip;
    state = defaultState();
    state.settings.hasBar = keepBar;
    state.settings.hasDip = keepDip;
    persistProfile();
    closeSheet();
    render();
    toast('Everything deleted');
  },
  bar: function (el) {
    const box = el.closest('.chart-box');
    if (!box) return;
    box.querySelectorAll('.bar').forEach(function (b) {
      b.classList.remove('sel');
    });
    el.classList.add('sel');
    box.querySelector('.chart-cap').textContent = el.getAttribute('data-cap');
  },
  /* workout */
  'w-exit': function () {
    const any = Object.keys(W.logged).some(function (k) {
      return W.logged[k].sets.length;
    });
    confirmBox(
      'Leave workout?',
      any
        ? 'You can save what you did or continue later where you stopped.'
        : 'You have not logged any set yet.',
      [{ label: 'Continue workout', act: 'sheet-close', cls: 'tape' }]
        .concat(any ? [{ label: 'Save and finish', act: 'w-finish', cls: 'ghost' }] : [])
        .concat([
          {
            label: any ? 'Leave and continue later' : 'Leave workout',
            act: 'w-leave',
            cls: 'ghost',
          },
          { label: 'Discard workout', act: 'w-discard', cls: 'ghost' },
        ])
    );
  },
  'w-leave': function () {
    saveDraft();
    W = null;
    stopTick();
    $('#overlay').innerHTML = '';
    document.body.classList.remove('no-scroll');
    closeSheet();
    render();
  },
  'w-discard': function () {
    clearDraft();
    W = null;
    stopTick();
    $('#overlay').innerHTML = '';
    document.body.classList.remove('no-scroll');
    closeSheet();
    render();
  },
  'w-finish-ask': function () {
    H['w-exit']();
  },
  'w-finish': function () {
    closeSheet();
    finishNow();
  },
  'w-warm-next': function () {
    const it = warmupItems(state)[W.warmI || 0];
    if (it) W.warm[it.id] = true;
    doneChime();
    warmGo(1);
  },
  'w-warm-skip': function () {
    warmGo(1);
  },
  'w-warm-back': function () {
    warmGo(-1);
  },
  'w-warm-timer': function () {
    prepAudio();
    const it = warmupItems(state)[W.warmI || 0];
    W.warmEnd = Date.now() + (it.secs + 3) * 1000;
    W.warmTotal = it.secs;
    lastCue = null;
    saveDraft();
    renderWorkout();
  },
  'w-warm-adj': function (el) {
    const it = warmupItems(state)[W.warmI || 0],
      g = warmGoal(it),
      d = +el.dataset.d,
      el2 = g - (W.warmEnd - clock()) / 1000;
    if (el2 < 0) return;
    const ng = Math.max(5, g + d);
    if (ng <= el2 + 1) return;
    W.warmEnd += (ng - g) * 1000;
    W.warmTotal = ng;
    saveDraft();
    renderWorkout();
  },
  'w-begin': function () {
    const n = nextIndex(0);
    if (n < 0) {
      finishNow();
      return;
    }
    goSet(n);
  },
  'w-back': function () {
    W.pausedAt = null;
    const from = W.phase === 'rest' ? W.i : W.i - 1;
    let p = -1;
    for (let k = from; k >= 0; k--)
      if (W.skipped.indexOf(W.steps[k].slot) < 0) {
        p = k;
        break;
      }
    if (p < 0) {
      const wi = warmupItems(state).length - 1;
      W.phase = 'warmup';
      W.warmI = Math.max(0, wi);
      W.warmEnd = 0;
      W.holdStart = null;
      saveDraft();
      renderWorkout();
      return;
    }
    const ps = W.steps[p],
      L = W.logged[ps.slot],
      prev = L.sets[ps.set - 1];
    L.sets.length = Math.min(L.sets.length, ps.set - 1);
    W.i = p;
    W.phase = 'set';
    setDefault();
    if (prev != null) W.value = prev;
    saveDraft();
    renderWorkout();
  },
  'w-hold-start': function () {
    prepAudio();
    W.holdTotal = Math.max(1, W.value || 0);
    W.holdStart = Date.now() + 3000;
    lastCue = null;
    saveDraft();
    renderWorkout();
  },
  'w-log': function (el) {
    const st = curStep(),
      lvl = levelOfStep(st),
      hit = !(el && el.dataset && el.dataset.hit === '0');
    W.value = setResult(lvl, W.logged[st.slot].targets[st.set - 1], hit);
    doneChime();
    if (lvl.perSide) {
      if (!W.side) {
        W.right = W.value;
        W.side = 1;
        W.value = W.logged[st.slot].targets[st.set - 1];
        W.holdStart = null;
        if (lvl.kind === 'hold') autoStartHold(SIDE_SWITCH_SECS);
        saveDraft();
        renderWorkout();
        return;
      }
      W.value = Math.min(W.right == null ? W.value : W.right, W.value);
    }
    logSet();
  },
  'sound-test': function () {
    prepAudio();
    doneChime();
    const ctx = audio.context;
    toast(
      ctx
        ? 'Sound is ' + ctx.state + '. You should hear a chime.'
        : 'This browser has no sound support.'
    );
  },
  'w-pause': function () {
    if (W.pausedAt) {
      const t = resumeTimers(
        { restEnd: W.restEnd, warmEnd: W.warmEnd, holdStart: W.holdStart },
        W.pausedAt,
        Date.now()
      );
      W.restEnd = t.restEnd;
      W.warmEnd = t.warmEnd;
      W.holdStart = t.holdStart;
      W.pausedAt = null;
      lastCue = null;
    } else {
      W.pausedAt = Date.now();
    }
    saveDraft();
    renderWorkout();
  },
  'w-rest-add': function () {
    W.restEnd += 15000;
    W.restTotal += 15;
    saveDraft();
  },
  'w-rest-skip': function () {
    const n = nextIndex(W.i + 1);
    if (n >= 0) goSet(n);
    else finishNow();
  },
  'w-info': function () {
    openSheet(curStep().slot, 'workout');
  },
  'w-skip': function () {
    const st = curStep();
    W.skipped.push(st.slot);
    const n = nextIndex(W.i + 1);
    if (n >= 0) {
      toast(SLOTS[st.slot].label + ' skipped today');
      goSet(n);
    } else finishNow();
  },
  'w-close': function () {
    closeWorkout();
  },
};
document.addEventListener('click', function (e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const f = H[el.dataset.act];
  if (f) f(el, e);
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && $('#sheet').innerHTML) closeSheet();
  if (
    (e.key === 'Enter' || e.key === ' ') &&
    e.target &&
    e.target.getAttribute &&
    e.target.getAttribute('data-act') === 'bar'
  ) {
    e.preventDefault();
    H.bar(e.target);
  }
});
/* iOS only lets a tap bring the sound back after the screen locked, so every tap during a workout checks it. */
document.addEventListener('pointerdown', function () {
  if (W) audio.ensureRunning();
});
document.addEventListener('visibilitychange', function () {
  if (!document.hidden && W) {
    prepAudio();
    tick();
  }
});

(async function boot() {
  render();
  await initStorage();
  render();
})();
