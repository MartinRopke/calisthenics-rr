/* App: telas, treino guiado e armazenamento. Usa data.js e logic.js (globais). */
var D = { SLOTS: SLOTS, LADDERS: LADDERS, PAIRS: PAIRS, CORE: CORE, SLOT_ORDER: SLOT_ORDER, START_LEVELS: START_LEVELS, WARMUP: WARMUP, WARMUP_EXTRAS: WARMUP_EXTRAS };
var LS_KEY = 'treinoRR.v1', DRAFT_KEY = 'treinoRR.draft';

var state = defaultState(D);
var tab = 'hoje';
var W = null;            /* treino em andamento */
var sheetCtx = null;     /* {slot, ctx} da folha aberta */
var sync = { mode: 'local', note: 'Carregando…' };
var dbRefs = null;
var queue = Promise.resolve();
var audioCtx = null, wakeLock = null, tickTimer = null, toastTimer = null;

function $(s) { return document.querySelector(s); }
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function shortDate(s) { var p = s.split('-'); return p[2] + '/' + p[1]; }

/* ---------- Armazenamento ---------- */
function localSave() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { } }
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
  queue = queue.then(fn).then(function () { if (sync.mode === 'db') { sync.note = 'Salvo na sua conta.'; sync.err = false; } }).catch(function (e) {
    sync.err = true; sync.note = 'Não consegui salvar na conta (' + ((e && e.code) || 'erro') + '). Os dados continuam neste aparelho.';
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
  if (typeof claude === 'undefined' || !claude.use) { sync = { mode: 'local', note: 'Sem conta aqui: os dados ficam só neste navegador.' }; return; }
  try {
    var user = await claude.use('user'), db = await claude.use('db');
    var uid = user ? await user.id() : null;
    if (!db || !uid) { sync = { mode: 'local', note: 'Sem conta aqui: os dados ficam só neste navegador.' }; return; }
    var prof = db.doc('data/users/' + uid + '/profile');
    var sess = prof.collection('sessions');
    var snap = await withTimeout(prof.get(), 10000);
    var ssnap = await withTimeout(sess.orderBy('date', 'asc').limit(1000).get(), 10000);
    var localCount = state.sessions.length;
    if (snap.exists) mergeLoaded(snap.data(), 'profile');
    var remoteIds = {};
    ssnap.docs.forEach(function (d) { var v = d.data(); if (v) remoteIds[d.id] = 1; mergeLoaded({ sessions: [v] }, null); });
    dbRefs = { profile: prof, sessions: sess };
    sync = { mode: 'db', note: 'Salvo na sua conta.' };
    if (!snap.exists) persistProfile();
    state.sessions.forEach(function (s) { if (!remoteIds[s.id]) persistSession(s); });
    localSave();
  } catch (e) {
    sync = { mode: 'local', note: 'Não consegui falar com a sua conta. Os dados ficam neste navegador por enquanto.', err: true };
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
function sideOf(level) { return level.perSide ? ' por lado' : ''; }
function targetHtml(level, targets) {
  var same = targets.every(function (t) { return t === targets[0]; });
  var u = level.kind === 'hold' ? 's' : (level.perSide ? 'por lado' : 'reps');
  if (level.kind === 'hold' && level.perSide) u = 's por lado';
  return same ? '3 × ' + targets[0] + '<small>' + u + '</small>' : targets.join(' · ') + '<small>' + u + '</small>';
}
function metaLine(S, lvl, first) {
  var same = S.label.toLowerCase() === lvl.name.toLowerCase();
  var parts = [];
  if (!same) parts.push(S.label);
  if (first) parts.push('primeira vez neste nível');
  return parts.join(' · ') || S.group;
}
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
  if (o.goal) { var gy = base - plotH * o.goal / max; out += '<line class="goal" x1="0" x2="' + Wd + '" y1="' + gy + '" y2="' + gy + '"/><text x="' + Wd + '" y="' + (gy - 4) + '" text-anchor="end">meta ' + o.goal + '</text>'; }
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
  var dateTxt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  var pips = [0, 1, 2].map(function (i) { return '<span class="pip ' + (i < wk ? 'on' : '') + '"></span>'; }).join('');
  var act = SLOT_ORDER.filter(function (s) { return isActive(D, state, s); }).length;
  function exRow(slot) {
    var S = SLOTS[slot], lvl = currentLevel(D, state, slot);
    if (!isActive(D, state, slot)) {
      return '<button class="ex off" data-act="open-ex" data-slot="' + slot + '"><div class="ex-top"><div><div class="ex-name">' + esc(S.label) + '</div><div class="ex-meta">Entra quando você tiver a barra</div></div></div>' + rungsHtml(slot) + '</button>';
    }
    var p = prescribe(D, state, slot);
    return '<button class="ex" data-act="open-ex" data-slot="' + slot + '"><div class="ex-top"><div><div class="ex-name">' + esc(lvl.name) + '</div><div class="ex-meta">' + esc(metaLine(S, lvl, p.first)) + '</div></div><div class="ex-target num">' + targetHtml(lvl, p.targets) + '</div></div>' + rungsHtml(slot) + '</button>';
  }
  function group(title, sub, rows) {
    return '<div class="grp"><h3>' + title + '</h3><span class="muted small">' + sub + '</span></div><div class="ex-list">' + rows + '</div>';
  }
  var warm = warmupItems(D, state);
  var warmRows = warm.map(function (it) {
    return '<div class="ex"><div class="ex-name">' + esc(it.name) + '</div><div class="ex-meta">' + esc(it.n + ' ' + it.unit) + '</div></div>';
  }).join('');
  var rows = group('Aquecimento', warm.length + ' itens', warmRows);
  PAIRS.forEach(function (pair, i) {
    rows += group('Par ' + (i + 1) + ' de 3', '3 séries, descanso de ' + state.settings.restMain + ' s', pair.map(exRow).join(''));
  });
  rows += group('Core', '3 séries, descanso de ' + state.settings.restCore + ' s', CORE.map(exRow).join(''));
  var cta;
  if (draft) {
    cta = '<div class="btn-row"><button class="btn tape" data-act="resume">Continuar treino</button><button class="btn ghost" data-act="discard-draft">Descartar</button></div>';
  } else {
    cta = '<button class="btn tape" data-act="start">Começar treino</button>';
  }
  return '<div class="wrap"><div class="page-head"><h1>Hoje</h1><p class="date">' + esc(dateTxt) + '</p></div>' +
    '<div class="hint ' + hint.kind + '">' + esc(hint.text) + '</div>' + cta +
    '<div class="week"><span class="pips" aria-hidden="true">' + pips + '</span><span class="muted small">' + wk + ' de 3 treinos nesta semana</span></div>' +
    '<h2 class="sec-title">Treino de hoje</h2><p class="muted small">Aquecimento e ' + act + ' exercícios, nesta ordem. Toque num exercício para ver como fazer ou mudar de nível.</p>' +
    rows + '</div>';
}

function viewProgresso() {
  var today = isoDate(), weeks = weeklyCounts(state.sessions, 8, today);
  var wItems = weeks.map(function (w) { return { v: w.n, label: shortDate(w.start), cap: 'Semana de ' + shortDate(w.start) + ': ' + w.n + (w.n === 1 ? ' treino' : ' treinos') }; });
  var out = '<div class="wrap"><div class="page-head"><h1>Progresso</h1><p>' + state.sessions.length + (state.sessions.length === 1 ? ' treino registrado' : ' treinos registrados') + '</p></div>';
  out += '<h2 class="sec-title" style="margin-top:6px">Treinos por semana</h2>' + barChart(wItems, { goal: 3, min: 3, valueLabels: true, aria: 'Treinos por semana nas últimas 8 semanas', defaultCap: 'Toque numa barra para ver a semana.', h: 100 });
  out += '<h2 class="sec-title">Cada exercício</h2><p class="muted small">Cada barra é um treino: o total de repetições (ou segundos nos holds). Barras laranjas marcam o treino em que você subiu de nível.</p><div style="margin-top:8px">';
  SLOT_ORDER.forEach(function (slot) {
    var S = SLOTS[slot], lvl = currentLevel(D, state, slot), ser = seriesFor(state, slot).slice(-12);
    var inactive = !isActive(D, state, slot);
    out += '<div class="pcard"><div class="pcard-top"><h3>' + esc(inactive ? S.label : lvl.name) + '</h3><span class="muted small">' + (S.label.toLowerCase() === lvl.name.toLowerCase() || inactive ? '' : esc(S.label)) + '</span></div>' + rungsHtml(slot);
    if (!ser.length) out += '<p class="empty small" style="padding:10px 0 0">' + (inactive ? 'Aguardando a barra.' : 'Sem registros ainda. Faça um treino para ver a evolução.') + '</p>';
    else {
      var items = ser.map(function (s) {
        var u = s.kind === 'hold' ? ' s' : ' reps';
        return { v: s.total, up: s.promoted, label: shortDate(s.date), cap: shortDate(s.date) + ' · ' + s.name + ' · ' + s.sets.join(' + ') + u + (s.promoted ? ' · subiu para ' + s.promotedTo : '') };
      });
      out += barChart(items, { aria: 'Total por treino de ' + S.label, defaultCap: items[items.length - 1].cap, h: 96 });
    }
    out += '</div>';
  });
  out += '</div><h2 class="sec-title">Histórico</h2>';
  if (!state.sessions.length) out += '<p class="empty">Os treinos que você concluir aparecem aqui.</p>';
  else {
    out += state.sessions.slice().reverse().slice(0, 30).map(function (s) {
      var list = SLOT_ORDER.filter(function (k) { return s.entries[k]; }).map(function (k) {
        var e = s.entries[k];
        return '<li><span>' + esc(e.name) + (e.promotedTo ? '<span class="up-tag">subiu</span>' : '') + '</span><span>' + esc(sessionSummaryText(e)) + '</span></li>';
      }).join('');
      var n = Object.keys(s.entries).length;
      return '<details class="sess"><summary><span>' + shortDate(s.date) + '</span><span class="muted">' + n + ' exercícios' + (s.durationSec ? ' · ' + Math.max(1, Math.round(s.durationSec / 60)) + ' min' : '') + '</span></summary><ul>' + list + '</ul></details>';
    }).join('');
  }
  return out + '</div>';
}

function stepper(act, id, val, unit) {
  return '<div class="stepper"><button data-act="' + act + '" data-d="-1" aria-label="Diminuir">−</button><span class="val num" id="' + id + '">' + val + unit + '</span><button data-act="' + act + '" data-d="1" aria-label="Aumentar">+</button></div>';
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
  return '<div class="wrap"><div class="page-head"><h1>Ajustes</h1><p>' + esc(sync.note) + '</p></div>' +
    '<div class="set-row"><div><b>Tenho a barra de pull-up</b><p>Liga a pull-up e o Pair 1 completo no treino.</p></div><button class="switch" role="switch" aria-checked="' + !!st.hasBar + '" aria-label="Tenho a barra de pull-up" data-act="toggle-bar"></button></div>' +
    '<div class="set-row"><div><b>Descanso na força</b><p>Entre séries dos pares</p></div>' + stepper('rest-main', 'rm', st.restMain, ' s') + '</div>' +
    '<div class="set-row"><div><b>Descanso no core</b><p>Entre séries do trio</p></div>' + stepper('rest-core', 'rc', st.restCore, ' s') + '</div>' +
    '<h2 class="sec-title">Exercícios de core</h2><p class="muted small">Os padrões usam só o seu corpo e um apoio firme. Troque se tiver faixa, argolas ou barra.</p>' + pathRows +
    '<h2 class="sec-title">Backup</h2><p class="muted small">Copie o texto abaixo e guarde onde quiser. Para restaurar, cole um backup na caixa e toque em importar.</p>' +
    '<textarea id="bk" aria-label="Backup dos dados" spellcheck="false">' + esc(exp) + '</textarea>' +
    '<div class="btn-row"><button class="btn small ghost" data-act="copy-bk">Copiar</button><button class="btn small ghost" data-act="import-bk">Importar</button></div>' +
    '<h2 class="sec-title">Começar de novo</h2><p class="muted small">Apaga os treinos e volta os níveis ao ponto de partida do plano.</p>' +
    '<div class="btn-row"><button class="btn small ghost" data-act="reset-ask">Apagar tudo</button></div></div>';
}

function tabbar() {
  function t(id, label) { return '<button class="tab" data-act="tab" data-tab="' + id + '"' + (tab === id ? ' aria-current="page"' : '') + '>' + label + '</button>'; }
  return '<nav class="tabbar" aria-label="Seções">' + t('hoje', 'Hoje') + t('progresso', 'Progresso') + t('ajustes', 'Ajustes') + '</nav>';
}
function render() {
  var v = tab === 'hoje' ? viewHoje() : tab === 'progresso' ? viewProgresso() : viewAjustes();
  $('#app').innerHTML = v + tabbar();
}

/* ---------- Folha de exercício ---------- */
/* Vídeo: o quadro mostra a miniatura e só carrega o player quando tocado (economiza dados e não reinicia a cada tela). */
function videoHtml(key, q) {
  var v = (typeof VIDEOS !== 'undefined') && VIDEOS[key];
  if (!v) return '<a class="vid-link" href="' + ytUrl(q) + '" target="_blank" rel="noopener">Buscar vídeo no YouTube</a>';
  return '<div class="vid-box"><button class="vid" data-act="play-vid" data-id="' + v.id + '" data-title="' + esc(v.t) + '" aria-label="Tocar vídeo: ' + esc(v.t) + '"><img src="https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg" alt="" loading="lazy"><span class="play" aria-hidden="true"></span></button>' +
    '<p class="vid-cap">' + esc(v.t) + ' · ' + esc(v.c) + '</p></div>';
}
function playVideo(btn) {
  var box = btn.closest('.vid-box'); if (!box) return;
  var d = document.createElement('div'); d.className = 'vid';
  d.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + btn.dataset.id + '?autoplay=1&rel=0&playsinline=1&modestbranding=1" title="' + btn.dataset.title + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
  btn.replaceWith(d);
}
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
  if (lvl.cues.length && S.general && S.general.length) cuesHtml += '<h3>Postura em todos os níveis</h3>' + li(S.general);
  var ladHtml = '<div class="ladder">' + lad.map(function (l, i) {
    return '<button class="' + (i < cur ? 'done' : i === cur ? 'cur' : '') + (locked && i !== cur ? ' lock' : '') + '" data-act="pick-level" data-slot="' + slot + '" data-i="' + i + '"' + (locked ? ' disabled' : '') + '><span class="mark"></span><span>' + esc(l.name) + (i === cur ? ' · agora' : '') + '</span></button>';
  }).join('') + '</div>';
  var paths = LADDERS[slot].paths, pathHtml = '';
  if (Object.keys(paths).length > 1 && !(sheetCtx.ctx === 'workout')) {
    pathHtml = '<h3>Variação</h3><div class="pathsel">' + Object.keys(paths).map(function (k) {
      return '<button data-act="set-path" data-slot="' + slot + '" data-path="' + k + '" aria-pressed="' + (k === state.levels[slot].path) + '">' + esc(paths[k].label) + '</button>';
    }).join('') + '</div>';
  }
  var hist = seriesFor(state, slot).slice(-3).reverse().map(function (s) { return '<li>' + shortDate(s.date) + ' · ' + esc(s.name) + ' · ' + s.sets.join(' · ') + (s.kind === 'hold' ? ' s' : '') + '</li>'; }).join('');
  var html = '<div class="sheet-bg" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(lvl.name) + '"><div class="grab"></div>' +
    '<h2>' + esc(lvl.name) + '</h2><p class="muted" style="margin-top:6px">' + esc(S.label) + '. Trabalha ' + esc(S.muscles.charAt(0).toLowerCase() + S.muscles.slice(1)) + '.</p>' +
    (lvl.equip ? '<span class="chip">Precisa de: ' + esc(lvl.equip) + '</span>' : '') +
    '<h3>Como fazer</h3>' + cuesHtml +
    (lvl.note ? '<div class="note">' + esc(lvl.note) + '</div>' : '') +
    '<h3>Vídeo</h3>' + videoHtml(lvl.id, lvl.q + ' tutorial') +
    '<div class="links"><a href="' + ytUrl(lvl.q + ' tutorial') + '" target="_blank" rel="noopener">Mais vídeos no YouTube</a><a href="' + WIKI_BASE + S.wiki + '" target="_blank" rel="noopener">Guia no wiki do r/bodyweightfitness</a></div>' +
    '<h3>Escada de progressão</h3>' + (locked ? '<p class="muted small" style="margin-bottom:6px">Você já fez séries neste exercício hoje, então o nível só muda no próximo treino.</p>' : '<p class="muted small" style="margin-bottom:6px">Toque num degrau para mudar de nível. Serve para ajustar o ponto de partida.</p>') + ladHtml + pathHtml +
    (hist ? '<h3>Últimos registros</h3><ul class="bul">' + hist + '</ul>' : '') +
    '<div class="btn-row" style="margin-top:22px"><button class="btn" data-act="sheet-close">Fechar</button></div></div>';
  $('#sheet').innerHTML = html;
}

function confirmBox(title, text, buttons) {
  $('#sheet').innerHTML = '<div class="sheet-bg" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="grab"></div><h2>' + esc(title) + '</h2><p class="muted" style="margin-top:8px">' + esc(text) + '</p><div style="margin-top:18px;display:grid;gap:10px">' +
    buttons.map(function (b) { return '<button class="btn ' + (b.cls || '') + '" data-act="' + b.act + '">' + esc(b.label) + '</button>'; }).join('') + '</div></div>';
  sheetCtx = null;
}

/* ---------- Treino guiado ---------- */
function beep() {
  try {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    [0, 0.22].forEach(function (t) {
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t + 0.18);
      o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.2);
    });
  } catch (e) { }
  try { if (navigator.vibrate) navigator.vibrate(200); } catch (e) { }
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
  W.value = t; W.holdStart = null;
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
function tick() {
  if (!W) return;
  if (W.phase === 'rest') {
    var rem = (W.restEnd - Date.now()) / 1000, el = $('#restTime');
    if (el) el.textContent = fmtClock(rem);
    var bar = $('#restBar'); if (bar) bar.style.width = Math.max(0, Math.min(100, 100 * (1 - rem / W.restTotal))) + '%';
    if (rem <= 0) { beep(); var n = nextIndex(W.i + 1); if (n >= 0) goSet(n); else finishNow(); }
  } else if (W.phase === 'warmup' && W.warmEnd) {
    var wr = (W.warmEnd - Date.now()) / 1000, we = $('#warmTime');
    if (we) we.textContent = fmtClock(wr);
    if (wr <= 0) { beep(); H['w-warm-next'](); }
  } else if (W.phase === 'set' && W.holdStart) {
    var el2 = $('#holdTime'); if (el2) el2.textContent = Math.floor((Date.now() - W.holdStart) / 1000) + ' s';
  }
}
function warmGo(d) {
  var n = warmupItems(D, state).length, i = (W.warmI || 0) + d;
  W.warmEnd = 0;
  if (i >= n) { H['w-begin'](); return; }
  W.warmI = Math.max(0, i); saveDraft(); renderWorkout();
}
function groupLabel(step) {
  if (step.group === 'core') return 'Core';
  return 'Par ' + step.group.slice(1) + ' de 3';
}
function renderWorkout() {
  var ov = $('#overlay');
  if (!W) { ov.innerHTML = ''; return; }
  var top = function (label, pct) {
    return '<div class="w-top"><button class="w-x" data-act="w-exit" aria-label="Sair do treino">×</button><div class="w-prog" role="progressbar" aria-valuenow="' + Math.round(pct) + '" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso do treino"><i style="width:' + pct + '%"></i></div><span class="w-count">' + label + '</span></div>';
  };
  var body = '';
  if (W.phase === 'warmup') {
    var items = warmupItems(D, state), wi = Math.min(W.warmI || 0, items.length - 1), it = items[wi];
    var timerBox = '', main;
    if (it.secs && W.warmEnd) {
      timerBox = '<div class="big-stepper"><span class="val num" id="warmTime">' + fmtClock((W.warmEnd - Date.now()) / 1000) + '</span></div>';
      main = '<button class="btn tape" data-act="w-warm-next">Feito</button>';
    } else if (it.secs) {
      main = '<div class="btn-row" style="margin-top:0"><button class="btn ghost" data-act="w-warm-timer">Cronometrar ' + it.secs + ' s</button><button class="btn tape" data-act="w-warm-next">Feito</button></div>';
    } else {
      main = '<button class="btn tape" data-act="w-warm-next">Feito</button>';
    }
    body = top((wi + 1) + '/' + items.length, 100 * wi / items.length) + '<div class="w-body"><p class="w-group">Aquecimento · ' + (wi + 1) + ' de ' + items.length + '</p><h1 class="w-name">' + esc(it.name) + '</h1>' +
      '<div class="w-target sm"><span class="num">' + esc(it.n) + '</span><span>' + esc(it.unit) + '</span></div>' +
      '<ul class="how">' + it.how.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' + timerBox + main +
      (it.q ? '<div style="margin-top:16px">' + videoHtml('w.' + it.id, it.q) + '</div>' : '') +
      '<div class="w-links">' + (wi > 0 ? '<button data-act="w-warm-back">Voltar</button>' : '') + '<button data-act="w-warm-skip">Pular este</button><button data-act="w-begin">Pular aquecimento</button></div></div>';
  } else if (W.phase === 'set') {
    var st = curStep(), lvl = levelOfStep(st), S = SLOTS[st.slot], L = W.logged[st.slot], tg = L.targets[st.set - 1];
    var pct = 100 * W.i / W.steps.length;
    var pips = [1, 2, 3].map(function (n) { return '<i class="' + (n < st.set ? 'done' : n === st.set ? 'cur' : '') + '"></i>'; }).join('');
    var unit = lvl.kind === 'hold' ? 'segundos' : 'repetições';
    if (lvl.perSide) unit += ' por lado';
    var input;
    if (lvl.kind === 'hold') {
      input = (W.holdStart ? '<div class="big-stepper"><span class="val num" id="holdTime">0 s</span></div><button class="btn tape" data-act="w-hold-stop">Parar</button>' :
        '<div class="big-stepper"><button data-act="w-val" data-d="-5" aria-label="Menos 5 segundos">−</button><span class="val num" id="val">' + W.value + ' s</span><button data-act="w-val" data-d="5" aria-label="Mais 5 segundos">+</button></div>' +
        '<div class="btn-row" style="margin-top:0"><button class="btn ghost" data-act="w-hold-start">Cronometrar</button><button class="btn tape" data-act="w-log">Série feita</button></div>');
    } else {
      input = '<div class="big-stepper"><button data-act="w-val" data-d="-1" aria-label="Menos uma repetição">−</button><span class="val num" id="val">' + W.value + '</span><button data-act="w-val" data-d="1" aria-label="Mais uma repetição">+</button></div><button class="btn tape" data-act="w-log">Série feita</button>';
    }
    body = top((W.i + 1) + '/' + W.steps.length, pct) + '<div class="w-body"><p class="w-group">' + groupLabel(st) + ' · ' + esc(S.label) + '</p><h1 class="w-name">' + esc(lvl.name) + '</h1><p class="w-sub">Série ' + st.set + ' de 3</p><div class="sets" aria-hidden="true">' + pips + '</div>' +
      '<div class="w-target"><span class="num">' + tg + '</span><span>' + unit + ' de meta</span></div><p class="w-cue">' + esc(lvl.cues[0] || (S.general && S.general[0]) || '') + '</p>' + input +
      '<div class="w-links"><button data-act="w-info">Como fazer</button><button data-act="w-skip">Pular exercício</button><button data-act="w-finish-ask">Terminar treino</button></div></div>';
  } else if (W.phase === 'rest') {
    var st2 = curStep(), n = nextIndex(W.i + 1), pct2 = 100 * (W.i + 1) / W.steps.length;
    var nextHtml = '';
    if (n >= 0) {
      var ns = W.steps[n], nl = levelOfStep(ns), nt = W.logged[ns.slot].targets[ns.set - 1];
      nextHtml = '<div class="next-up"><span class="muted small">Em seguida</span><div class="n">' + esc(nl.name) + '</div><span class="muted">Série ' + ns.set + ' de 3 · meta ' + nt + (nl.kind === 'hold' ? ' s' : ' reps') + (nl.perSide ? ' por lado' : '') + '</span>' + '<div style="margin-top:12px">' + videoHtml(nl.id, nl.q + ' tutorial') + '</div>' + '</div>';
    }
    body = top((W.i + 1) + '/' + W.steps.length, pct2) + '<div class="w-body"><p class="w-group">Descanso</p><div class="rest-time num" id="restTime">' + fmtClock((W.restEnd - Date.now()) / 1000) + '</div><div class="rest-bar"><i id="restBar" style="width:0%"></i></div>' +
      '<div class="btn-row" style="margin-top:18px"><button class="btn ghost" data-act="w-rest-add">+ 15 s</button><button class="btn tape" data-act="w-rest-skip">Pular</button></div>' + nextHtml + '</div>';
  } else if (W.phase === 'summary') {
    var r = W.result, mins = Math.max(1, Math.round(r.session.durationSec / 60));
    var rows = SLOT_ORDER.filter(function (k) { return r.session.entries[k]; }).map(function (k) {
      var e = r.session.entries[k];
      return '<div class="res"><span>' + esc(e.name) + '</span><span class="r">' + esc(sessionSummaryText(e)) + '</span></div>';
    }).join('');
    var ups = r.promotions.map(function (p) { return '<div class="up-banner">Subiu de nível: ' + esc(p.from) + ' → ' + esc(p.to) + '. Na próxima vez, comece em 3 × 5.</div>'; }).join('');
    body = top('', 100) + '<div class="w-body"><h1 class="w-name">Treino concluído</h1><p class="w-sub">' + mins + ' min · ' + Object.keys(r.session.entries).length + ' exercícios</p>' + ups +
      '<div style="margin-top:14px;border-top:2px solid var(--ink)">' + (rows || '<p class="empty">Nenhuma série registrada.</p>') + '</div>' +
      '<div style="margin-top:auto;padding-top:22px"><button class="btn tape" data-act="w-close">Fechar</button></div></div>';
  }
  $('#overlay').innerHTML = '<div class="overlay" role="region" aria-label="Treino em andamento">' + body + '</div>';
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
function closeWorkout() { W = null; stopTick(); $('#overlay').innerHTML = ''; closeSheet(); render(); }

/* ---------- Eventos ---------- */
var H = {
  'tab': function (el) { tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  'start': function () { startWorkout(); },
  'resume': function () { resumeWorkout(); },
  'discard-draft': function () { clearDraft(); render(); },
  'open-ex': function (el) { openSheet(el.dataset.slot, 'home'); },
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
  'toggle-bar': function () { state.settings.hasBar = !state.settings.hasBar; persistProfile(); render(); toast(state.settings.hasBar ? 'Pull-up incluída no treino' : 'Pull-up fora do treino'); },
  'rest-main': function (el) { state.settings.restMain = Math.max(30, Math.min(300, state.settings.restMain + 15 * +el.dataset.d)); persistProfile(); $('#rm').textContent = state.settings.restMain + ' s'; },
  'rest-core': function (el) { state.settings.restCore = Math.max(30, Math.min(300, state.settings.restCore + 15 * +el.dataset.d)); persistProfile(); $('#rc').textContent = state.settings.restCore + ' s'; },
  'copy-bk': function () {
    var ta = $('#bk'); ta.focus(); ta.select();
    var done = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(ta.value).then(function () { toast('Backup copiado'); }, function () { toast('Selecionei o texto, copie manualmente'); }); done = true; } } catch (e) { }
    if (!done) toast('Selecionei o texto, copie manualmente');
  },
  'import-bk': function () {
    try {
      var o = JSON.parse($('#bk').value);
      if (!o || !o.sessions || !o.levels) throw new Error('formato');
      var before = state.sessions.length;
      mergeLoaded(o, null);
      persistProfile(); state.sessions.forEach(function (s) { persistSession(s); });
      render(); toast((state.sessions.length - before) + ' treinos importados');
    } catch (e) { toast('Backup inválido. Cole o texto completo.'); }
  },
  'reset-ask': function () { confirmBox('Apagar tudo?', 'Os treinos registrados e os níveis voltam ao começo. Isso não dá para desfazer.', [{ label: 'Apagar tudo', act: 'reset-do' }, { label: 'Cancelar', act: 'sheet-close', cls: 'ghost' }]); },
  'reset-do': function () {
    var keepBar = state.settings.hasBar; state = defaultState(D); state.settings.hasBar = keepBar;
    persistProfile(); if (dbRefs) { /* sessões antigas ficam na conta, mas não aparecem mais após limpar: apaga uma a uma */ dbRefs.sessions.get().then(function (sn) { sn.docs.forEach(function (d) { enqueue(function () { return dbRefs.sessions.doc(d.id).delete(); }); }); }, function () { }); }
    closeSheet(); render(); toast('Tudo apagado');
  },
  'bar': function (el) {
    var box = el.closest('.chart-box'); if (!box) return;
    box.querySelectorAll('.bar').forEach(function (b) { b.classList.remove('sel'); });
    el.classList.add('sel'); box.querySelector('.chart-cap').textContent = el.getAttribute('data-cap');
  },
  /* treino */
  'w-exit': function () {
    var any = Object.keys(W.logged).some(function (k) { return W.logged[k].sets.length; });
    confirmBox('Sair do treino?', any ? 'Você pode guardar o que já fez ou continuar depois de onde parou.' : 'Você ainda não registrou nenhuma série.', [
      { label: 'Continuar treino', act: 'sheet-close', cls: 'tape' }].concat(any ? [{ label: 'Guardar e terminar', act: 'w-finish', cls: 'ghost' }] : []).concat([
      { label: any ? 'Sair e continuar depois' : 'Sair do treino', act: 'w-leave', cls: 'ghost' }, { label: 'Descartar treino', act: 'w-discard', cls: 'ghost' }]));
  },
  'w-leave': function () { saveDraft(); W = null; stopTick(); $('#overlay').innerHTML = ''; closeSheet(); render(); },
  'w-discard': function () { clearDraft(); W = null; stopTick(); $('#overlay').innerHTML = ''; closeSheet(); render(); },
  'w-finish-ask': function () { H['w-exit'](); },
  'w-finish': function () { closeSheet(); finishNow(); },
  'w-warm-next': function () { var it = warmupItems(D, state)[W.warmI || 0]; if (it) W.warm[it.id] = true; warmGo(1); },
  'w-warm-skip': function () { warmGo(1); },
  'w-warm-back': function () { warmGo(-1); },
  'w-warm-timer': function () { var it = warmupItems(D, state)[W.warmI || 0]; W.warmEnd = Date.now() + it.secs * 1000; saveDraft(); renderWorkout(); },
  'w-begin': function () { var n = nextIndex(0); if (n < 0) { finishNow(); return; } goSet(n); },
  'w-val': function (el) {
    var st = curStep(), lvl = levelOfStep(st), d = +el.dataset.d;
    W.value = Math.max(0, W.value + d); saveDraft();
    $('#val').textContent = W.value + (lvl.kind === 'hold' ? ' s' : '');
  },
  'w-hold-start': function () { W.holdStart = Date.now(); renderWorkout(); },
  'w-hold-stop': function () { W.value = Math.max(1, Math.round((Date.now() - W.holdStart) / 1000)); W.holdStart = null; saveDraft(); renderWorkout(); },
  'w-log': function () { logSet(); },
  'w-rest-add': function () { W.restEnd += 15000; W.restTotal += 15; saveDraft(); },
  'w-rest-skip': function () { var n = nextIndex(W.i + 1); if (n >= 0) goSet(n); else finishNow(); },
  'play-vid': function (el) { playVideo(el); },
  'w-info': function () { openSheet(curStep().slot, 'workout'); },
  'w-skip': function () {
    var st = curStep(); W.skipped.push(st.slot);
    var n = nextIndex(W.i + 1); if (n >= 0) { toast(SLOTS[st.slot].label + ' pulado hoje'); goSet(n); } else finishNow();
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
