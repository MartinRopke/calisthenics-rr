/* App: telas, treino guiado e armazenamento. Usa data.js e logic.js (globais). */
var D = { SLOTS: SLOTS, LADDERS: LADDERS, PAIRS: PAIRS, CORE: CORE, SLOT_ORDER: SLOT_ORDER, START_LEVELS: START_LEVELS, WARMUP: WARMUP, WARMUP_EXTRAS: WARMUP_EXTRAS };
var LS_KEY = 'treinoRR.v1', DRAFT_KEY = 'treinoRR.draft';

/* Ícone de halter: Lucide "dumbbell" (licença ISC), embutido para não depender de nada externo. */
var ICON_EQUIP = '<svg class="ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/></svg>';

var state = defaultState(D);
var tab = 'hoje';
var W = null;            /* treino em andamento */
var sheetCtx = null;     /* {slot, ctx} da folha aberta */
var sync = { mode: 'local', note: 'Loading…' };
var dbRefs = null;
var queue = Promise.resolve();
var audioCtx = null, wakeLock = null, tickTimer = null, toastTimer = null;

function $(s) { return document.querySelector(s); }
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function shortDate(s) { var p = s.split('-'); return p[2] + '/' + p[1]; }

/* ---------- Armazenamento ---------- */
var fileMode = false, fileQueue = Promise.resolve();
var FILE_NOTE = 'Saved to the file data/treino.json on this computer.';
function filePush() {
  if (!fileMode) return;
  var body = JSON.stringify(state);
  fileQueue = fileQueue.then(function () {
    return fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: body });
  }).then(function (r) {
    if (!r.ok) throw new Error('http');
    sync.err = false; sync.note = FILE_NOTE;
  }).catch(function () {
    sync.err = true; sync.note = 'Could not save to the file. Your data stays in this browser.';
    if (tab === 'ajustes') render();
  });
}
async function fileInit() {
  try {
    var r = await withTimeout(fetch('/api/state', { cache: 'no-store' }), 3000);
    if (!r.ok) return false;
    mergeLoaded(await r.json(), null);
    fileMode = true; sync = { mode: 'file', note: FILE_NOTE };
    filePush();
    return true;
  } catch (e) { return false; }
}
function localSave() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { } filePush(); }
function localLoad() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (raw) mergeLoaded(JSON.parse(raw), null);
  } catch (e) { }
}
function mergeLoaded(obj, only) {
  if (!obj) return;
  if (obj.settings) Object.keys(obj.settings).forEach(function (k) { state.settings[k] = obj.settings[k]; });
  if (obj.levels) Object.keys(obj.levels).forEach(function (k) { if (state.levels[k] && obj.levels[k]) state.levels[k] = obj.levels[k]; });
  if (obj.sessions && only !== 'profile') {
    var ids = {};
    state.sessions.forEach(function (s) { ids[s.id] = 1; });
    obj.sessions.forEach(function (s) { if (s && s.id && !ids[s.id]) { state.sessions.push(s); ids[s.id] = 1; } });
    state.sessions.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id < b.id ? -1 : 1); });
  }
}
function enqueue(fn) {
  queue = queue.then(fn).then(function () { if (sync.mode === 'db') { sync.note = 'Saved to your account.'; sync.err = false; } }).catch(function (e) {
    sync.err = true; sync.note = 'Could not save to your account (' + ((e && e.code) || 'error') + '). Your data stays on this device.';
    if (tab === 'ajustes') render();
  });
  return queue;
}
function persistProfile() {
  localSave();
  if (dbRefs) enqueue(function () { return dbRefs.profile.set({ v: 1, settings: state.settings, levels: state.levels, updatedAt: Date.now() }); });
}
function persistSession(sess) {
  localSave();
  if (dbRefs) enqueue(function () { return dbRefs.sessions.doc(sess.id).set(sess); });
}
function withTimeout(p, ms) {
  return new Promise(function (res, rej) {
    var t = setTimeout(function () { rej({ code: 'timeout' }); }, ms);
    p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
  });
}
async function initStorage() {
  localLoad();
  if (await fileInit()) { localSave(); return; }
  if (typeof claude === 'undefined' || !claude.use) { sync = { mode: 'local', note: 'No account here: your data stays only in this browser.' }; return; }
  try {
    var user = await claude.use('user'), db = await claude.use('db');
    var uid = user ? await user.id() : null;
    if (!db || !uid) { sync = { mode: 'local', note: 'No account here: your data stays only in this browser.' }; return; }
    var prof = db.doc('data/users/' + uid + '/profile');
    var sess = prof.collection('sessions');
    var snap = await withTimeout(prof.get(), 10000);
    var ssnap = await withTimeout(sess.orderBy('date', 'asc').limit(1000).get(), 10000);
    var localCount = state.sessions.length;
    if (snap.exists) mergeLoaded(snap.data(), 'profile');
    var remoteIds = {};
    ssnap.docs.forEach(function (d) { var v = d.data(); if (v) remoteIds[d.id] = 1; mergeLoaded({ sessions: [v] }, null); });
    dbRefs = { profile: prof, sessions: sess };
    sync = { mode: 'db', note: 'Saved to your account.' };
    if (!snap.exists) persistProfile();
    state.sessions.forEach(function (s) { if (!remoteIds[s.id]) persistSession(s); });
    localSave();
  } catch (e) {
    sync = { mode: 'local', note: 'Could not reach your account. Your data stays in this browser for now.', err: true };
  }
}

/* ---------- Rascunho do treino ---------- */
function saveDraft() { try { if (W && W.phase !== 'summary') localStorage.setItem(DRAFT_KEY, JSON.stringify(W)); } catch (e) { } }
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { } }
function loadDraft() {
  try {
    var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && d.startedAt && Date.now() - d.startedAt < 8 * 3600 * 1000 && d.steps) return d;
  } catch (e) { }
  return null;
}

/* ---------- Pequenos formatadores ---------- */
function unitOf(level) { return level.kind === 'hold' ? ' s' : ''; }
function sideOf(level) { return level.perSide ? ' per side' : ''; }
function targetHtml(level, targets) {
  var same = targets.every(function (t) { return t === targets[0]; });
  var u = level.kind === 'hold' ? 's' : (level.perSide ? 'per side' : 'reps');
  if (level.kind === 'hold' && level.perSide) u = 's per side';
  return same ? '3 × ' + targets[0] + '<small>' + u + '</small>' : targets.join(' · ') + '<small>' + u + '</small>';
}
function levelText(slot) { return 'Level ' + (state.levels[slot].idx + 1) + ' of ' + ladderOf(D, state, slot).length; }
function metaLine(S, lvl, slot) {
  var parts = [];
  if (S.label.toLowerCase() !== lvl.name.toLowerCase()) parts.push(S.label);
  parts.push(levelText(slot));
  return parts.join(' · ');
}
function equipHtml(lvl) { return lvl.equip ? '<div class="ex-equip">' + ICON_EQUIP + ' Needs: ' + esc(lvl.equip) + '</div>' : ''; }
function rungsHtml(slot) {
  var lad = ladderOf(D, state, slot), cur = state.levels[slot].idx;
  return '<div class="rungs" aria-hidden="true">' + lad.map(function (l, i) { return '<span class="rung ' + (i < cur ? 'done' : i === cur ? 'cur' : '') + '"></span>'; }).join('') + '</div>';
}
function toast(msg) {
  var t = $('#toast'); t.innerHTML = '<div class="toast" role="status">' + esc(msg) + '</div>';
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.innerHTML = ''; }, 2200);
}

/* ---------- Gráficos ---------- */
function barChart(items, o) {
  /* items: [{v, label, cap, up}] */
  var Wd = 320, Ht = o.h || 110, padB = 16, padT = 16, n = items.length;
  var max = Math.max.apply(null, items.map(function (i) { return i.v; }).concat([o.min || 1]));
  var gap = 8, bw = Math.min(34, (Wd - gap * (n + 1)) / n), total = n * bw + (n + 1) * gap, x0 = (Wd - total) / 2 + gap;
  var plotH = Ht - padB - padT, base = Ht - padB, out = '';
  if (o.goal) { var gy = base - plotH * o.goal / max; out += '<line class="goal" x1="0" x2="' + Wd + '" y1="' + gy + '" y2="' + gy + '"/><text x="' + Wd + '" y="' + (gy - 4) + '" text-anchor="end">goal ' + o.goal + '</text>'; }
  items.forEach(function (it, i) {
    var x = x0 + i * (bw + gap), h = Math.max(it.v ? 3 : 0, plotH * it.v / max), y = base - h, r = Math.min(4, h);
    var d = h ? 'M' + x + ',' + base + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + y + ' ' + (x + bw) + ',' + (y + r) + 'V' + base + 'Z' : '';
    out += '<g class="bar' + (it.up ? ' up' : '') + '" data-act="bar" data-cap="' + esc(it.cap || '') + '" tabindex="0" role="img" aria-label="' + esc(it.cap || '') + '">' +
      '<rect x="' + (x - gap / 2) + '" y="0" width="' + (bw + gap) + '" height="' + Ht + '" fill="transparent"/>' + (d ? '<path d="' + d + '"/>' : '') +
      (o.valueLabels || i === n - 1 ? '<text x="' + (x + bw / 2) + '" y="' + (y - 4) + '" text-anchor="middle">' + it.v + '</text>' : '') +
      '<text x="' + (x + bw / 2) + '" y="' + (Ht - 2) + '" text-anchor="middle">' + esc(it.label) + '</text></g>';
  });
  out += '<line class="base" x1="0" x2="' + Wd + '" y1="' + base + '" y2="' + base + '"/>';
  return '<div class="chart-box"><svg class="chart" viewBox="0 0 ' + Wd + ' ' + Ht + '" role="group" aria-label="' + esc(o.aria) + '">' + out + '</svg><p class="chart-cap" aria-live="polite">' + esc(o.defaultCap || '') + '</p></div>';
}

/* ---------- Telas ---------- */
function viewHoje() {
  var today = isoDate(), hint = scheduleHint(state.sessions, today), draft = W ? null : loadDraft();
  var wk = weeklyCounts(state.sessions, 1, today)[0].n;
  var dateTxt = new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  var pips = [0, 1, 2].map(function (i) { return '<span class="pip ' + (i < wk ? 'on' : '') + '"></span>'; }).join('');
  var act = SLOT_ORDER.filter(function (s) { return isActive(D, state, s); }).length;
  function exRow(slot) {
    var S = SLOTS[slot], lvl = currentLevel(D, state, slot);
    if (!isActive(D, state, slot)) {
      return '<button class="ex off" data-act="open-ex" data-slot="' + slot + '"><div class="ex-top"><div><div class="ex-name">' + esc(S.label) + '</div><div class="ex-meta">Unlocks when you have the bar</div></div></div>' + rungsHtml(slot) + '</button>';
    }
    var p = prescribe(D, state, slot);
    return '<button class="ex" data-act="open-ex" data-slot="' + slot + '"><div class="ex-top"><div><div class="ex-name">' + esc(lvl.name) + '</div><div class="ex-meta">' + esc(metaLine(S, lvl, slot)) + '</div>' + equipHtml(lvl) + '</div><div class="ex-target num">' + targetHtml(lvl, p.targets) + '</div></div>' + rungsHtml(slot) + '</button>';
  }
  function group(title, sub, rows) {
    return '<div class="grp"><h3>' + title + '</h3><span class="muted small">' + sub + '</span></div><div class="ex-list">' + rows + '</div>';
  }
  var warm = warmupItems(D, state);
  var warmRows = warm.map(function (it) {
    return '<button class="ex" data-act="open-warm" data-id="' + it.id + '"><div class="ex-name">' + esc(it.name) + '</div><div class="ex-meta">' + esc(it.n + ' ' + it.unit) + '</div>' + equipHtml(it) + '</button>';
  }).join('');
  var rows = group('Warm-up', warm.length + ' items', warmRows);
  PAIRS.forEach(function (pair, i) {
    rows += group('Pair ' + (i + 1) + ' of 3', '3 sets, ' + state.settings.restMain + ' s rest', pair.map(exRow).join(''));
  });
  rows += group('Core', '3 sets, ' + state.settings.restCore + ' s rest', CORE.map(exRow).join(''));
  var cta;
  if (draft) {
    cta = '<div class="btn-row"><button class="btn tape" data-act="resume">Continue workout</button><button class="btn ghost" data-act="discard-draft">Discard</button></div>';
  } else {
    cta = '<button class="btn tape" data-act="start">Start workout</button>';
  }
  return '<div class="wrap"><div class="page-head"><h1>Today</h1><p class="date">' + esc(dateTxt) + '</p></div>' +
    '<div class="hint ' + hint.kind + '">' + esc(hint.text) + '</div>' + cta +
    '<div class="week"><span class="pips" aria-hidden="true">' + pips + '</span><span class="muted small">' + wk + ' of 3 workouts this week</span></div>' +
    '<h2 class="sec-title">Today\'s workout</h2><p class="muted small">Warm-up and ' + act + ' exercises, in this order. Tap an exercise to see how to do it or change its level.</p>' +
    rows + '</div>';
}

function viewProgresso() {
  var today = isoDate(), weeks = weeklyCounts(state.sessions, 8, today);
  var wItems = weeks.map(function (w) { return { v: w.n, label: shortDate(w.start), cap: 'Week of ' + shortDate(w.start) + ': ' + w.n + (w.n === 1 ? ' workout' : ' workouts') }; });
  var out = '<div class="wrap"><div class="page-head"><h1>Progress</h1><p>' + state.sessions.length + (state.sessions.length === 1 ? ' workout logged' : ' workouts logged') + '</p></div>';
  out += '<h2 class="sec-title" style="margin-top:6px">Workouts per week</h2>' + barChart(wItems, { goal: 3, min: 3, valueLabels: true, aria: 'Workouts per week over the last 8 weeks', defaultCap: 'Tap a bar to see the week.', h: 100 });
  out += '<h2 class="sec-title">Each exercise</h2><p class="muted small">Each bar is a workout: total reps (or seconds on holds). Orange bars mark the workout where you moved up a level.</p><div style="margin-top:8px">';
  SLOT_ORDER.forEach(function (slot) {
    var S = SLOTS[slot], lvl = currentLevel(D, state, slot), ser = seriesFor(state, slot).slice(-12);
    var inactive = !isActive(D, state, slot);
    out += '<div class="pcard"><div class="pcard-top"><h3>' + esc(inactive ? S.label : lvl.name) + '</h3><span class="muted small">' + (inactive ? '' : levelText(slot)) + '</span></div>' + rungsHtml(slot);
    if (!ser.length) out += '<p class="empty small" style="padding:10px 0 0">' + (inactive ? 'Waiting for the bar.' : 'No records yet. Do a workout to see your progress.') + '</p>';
    else {
      var items = ser.map(function (s) {
        var u = s.kind === 'hold' ? ' s' : ' reps';
        return { v: s.total, up: s.promoted, label: shortDate(s.date), cap: shortDate(s.date) + ' · ' + s.name + ' · ' + s.sets.join(' + ') + u + (s.promoted ? ' · moved up to ' + s.promotedTo : '') };
      });
      out += barChart(items, { aria: 'Total per workout for ' + S.label, defaultCap: items[items.length - 1].cap, h: 96 });
    }
    out += '</div>';
  });
  out += '</div><h2 class="sec-title">History</h2>';
  if (!state.sessions.length) out += '<p class="empty">Workouts you finish show up here.</p>';
  else {
    out += state.sessions.slice().reverse().slice(0, 30).map(function (s) {
      var list = SLOT_ORDER.filter(function (k) { return s.entries[k]; }).map(function (k) {
        var e = s.entries[k];
        return '<li><span>' + esc(e.name) + (e.promotedTo ? '<span class="up-tag">level up</span>' : '') + '</span><span>' + esc(sessionSummaryText(e)) + '</span></li>';
      }).join('');
      var n = Object.keys(s.entries).length;
      return '<details class="sess"><summary><span>' + shortDate(s.date) + '</span><span class="muted">' + n + ' exercises' + (s.durationSec ? ' · ' + Math.max(1, Math.round(s.durationSec / 60)) + ' min' : '') + '</span></summary><ul>' + list + '</ul><button class="btn ghost del-sess" data-act="sess-del-ask" data-id="' + esc(s.id) + '">Delete this workout</button></details>';
    }).join('');
  }
  return out + '</div>';
}

function stepper(act, id, val, unit) {
  return '<div class="stepper"><button data-act="' + act + '" data-d="-1" aria-label="Decrease">−</button><span class="val num" id="' + id + '">' + val + unit + '</span><button data-act="' + act + '" data-d="1" aria-label="Increase">+</button></div>';
}
function viewAjustes() {
  var st = state.settings;
  var pathRows = ['core_ae', 'core_ar', 'core_ex'].map(function (slot) {
    var cur = state.levels[slot].path, ps = LADDERS[slot].paths;
    return '<div class="set-row" style="display:block"><b>' + esc(SLOTS[slot].label) + '</b><div class="pathsel" style="margin-top:8px">' + Object.keys(ps).map(function (k) {
      return '<button data-act="set-path" data-slot="' + slot + '" data-path="' + k + '" aria-pressed="' + (k === cur) + '">' + esc(ps[k].label) + '</button>';
    }).join('') + '</div></div>';
  }).join('');
  var exp = JSON.stringify({ v: 1, settings: state.settings, levels: state.levels, sessions: state.sessions });
  return '<div class="wrap"><div class="page-head"><h1>Settings</h1><p>' + esc(sync.note) + '</p></div>' +
    '<div class="set-row"><div><b>I have a pull-up bar</b><p>Adds the pull-up and the full Pair 1 to your workout.</p></div><button class="switch" role="switch" aria-checked="' + !!st.hasBar + '" aria-label="I have a pull-up bar" data-act="toggle-bar"></button></div>' +
    '<div class="set-row"><div><b>Rest for strength</b><p>Between sets of the pairs</p></div>' + stepper('rest-main', 'rm', st.restMain, ' s') + '</div>' +
    '<div class="set-row"><div><b>Rest for core</b><p>Between sets of the triplet</p></div>' + stepper('rest-core', 'rc', st.restCore, ' s') + '</div>' +
    '<h2 class="sec-title">Core exercises</h2><p class="muted small">The default paths use only your body and a sturdy support. Switch if you have a band, rings or a bar.</p>' + pathRows +
    '<h2 class="sec-title">Backup</h2><p class="muted small">Copy the text below and keep it wherever you like. To restore, paste a backup into the box and tap Import.</p>' +
    '<textarea id="bk" aria-label="Backup data" spellcheck="false">' + esc(exp) + '</textarea>' +
    '<div class="btn-row"><button class="btn small ghost" data-act="copy-bk">Copy</button><button class="btn small ghost" data-act="import-bk">Import</button></div>' +
    '<h2 class="sec-title">Start over</h2><p class="muted small">Deletes your workouts and sets the levels back to the plan\'s starting point.</p>' +
    '<div class="btn-row"><button class="btn small ghost" data-act="reset-ask">Apagar tudo</button></div></div>';
}

function tabbar() {
  function t(id, label) { return '<button class="tab" data-act="tab" data-tab="' + id + '"' + (tab === id ? ' aria-current="page"' : '') + '>' + label + '</button>'; }
  return '<nav class="tabbar" aria-label="Sections">' + t('hoje', 'Today') + t('progresso', 'Progress') + t('ajustes', 'Settings') + '</nav>';
}
var lastTab = '';
function render() {
  var v = tab === 'hoje' ? viewHoje() : tab === 'progresso' ? viewProgresso() : viewAjustes();
  $('#app').innerHTML = '<div class="' + (tab !== lastTab ? 'view-enter' : '') + '">' + v + '</div>' + tabbar();
  lastTab = tab;
}

/* ---------- Folha de exercício ---------- */
/* Vídeo: o quadro mostra a miniatura e só carrega o player quando tocado (economiza dados e não reinicia a cada tela). */
function videoHtml(key, q) {
  var v = (typeof VIDEOS !== 'undefined') && VIDEOS[key];
  if (!v) return '<a class="vid-link" href="' + ytUrl(q) + '" target="_blank" rel="noopener">Search for a video on YouTube</a>';
  return '<div class="vid-box"><div class="vid"><iframe src="https://www.youtube-nocookie.com/embed/' + v.id + '?rel=0&playsinline=1&modestbranding=1" title="' + esc(v.t) + '" loading="lazy" onload="this.classList.add(&quot;ok&quot;)" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>' +
    '<p class="vid-cap">' + esc(v.t) + ' · ' + esc(v.c) + '</p></div>';
}
function warmSwap(it) {
  var base = D.WARMUP.filter(function (w) { return w.id === (it.base || it.id); })[0];
  if (!base || !base.alts) return '';
  var cur = it.base ? it.id : '';
  return '<div class="swap"><p class="muted small">No equipment? Swap this exercise. The swaps are not from the guide and stay until you switch back.</p><div class="pathsel" role="group" aria-label="Swap exercise">' +
    '<button data-act="warm-swap" data-base="' + base.id + '" data-alt="" aria-pressed="' + !cur + '">' + 'Band or t-shirt' + '</button>' +
    base.alts.map(function (a) { return '<button data-act="warm-swap" data-base="' + base.id + '" data-alt="' + a.id + '" aria-pressed="' + (cur === a.id) + '">' + esc(a.label) + '</button>'; }).join('') + '</div></div>';
}
function vidTabs(lvl) {
  if (!lvl.setup || !lvl.setup.length) return '';
  var q = esc(lvl.q + ' tutorial');
  return '<div class="pathsel" role="group" aria-label="Equipment options"><button data-act="vid-tab" data-key="' + lvl.id + '" data-q="' + q + '" aria-pressed="true">' + esc(lvl.std) + '</button>' +
    lvl.setup.map(function (o) { return '<button data-act="vid-tab" data-key="' + (o.k || '') + '" data-q="' + esc(lvl.q + ' ' + (o.q || 'at home')) + '" aria-pressed="false">' + esc(o.label) + '</button>'; }).join('') + '</div>';
}
function vidBlock(lvl) { return '<div class="vid-wrap">' + vidTabs(lvl) + '<div class="vid-slot">' + videoHtml(lvl.id, lvl.q + ' tutorial') + '</div></div>'; }
function openSheet(slot, ctx) { sheetCtx = { slot: slot, ctx: ctx }; renderSheet(); }
function closeSheet() { sheetCtx = null; $('#sheet').innerHTML = ''; }
function levelLocked() { return !!(W && sheetCtx && sheetCtx.ctx === 'workout' && W.logged[sheetCtx.slot] && W.logged[sheetCtx.slot].sets.length); }
function renderSheet() {
  if (!sheetCtx) return;
  var slot = sheetCtx.slot, S = SLOTS[slot], lad = ladderOf(D, state, slot), cur = state.levels[slot].idx, lvl = lad[cur];
  var locked = levelLocked();
  var cues = lvl.cues.concat(S.general || []);
  var li = function (arr) { return '<ul class="bul">' + arr.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>'; };
  var cuesHtml = lvl.cues.length ? li(lvl.cues) : li(S.general || []);
  if (lvl.cues.length && S.general && S.general.length) cuesHtml += '<h3>Form for every level</h3>' + li(S.general);
  var ladHtml = '<div class="ladder">' + lad.map(function (l, i) {
    return '<button class="' + (i < cur ? 'done' : i === cur ? 'cur' : '') + (locked && i !== cur ? ' lock' : '') + '" data-act="pick-level" data-slot="' + slot + '" data-i="' + i + '"' + (locked ? ' disabled' : '') + '><span class="mark"></span><span>' + esc(l.name) + (i === cur ? ' · now' : '') + '</span></button>';
  }).join('') + '</div>';
  var paths = LADDERS[slot].paths, pathHtml = '';
  if (Object.keys(paths).length > 1 && !(sheetCtx.ctx === 'workout')) {
    pathHtml = '<h3>Variation</h3><div class="pathsel">' + Object.keys(paths).map(function (k) {
      return '<button data-act="set-path" data-slot="' + slot + '" data-path="' + k + '" aria-pressed="' + (k === state.levels[slot].path) + '">' + esc(paths[k].label) + '</button>';
    }).join('') + '</div>';
  }
  var hist = seriesFor(state, slot).slice(-3).reverse().map(function (s) { return '<li>' + shortDate(s.date) + ' · ' + esc(s.name) + ' · ' + s.sets.join(' · ') + (s.kind === 'hold' ? ' s' : '') + '</li>'; }).join('');
  var html = '<div class="sheet-bg" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(lvl.name) + '"><div class="grab"></div>' +
    '<h2>' + esc(lvl.name) + '</h2><p class="muted" style="margin-top:6px">' + esc(S.label) + '. Works ' + esc(S.muscles.charAt(0).toLowerCase() + S.muscles.slice(1)) + '.</p>' +
    (lvl.equip ? '<span class="chip">' + ICON_EQUIP + ' Needs: ' + esc(lvl.equip) + '</span>' : '') +
    '<h3>How to</h3>' + cuesHtml +
    (lvl.note ? '<div class="note">' + esc(lvl.note) + '</div>' : '') +
    '<h3>Video</h3>' + vidBlock(lvl) +
    '<div class="links"><a href="' + ytUrl(lvl.q + ' tutorial') + '" target="_blank" rel="noopener">More videos on YouTube</a><a href="' + WIKI_BASE + S.wiki + '" target="_blank" rel="noopener">Guide on the r/bodyweightfitness wiki</a></div>' +
    '<h3>Progression ladder</h3>' + (locked ? '<p class="muted small" style="margin-bottom:6px">You already did sets of this exercise today, so the level can only change in your next workout.</p>' : '<p class="muted small" style="margin-bottom:6px">Tap a step to change level. Use it to adjust your starting point.</p>') + ladHtml + pathHtml +
    (hist ? '<h3>Recent records</h3><ul class="bul">' + hist + '</ul>' : '') +
    '<div class="btn-row" style="margin-top:22px"><button class="btn" data-act="sheet-close">Close</button></div></div>';
  $('#sheet').innerHTML = html;
}

function openWarm(id) {
  var it = warmupItems(D, state).filter(function (x) { return x.id === id; })[0];
  if (!it) return;
  sheetCtx = null;
  $('#sheet').innerHTML = '<div class="sheet-bg" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(it.name) + '"><div class="grab"></div>' +
    '<h2>' + esc(it.name) + '</h2><p class="muted" style="margin-top:6px">Warm-up. ' + esc(it.n + ' ' + it.unit) + '.</p>' +
    (it.equip ? '<span class="chip">' + ICON_EQUIP + ' Needs: ' + esc(it.equip) + '</span>' : '') +
    '<h3>How to</h3><ul class="bul">' + it.how.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' +
    (it.q ? '<h3>Video</h3>' + videoHtml('w.' + it.id, it.q) : '') +
    '<div class="btn-row" style="margin-top:22px"><button class="btn" data-act="sheet-close">Close</button></div></div>';
}

function confirmBox(title, text, buttons) {
  $('#sheet').innerHTML = '<div class="sheet-bg" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="grab"></div><h2>' + esc(title) + '</h2><p class="muted" style="margin-top:8px">' + esc(text) + '</p><div style="margin-top:18px;display:grid;gap:10px">' +
    buttons.map(function (b) { return '<button class="btn ' + (b.cls || '') + '" data-act="' + b.act + '"' + (b.id ? ' data-id="' + esc(b.id) + '"' : '') + '>' + esc(b.label) + '</button>'; }).join('') + '</div></div>';
  sheetCtx = null;
}

/* ---------- Treino guiado ---------- */
function tone(freq, t, dur, vol) {
  try {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var o = audioCtx.createOscillator(), g = audioCtx.createGain(), at = audioCtx.currentTime + t;
    o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol || 0.25, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.start(at); o.stop(at + dur + 0.02);
  } catch (e) { }
}
function beep() { tone(880, 0, 0.18); tone(880, 0.22, 0.18); try { if (navigator.vibrate) navigator.vibrate(200); } catch (e) { } }
function tickBeep() { tone(660, 0, 0.12); }
function goBeep() { tone(1175, 0, 0.45, 0.3); try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) { } }
function doneChime() { tone(660, 0, 0.14, 0.2); tone(880, 0.12, 0.14, 0.2); tone(1320, 0.24, 0.3, 0.2); }
var lastCue = null;
function cue(key, n) {
  if (lastCue === key) return;
  lastCue = key; if (n > 0) tickBeep(); else goBeep();
}
function prepAudio() {
  try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) { }
  try { if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }, function () { }); } catch (e) { }
}
function newWorkout() {
  var logged = {};
  SLOT_ORDER.filter(function (s) { return isActive(D, state, s); }).forEach(function (slot) {
    var p = prescribe(D, state, slot);
    logged[slot] = { levelId: p.level.id, sets: [], targets: p.targets };
  });
  return { startedAt: Date.now(), phase: 'warmup', warm: {}, warmI: 0, warmEnd: 0, steps: buildSteps(D, state), i: 0, logged: logged, skipped: [], value: null, restEnd: 0, restTotal: 0, holdStart: null };
}
function curStep() { return W.steps[W.i]; }
function levelOfStep(step) {
  var l = W.logged[step.slot]; var lad = ladderOf(D, state, step.slot);
  for (var i = 0; i < lad.length; i++) if (lad[i].id === l.levelId) return lad[i];
  return currentLevel(D, state, step.slot);
}
function nextIndex(from) {
  for (var i = from; i < W.steps.length; i++) if (W.skipped.indexOf(W.steps[i].slot) < 0) return i;
  return -1;
}
function setDefault() {
  var st = curStep(), t = W.logged[st.slot].targets[st.set - 1];
  W.value = t; W.holdStart = null; W.side = 0; W.right = null;
}
function goSet(idx) {
  W.i = idx; W.phase = 'set'; setDefault(); saveDraft(); renderWorkout();
}
function startWorkout() {
  W = newWorkout(); prepAudio(); startTick(); saveDraft(); renderWorkout();
}
function resumeWorkout() {
  W = loadDraft(); if (!W) { render(); return; }
  prepAudio(); startTick();
  if (W.phase === 'rest' && Date.now() >= W.restEnd) { var n = nextIndex(W.i + 1); if (n >= 0) { goSet(n); return; } }
  renderWorkout();
}
function startTick() { clearInterval(tickTimer); tickTimer = setInterval(tick, 250); }
function stopTick() { clearInterval(tickTimer); tickTimer = null; try { if (wakeLock && wakeLock.release) wakeLock.release(); } catch (e) { } wakeLock = null; }
function fmtClock(sec) { sec = Math.max(0, Math.ceil(sec)); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
function subUpdate(label, pct) {
  var b = $('#subBar'), l = $('#subLabel');
  if (b) b.style.width = Math.max(0, Math.min(100, pct)) + '%';
  if (l) l.textContent = label;
}
function timerText(total, elapsed) {
  if (elapsed < 0) return String(Math.ceil(-elapsed));
  return Math.max(0, Math.ceil(total - elapsed)) + ' s';
}
function tick() {
  if (!W) return;
  if (W.phase === 'rest') {
    var rem = (W.restEnd - Date.now()) / 1000, el = $('#restTime');
    if (el) el.textContent = fmtClock(rem);
    subUpdate(fmtClock(rem), 100 * (1 - rem / W.restTotal));
    if (rem > 0 && rem <= 3) cue('r' + W.i + ':' + Math.ceil(rem), Math.ceil(rem));
    if (rem <= 0) { lastCue = null; goBeep(); var n = nextIndex(W.i + 1); if (n >= 0) goSet(n); else finishNow(); }
  } else if (W.phase === 'warmup' && W.warmEnd > 0) {
    var wit = warmupItems(D, state)[W.warmI || 0], wel = wit.secs - (W.warmEnd - Date.now()) / 1000, we = $('#warmTime');
    if (wel < 0) cue('w' + W.warmI + ':' + Math.ceil(-wel), Math.ceil(-wel)); else if (wel < 1) cue('w' + W.warmI + ':go', 0); else if (wit.secs - wel <= 3 && wit.secs - wel > 0 && wit.secs > 6) cue('w' + W.warmI + ':e' + Math.ceil(wit.secs - wel), 1);
    if (we) we.textContent = timerText(wit.secs, wel);
    if (wel >= wit.secs) { beep(); W.warmEnd = -1; saveDraft(); renderWorkout(); }
  } else if (W.phase === 'set' && W.holdStart) {
    var el2 = $('#holdTime'), hs = (Date.now() - W.holdStart) / 1000, hst = curStep(), htg = W.logged[hst.slot].targets[hst.set - 1];
    if (hs < 0) cue('h' + W.i + ':' + Math.ceil(-hs), Math.ceil(-hs)); else if (hs < 1) cue('h' + W.i + ':go', 0); else if (htg - hs <= 3 && htg - hs > 0 && htg > 6) cue('h' + W.i + ':e' + Math.ceil(htg - hs), 1);
    if (el2) el2.textContent = timerText(htg, hs);
    if (hs >= htg) { beep(); H['w-hold-stop'](); }
  }
}
function warmGo(d) {
  var n = warmupItems(D, state).length, i = (W.warmI || 0) + d;
  W.warmEnd = 0;
  if (i >= n) { H['w-begin'](); return; }
  W.warmI = Math.max(0, i); saveDraft(); renderWorkout();
}
function exList() {
  var seen = [];
  W.steps.forEach(function (s) { if (seen.indexOf(s.slot) < 0) seen.push(s.slot); });
  return seen;
}
/* Uma unidade por item do aquecimento e uma por série do treino. */
function progressInfo() {
  var wn = warmupItems(D, state).length, total = wn + W.steps.length, d;
  if (W.phase === 'summary') d = total;
  else if (W.phase === 'warmup') d = Math.min(W.warmI || 0, wn);
  else d = wn + W.i + (W.phase === 'rest' ? 1 : 0);
  return { done: d, total: total };
}
function groupLabel(step) {
  if (step.group === 'core') return 'Core';
  return 'Pair ' + step.group.slice(1) + ' of 3';
}
var lastKey = '';
function renderWorkout() {
  var ov = $('#overlay');
  if (!W) { ov.innerHTML = ''; document.body.classList.remove('no-scroll'); return; }
  var segs = function () {
    var p = progressInfo(), h = '';
    for (var q = 0; q < p.total; q++) h += '<i class="' + (q < p.done ? 'done' : q === p.done ? 'cur' : '') + '"></i>';
    return '<div class="w-segs" role="progressbar" aria-valuenow="' + p.done + '" aria-valuemin="0" aria-valuemax="' + p.total + '" aria-label="Workout progress">' + h + '</div>';
  };
  var top = function (label, pct, sub) {
    return '<div class="w-head"><div class="w-top"><button class="w-x" data-act="w-exit" aria-label="Leave workout">×</button>' + segs() + '<span class="w-count">' + label + '</span></div>' + (sub || '') + '</div>';
  };
  var topFor = function (sub) { var p = progressInfo(); return top(Math.min(p.done + 1, p.total) + '/' + p.total, 100 * p.done / p.total, sub); };
  var subTime = function (label, pct) { return '<div class="w-sub-row"><div class="w-prog sub"><i id="subBar" style="width:' + pct + '%"></i></div><span class="w-count" id="subLabel">' + label + '</span></div>'; };
  var body = '';
  if (W.phase === 'warmup') {
    var items = warmupItems(D, state), wi = Math.min(W.warmI || 0, items.length - 1), it = items[wi];
    var timerBox = '', main;
    if (it.secs && W.warmEnd) {
      var shown = W.warmEnd < 0 ? '0 s' : timerText(it.secs, it.secs - (W.warmEnd - Date.now()) / 1000);
      timerBox = '<div class="big-stepper"><span class="val num" id="warmTime">' + shown + '</span></div>';
      main = '<button class="btn tape" data-act="w-warm-next">Done</button>';
    } else if (it.secs) {
      timerBox = '<div class="big-stepper"><span class="val num">' + it.secs + ' s</span></div>';
      main = '<div class="btn-row" style="margin-top:0"><button class="btn ghost" data-act="w-warm-timer">Start timer</button><button class="btn tape" data-act="w-warm-next">Done</button></div>';
    } else {
      main = '<button class="btn tape" data-act="w-warm-next">Done</button>';
    }
    body = topFor('') + '<div class="w-body"><p class="w-group">Warm-up</p><h1 class="w-name">' + esc(it.name) + '</h1>' +
      '<p class="w-sub">Item ' + (wi + 1) + ' of ' + items.length + '</p><div class="w-target"><span class="num">' + esc(it.n) + '</span><span>' + esc(it.unit) + '</span></div>' +
      it.how.map(function (t) { return '<p class="w-cue">' + esc(t) + '</p>'; }).join('') + timerBox + main + warmSwap(it) +
      (it.q ? '<div class="vid-keep" style="margin-top:16px">' + videoHtml('w.' + it.id, it.q) + '</div>' : '') +
      '<div class="w-links">' + (wi > 0 ? '<button data-act="w-warm-back">Back</button>' : '') + '<button data-act="w-warm-skip">Skip this</button><button data-act="w-begin">Skip warm-up</button></div></div>';
  } else if (W.phase === 'set') {
    var st = curStep(), lvl = levelOfStep(st), S = SLOTS[st.slot], L = W.logged[st.slot], tg = L.targets[st.set - 1];
    var pct = 100 * W.i / W.steps.length;
    var pips = [1, 2, 3].map(function (n) { return '<i class="' + (n < st.set ? 'done' : n === st.set ? 'cur' : '') + '"></i>'; }).join('');
    var unit = lvl.kind === 'hold' ? 'seconds' : 'reps';
    if (lvl.perSide) unit += ' per side';
    var doneLabel = lvl.perSide ? (W.side ? 'Left side done' : 'Right side done') : 'Set done';
    var sidesHtml = lvl.perSide ? '<div class="sides" aria-label="Sides"><span class="' + (W.side ? 'done' : 'cur') + '">Right side</span><span class="' + (W.side ? 'cur' : '') + '">Left side</span></div><p class="muted small">Do one side, then the other. Both sides count as one set.</p>' : '';
    var input;
    if (lvl.kind === 'hold') {
      input = (W.holdStart ? '<div class="big-stepper"><span class="val num" id="holdTime">' + timerText(W.logged[curStep().slot].targets[curStep().set - 1], (Date.now() - W.holdStart) / 1000) + '</span></div><button class="btn tape" data-act="w-hold-stop">Stop</button>' :
        '<div class="big-stepper"><button data-act="w-val" data-d="-5" aria-label="Minus 5 seconds">−</button><span class="val num" id="val">' + W.value + ' s</span><button data-act="w-val" data-d="5" aria-label="Plus 5 seconds">+</button></div>' +
        '<div class="btn-row" style="margin-top:0"><button class="btn ghost" data-act="w-hold-start">Start timer</button><button class="btn tape" data-act="w-log">' + doneLabel + '</button></div>');
    } else {
      input = '<div class="big-stepper"><button data-act="w-val" data-d="-1" aria-label="Minus one rep">−</button><span class="val num" id="val">' + W.value + '</span><button data-act="w-val" data-d="1" aria-label="Plus one rep">+</button></div><button class="btn tape" data-act="w-log">' + doneLabel + '</button>';
    }
    var ssub = '';
    body = topFor(ssub) + '<div class="w-body"><p class="w-group">' + groupLabel(st) + ' · ' + esc(S.label) + '</p><h1 class="w-name">' + esc(lvl.name) + '</h1><p class="w-sub">Set ' + st.set + ' of 3</p>' +
      sidesHtml + '<div class="w-target"><span class="num">' + tg + '</span><span>' + unit + ' target</span></div><p class="w-cue">' + esc(lvl.cues[0] || (S.general && S.general[0]) || '') + '</p>' + input + '<div class="vid-keep" style="margin-top:16px">' + vidBlock(lvl) + '</div>' +
      '<div class="w-links"><button data-act="w-back">Back</button><button data-act="w-info">How to</button><button data-act="w-skip">Skip exercise</button><button data-act="w-finish-ask">Finish workout</button></div></div>';
  } else if (W.phase === 'rest') {
    var st2 = curStep(), n = nextIndex(W.i + 1), pct2 = 100 * (W.i + 1) / W.steps.length;
    var nextHtml = '';
    if (n >= 0) {
      var ns = W.steps[n], nl = levelOfStep(ns), nt = W.logged[ns.slot].targets[ns.set - 1];
      nextHtml = '<div class="next-up"><span class="muted small">Up next</span><div class="n">' + esc(nl.name) + '</div><span class="muted">Set ' + ns.set + ' of 3 · target ' + nt + (nl.kind === 'hold' ? ' s' : ' reps') + (nl.perSide ? ' per side' : '') + '</span>' + '<div class="vid-keep" style="margin-top:12px">' + vidBlock(nl) + '</div>' + '</div>';
    }
    var rrem = (W.restEnd - Date.now()) / 1000;
    body = topFor(subTime(fmtClock(rrem), 100 * (1 - rrem / W.restTotal))) + '<div class="w-body"><p class="w-group">Rest</p><div class="rest-time num" id="restTime">' + fmtClock((W.restEnd - Date.now()) / 1000) + '</div>' +
      '<div class="btn-row" style="margin-top:18px"><button class="btn ghost" data-act="w-rest-add">+ 15 s</button><button class="btn tape" data-act="w-rest-skip">Skip</button></div>' + nextHtml + '<div class="w-links"><button data-act="w-back">Back</button><button data-act="w-finish-ask">Finish workout</button></div></div>';
  } else if (W.phase === 'summary') {
    var r = W.result, mins = Math.max(1, Math.round(r.session.durationSec / 60));
    var rows = SLOT_ORDER.filter(function (k) { return r.session.entries[k]; }).map(function (k) {
      var e = r.session.entries[k];
      return '<div class="res"><span>' + esc(e.name) + '</span><span class="r">' + esc(sessionSummaryText(e)) + '</span></div>';
    }).join('');
    var ups = r.promotions.map(function (p) { return '<div class="up-banner">Level up: ' + esc(p.from) + ' → ' + esc(p.to) + '. Next time, start at 3 × 5.</div>'; }).join('');
    body = top('', 100) + '<div class="w-body"><h1 class="w-name">Workout complete</h1><p class="w-sub">' + mins + ' min · ' + Object.keys(r.session.entries).length + ' exercises</p>' + ups +
      '<div style="margin-top:14px;border-top:2px solid var(--ink)">' + (rows || '<p class="empty">No sets logged.</p>') + '</div>' +
      '<div style="margin-top:auto;padding-top:22px"><button class="btn tape" data-act="w-close">Close</button></div></div>';
  }
  /* Mantém o iframe do vídeo entre renders (se o vídeo é o mesmo), para ele não recarregar a cada toque. */
  var oldK = ov.querySelector('.vid-keep'), oldBody = ov.querySelector('.w-body');
  var key = W.phase + ':' + W.i + ':' + (W.side || 0), scr = oldBody && oldBody.scrollTop;
  var tmp = document.createElement('div');
  tmp.innerHTML = '<div class="overlay" role="region" aria-label="Workout in progress">' + body + '</div>';
  var newK = tmp.querySelector('.vid-keep'), oF = oldK && oldK.querySelector('iframe'), nF = newK && newK.querySelector('iframe');
  if (oF && nF && oF.getAttribute('src') === nF.getAttribute('src') && oldK.parentNode.className === 'w-body' && newK.parentNode.className === 'w-body') {
    /* Mesmo vídeo: troca tudo em volta dele, sem mexer no iframe (mover um iframe recarrega o vídeo). */
    var ob = oldK.parentNode, nb = newK.parentNode;
    ov.querySelector('.w-head').replaceWith(tmp.querySelector('.w-head'));
    while (ob.firstChild !== oldK) ob.removeChild(ob.firstChild);
    while (oldK.nextSibling) ob.removeChild(oldK.nextSibling);
    while (nb.firstChild !== newK) ob.insertBefore(nb.firstChild, oldK);
    while (newK.nextSibling) ob.appendChild(newK.nextSibling);
  } else {
    if (key !== lastKey) tmp.firstChild.classList.add('enter');
    ov.innerHTML = ''; ov.appendChild(tmp.firstChild);
    var nbody = ov.querySelector('.w-body');
    if (nbody && scr && key === lastKey) nbody.scrollTop = scr;
  }
  lastKey = key;
  document.body.classList.add('no-scroll');
}
function logSet() {
  var st = curStep(), L = W.logged[st.slot];
  L.sets[st.set - 1] = W.value;
  var n = nextIndex(W.i + 1);
  if (n < 0) { finishNow(); return; }
  var secs = restSeconds(D, state, st.slot);
  W.phase = 'rest'; W.restTotal = secs; W.restEnd = Date.now() + secs * 1000; W.holdStart = null;
  saveDraft(); renderWorkout();
}
function finishNow() {
  var warmDone = Object.keys(W.warm).filter(function (k) { return W.warm[k]; }).length;
  W.warmDone = warmDone;
  var dur = Math.round((Date.now() - W.startedAt) / 1000);
  var anySets = Object.keys(W.logged).some(function (k) { return W.logged[k].sets.length; });
  var res = finishWorkout(D, state, W, isoDate(), dur);
  if (anySets) { persistSession(res.session); persistProfile(); } else { state.sessions = state.sessions.filter(function (s) { return s.id !== res.session.id; }); }
  clearDraft(); stopTick();
  W.phase = 'summary'; W.result = res; renderWorkout();
}
function closeWorkout() { W = null; stopTick(); $('#overlay').innerHTML = ''; document.body.classList.remove('no-scroll'); closeSheet(); render(); }

/* ---------- Eventos ---------- */
var H = {
  'tab': function (el) { tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  'start': function () { startWorkout(); },
  'resume': function () { resumeWorkout(); },
  'discard-draft': function () { clearDraft(); render(); },
  'open-ex': function (el) { openSheet(el.dataset.slot, 'home'); },
  'open-warm': function (el) { openWarm(el.dataset.id); },
  'vid-tab': function (el) {
    el.parentNode.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b === el ? 'true' : 'false'); });
    el.closest('.vid-wrap').querySelector('.vid-slot').innerHTML = videoHtml(el.dataset.key, el.dataset.q);
  },
  'warm-swap': function (el) {
    var m = state.settings.warmAlt || (state.settings.warmAlt = {});
    if (el.dataset.alt) m[el.dataset.base] = el.dataset.alt; else delete m[el.dataset.base];
    persistProfile(); renderWorkout();
  },
  'sheet-close': function () { closeSheet(); },
  'pick-level': function (el) {
    var slot = el.dataset.slot, i = +el.dataset.i;
    state.levels[slot].idx = i; persistProfile();
    if (W && sheetCtx && sheetCtx.ctx === 'workout') {
      var p = prescribe(D, state, slot); W.logged[slot] = { levelId: p.level.id, sets: [], targets: p.targets };
      if (W.phase === 'set' && curStep().slot === slot) setDefault();
      saveDraft(); renderWorkout();
    } else render();
    renderSheet();
  },
  'set-path': function (el) {
    var slot = el.dataset.slot, path = el.dataset.path;
    if (state.levels[slot].path !== path) { state.levels[slot] = { path: path, idx: 0 }; persistProfile(); }
    render(); renderSheet();
  },
  'toggle-bar': function () { state.settings.hasBar = !state.settings.hasBar; persistProfile(); render(); toast(state.settings.hasBar ? 'Pull-up added to your workout' : 'Pull-up left out of your workout'); },
  'rest-main': function (el) { state.settings.restMain = Math.max(30, Math.min(300, state.settings.restMain + 15 * +el.dataset.d)); persistProfile(); $('#rm').textContent = state.settings.restMain + ' s'; },
  'rest-core': function (el) { state.settings.restCore = Math.max(30, Math.min(300, state.settings.restCore + 15 * +el.dataset.d)); persistProfile(); $('#rc').textContent = state.settings.restCore + ' s'; },
  'copy-bk': function () {
    var ta = $('#bk'); ta.focus(); ta.select();
    var done = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(ta.value).then(function () { toast('Backup copied'); }, function () { toast('Text selected, copy it manually'); }); done = true; } } catch (e) { }
    if (!done) toast('Text selected, copy it manually');
  },
  'import-bk': function () {
    try {
      var o = JSON.parse($('#bk').value);
      if (!o || !o.sessions || !o.levels) throw new Error('formato');
      var before = state.sessions.length;
      mergeLoaded(o, null);
      persistProfile(); state.sessions.forEach(function (s) { persistSession(s); });
      render(); toast((state.sessions.length - before) + ' workouts imported');
    } catch (e) { toast('Invalid backup. Paste the full text.'); }
  },
  'sess-del-ask': function (el) {
    var s = state.sessions.filter(function (x) { return x.id === el.dataset.id; })[0];
    var promoted = s && Object.keys(s.entries).some(function (k) { return s.entries[k].promotedTo; });
    confirmBox('Delete this workout?', 'It is removed from your history and the next targets are recalculated.' + (promoted ? ' Level-ups it caused stay.' : '') + ' This cannot be undone.', [{ label: 'Delete workout', act: 'sess-del-do', id: el.dataset.id }, { label: 'Cancel', act: 'sheet-close', cls: 'ghost' }]);
  },
  'sess-del-do': function (el) {
    state.sessions = state.sessions.filter(function (x) { return x.id !== el.dataset.id; });
    persistProfile(); if (dbRefs) enqueue(function () { return dbRefs.sessions.doc(el.dataset.id).delete(); });
    closeSheet(); render(); toast('Workout deleted');
  },
  'reset-ask': function () { confirmBox('Delete everything?', 'Your logged workouts are deleted and the levels go back to the start. This cannot be undone.', [{ label: 'Delete everything', act: 'reset-do' }, { label: 'Cancel', act: 'sheet-close', cls: 'ghost' }]); },
  'reset-do': function () {
    var keepBar = state.settings.hasBar; state = defaultState(D); state.settings.hasBar = keepBar;
    persistProfile(); if (dbRefs) { /* sessões antigas ficam na conta, mas não aparecem mais após limpar: apaga uma a uma */ dbRefs.sessions.get().then(function (sn) { sn.docs.forEach(function (d) { enqueue(function () { return dbRefs.sessions.doc(d.id).delete(); }); }); }, function () { }); }
    closeSheet(); render(); toast('Everything deleted');
  },
  'bar': function (el) {
    var box = el.closest('.chart-box'); if (!box) return;
    box.querySelectorAll('.bar').forEach(function (b) { b.classList.remove('sel'); });
    el.classList.add('sel'); box.querySelector('.chart-cap').textContent = el.getAttribute('data-cap');
  },
  /* treino */
  'w-exit': function () {
    var any = Object.keys(W.logged).some(function (k) { return W.logged[k].sets.length; });
    confirmBox('Leave workout?', any ? 'You can save what you did or continue later where you stopped.' : 'You have not logged any set yet.', [
      { label: 'Continue workout', act: 'sheet-close', cls: 'tape' }].concat(any ? [{ label: 'Save and finish', act: 'w-finish', cls: 'ghost' }] : []).concat([
      { label: any ? 'Leave and continue later' : 'Leave workout', act: 'w-leave', cls: 'ghost' }, { label: 'Discard workout', act: 'w-discard', cls: 'ghost' }]));
  },
  'w-leave': function () { saveDraft(); W = null; stopTick(); $('#overlay').innerHTML = ''; document.body.classList.remove('no-scroll'); closeSheet(); render(); },
  'w-discard': function () { clearDraft(); W = null; stopTick(); $('#overlay').innerHTML = ''; document.body.classList.remove('no-scroll'); closeSheet(); render(); },
  'w-finish-ask': function () { H['w-exit'](); },
  'w-finish': function () { closeSheet(); finishNow(); },
  'w-warm-next': function () { var it = warmupItems(D, state)[W.warmI || 0]; if (it) W.warm[it.id] = true; doneChime(); warmGo(1); },
  'w-warm-skip': function () { warmGo(1); },
  'w-warm-back': function () { warmGo(-1); },
  'w-warm-timer': function () { prepAudio(); var it = warmupItems(D, state)[W.warmI || 0]; W.warmEnd = Date.now() + (it.secs + 3) * 1000; lastCue = null; saveDraft(); renderWorkout(); },
  'w-begin': function () { var n = nextIndex(0); if (n < 0) { finishNow(); return; } goSet(n); },
  'w-val': function (el) {
    var st = curStep(), lvl = levelOfStep(st), d = +el.dataset.d;
    W.value = Math.max(0, W.value + d); saveDraft();
    $('#val').textContent = W.value + (lvl.kind === 'hold' ? ' s' : '');
  },
  'w-back': function () {
    var from = W.phase === 'rest' ? W.i : W.i - 1, p = -1;
    for (var k = from; k >= 0; k--) if (W.skipped.indexOf(W.steps[k].slot) < 0) { p = k; break; }
    if (p < 0) {
      var wi = warmupItems(D, state).length - 1;
      W.phase = 'warmup'; W.warmI = Math.max(0, wi); W.warmEnd = 0; W.holdStart = null; saveDraft(); renderWorkout(); return;
    }
    var ps = W.steps[p], L = W.logged[ps.slot], prev = L.sets[ps.set - 1];
    L.sets.length = Math.min(L.sets.length, ps.set - 1);
    W.i = p; W.phase = 'set'; setDefault();
    if (prev != null) W.value = prev;
    saveDraft(); renderWorkout();
  },
  'w-hold-start': function () { prepAudio(); W.holdStart = Date.now() + 3000; lastCue = null; renderWorkout(); },
  'w-hold-stop': function () { var hst = curStep(), cap = W.logged[hst.slot].targets[hst.set - 1]; var el = (Date.now() - W.holdStart) / 1000; if (el > 0) W.value = Math.min(cap, Math.max(1, Math.round(el))); W.holdStart = null; saveDraft(); renderWorkout(); },
  'w-log': function () {
    var st = curStep(), lvl = levelOfStep(st);
    doneChime();
    if (lvl.perSide) {
      if (!W.side) { W.right = W.value; W.side = 1; W.value = W.logged[st.slot].targets[st.set - 1]; W.holdStart = null; saveDraft(); renderWorkout(); return; }
      W.value = Math.min(W.right == null ? W.value : W.right, W.value);
    }
    logSet();
  },
  'w-rest-add': function () { W.restEnd += 15000; W.restTotal += 15; saveDraft(); },
  'w-rest-skip': function () { var n = nextIndex(W.i + 1); if (n >= 0) goSet(n); else finishNow(); },
  'w-info': function () { openSheet(curStep().slot, 'workout'); },
  'w-skip': function () {
    var st = curStep(); W.skipped.push(st.slot);
    var n = nextIndex(W.i + 1); if (n >= 0) { toast(SLOTS[st.slot].label + ' skipped today'); goSet(n); } else finishNow();
  },
  'w-close': function () { closeWorkout(); }
};
document.addEventListener('click', function (e) {
  var el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  var f = H[el.dataset.act]; if (f) f(el, e);
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && $('#sheet').innerHTML) closeSheet();
  if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.getAttribute && e.target.getAttribute('data-act') === 'bar') { e.preventDefault(); H.bar(e.target); }
});
document.addEventListener('visibilitychange', function () { if (!document.hidden && W) { prepAudio(); tick(); } });

(async function boot() {
  render();
  await initStorage();
  var d = loadDraft();
  render();
})();
