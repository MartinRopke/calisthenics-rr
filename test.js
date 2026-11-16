const D = require('./data.js'); const L = require('./logic.js');
const assert = require('assert');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ', n); } catch (e) { console.log('FAIL', n, '\n   ', e.message); process.exitCode = 1; } };
const mkW = (state, sets) => { // sets: {slot:[reps..]}
  const logged = {}; Object.keys(sets).forEach(s => { const p = L.prescribe(D, state, s); logged[s] = { levelId: p.level.id, sets: sets[s], targets: p.targets }; });
  return { startedAt: 1, logged, warmDone: 4 };
};

t('estado inicial bate com o plano', () => {
  const s = L.defaultState(D);
  assert.equal(L.currentLevel(D, s, 'pushup').name, 'Diamond push-up');
  assert.equal(L.currentLevel(D, s, 'row').name, 'Incline row');
  assert.equal(L.currentLevel(D, s, 'squat').name, 'Squat');
  assert.equal(L.currentLevel(D, s, 'pullup').name, 'Scapular pulls');
  assert.equal(L.currentLevel(D, s, 'dip').name, 'Parallel bar support hold');
  assert.equal(L.currentLevel(D, s, 'core_ar').name, 'Assisted knee Copenhagen plank');
});
t('primeira vez: metas no mínimo', () => {
  const s = L.defaultState(D);
  assert.deepEqual(L.prescribe(D, s, 'pushup').targets, [5, 5, 5]);
  assert.deepEqual(L.prescribe(D, s, 'dip').targets, [10, 10, 10]);
  assert.deepEqual(L.prescribe(D, s, 'core_ae').targets, [10, 10, 10]);
  assert.deepEqual(L.prescribe(D, s, 'core_ex').targets, [8, 8, 8]);
});
t('bateu tudo: sobe uma repetição por série', () => {
  const s = L.defaultState(D);
  L.finishWorkout(D, s, mkW(s, { pushup: [5, 5, 5] }), '2026-11-16', 3000);
  assert.deepEqual(L.prescribe(D, s, 'pushup').targets, [6, 6, 6]);
});
t('séries desiguais sobem cada uma', () => {
  const s = L.defaultState(D);
  L.finishWorkout(D, s, mkW(s, { pushup: [7, 6, 5] }), '2026-11-16', 3000);
  assert.deepEqual(L.prescribe(D, s, 'pushup').targets, [8, 7, 6]);
});
t('não bateu a meta: repete o que fez', () => {
  const s = L.defaultState(D);
  L.finishWorkout(D, s, mkW(s, { pushup: [5, 5, 5] }), '2026-11-16', 0);
  L.finishWorkout(D, s, mkW(s, { pushup: [6, 5, 4] }), '2026-11-18', 0); // metas 6,6,6, fez 6,5,4
  assert.deepEqual(L.prescribe(D, s, 'pushup').targets, [6, 5, 5]); // 4 vira 5 (mínimo)
});
t('nunca passa de 8', () => {
  const s = L.defaultState(D);
  L.finishWorkout(D, s, mkW(s, { row: [7, 7, 7] }), '2026-11-16', 0);
  assert.deepEqual(L.prescribe(D, s, 'row').targets, [8, 8, 8]);
});
t('3x8 sobe de nível e volta para 3x5', () => {
  const s = L.defaultState(D);
  const r = L.finishWorkout(D, s, mkW(s, { pushup: [8, 8, 8] }), '2026-11-16', 0);
  assert.equal(r.promotions.length, 1);
  assert.equal(L.currentLevel(D, s, 'pushup').name, 'Pseudo planche push-up');
  assert.deepEqual(L.prescribe(D, s, 'pushup').targets, [5, 5, 5]);
  assert.equal(r.session.entries.pushup.promotedTo, 'Pseudo planche push-up');
});
t('último degrau não sobe mais', () => {
  const s = L.defaultState(D); s.levels.pushup.idx = 4;
  const r = L.finishWorkout(D, s, mkW(s, { pushup: [8, 8, 8] }), '2026-11-16', 0);
  assert.equal(r.promotions.length, 0); assert.equal(s.levels.pushup.idx, 4);
});
t('hold: 10 -> 15 -> ... e sobe aos 30 s', () => {
  const s = L.defaultState(D);
  L.finishWorkout(D, s, mkW(s, { dip: [10, 10, 10] }), '2026-11-16', 0);
  assert.deepEqual(L.prescribe(D, s, 'dip').targets, [15, 15, 15]);
  L.finishWorkout(D, s, mkW(s, { dip: [15, 15, 15] }), '2026-11-18', 0);
  L.finishWorkout(D, s, mkW(s, { dip: [20, 20, 20] }), '2026-11-20', 0);
  L.finishWorkout(D, s, mkW(s, { dip: [25, 25, 25] }), '2026-11-23', 0);
  assert.deepEqual(L.prescribe(D, s, 'dip').targets, [30, 30, 30]);
  const r = L.finishWorkout(D, s, mkW(s, { dip: [30, 30, 30] }), '2026-11-25', 0);
  assert.equal(L.currentLevel(D, s, 'dip').name, 'Negative dips'); assert.equal(r.promotions.length, 1);
});
t('core usa faixa 8 a 12', () => {
  const s = L.defaultState(D); s.levels.core_ex.idx = 0;
  L.finishWorkout(D, s, mkW(s, { core_ex: [12, 12, 12] }), '2026-11-16', 0);
  assert.equal(L.currentLevel(D, s, 'core_ex').name, 'Arch body hold');
});
t('série faltando: não sobe de nível e não conta como limpa', () => {
  const s = L.defaultState(D);
  const r = L.finishWorkout(D, s, mkW(s, { pushup: [8, 8] }), '2026-11-16', 0);
  assert.equal(r.promotions.length, 0);
  assert.deepEqual(L.prescribe(D, s, 'pushup').targets, [8, 8, 5]);
});
t('exercício sem séries não gera entrada', () => {
  const s = L.defaultState(D);
  const r = L.finishWorkout(D, s, mkW(s, { pushup: [], row: [5, 5, 5] }), '2026-11-16', 0);
  assert.ok(!r.session.entries.pushup); assert.ok(r.session.entries.row);
});
t('passos: sem barra pula a pull-up; 3 séries alternadas', () => {
  const s = L.defaultState(D);
  const st = L.buildSteps(D, s);
  assert.ok(!st.some(x => x.slot === 'pullup'));
  assert.equal(st.length, 3 * 2 + 3 * 2 + 3 * 2 + 3 * 3 - 3); // 8 exercícios... pares: 1+2+2 = 5 ex, core 3
});
t('passos com barra: ordem p1 A,B,A,B,A,B', () => {
  const s = L.defaultState(D); s.settings.hasBar = true;
  const st = L.buildSteps(D, s);
  assert.deepEqual(st.slice(0, 6).map(x => x.slot + x.set), ['pullup1', 'squat1', 'pullup2', 'squat2', 'pullup3', 'squat3']);
  assert.equal(st.length, 6 * 3 + 9);
  assert.equal(st[st.length - 1].slot, 'core_ex');
});
t('descanso: 90 força, 60 core', () => {
  const s = L.defaultState(D);
  assert.equal(L.restSeconds(D, s, 'row'), 90); assert.equal(L.restSeconds(D, s, 'core_ae'), 60);
});
t('aquecimento ganha extras conforme o nível', () => {
  const s = L.defaultState(D);
  assert.equal(L.warmupItems(D, s).length, 4);
  s.settings.hasBar = true; s.levels.pullup.idx = 2; s.levels.dip.idx = 1;
  assert.equal(L.warmupItems(D, s).length, 6);
});
t('contagem semanal começa na segunda', () => {
  const sess = [{ date: '2026-11-09' }, { date: '2026-11-11' }, { date: '2026-11-13' }, { date: '2026-11-16' }];
  const w = L.weeklyCounts(sess, 3, '2026-11-18');
  assert.deepEqual(w.map(x => x.n), [0, 3, 1]); assert.equal(w[2].start, '2026-11-16');
});
t('dica do dia', () => {
  assert.equal(L.scheduleHint([], '2026-11-16').kind, 'go'); // segunda
  assert.equal(L.scheduleHint([], '2026-11-17').kind, 'off'); // terça
  assert.equal(L.scheduleHint([{ date: '2026-11-16' }], '2026-11-17').kind, 'rest');
  assert.equal(L.scheduleHint([{ date: '2026-11-16' }], '2026-11-16').kind, 'done');
});
t('todo nível tem dica e faixa válida', () => {
  Object.keys(D.LADDERS).forEach(s => Object.values(D.LADDERS[s].paths).forEach(p => p.levels.forEach(l => {
    assert.ok(l.cues.length > 0 || D.SLOTS[s].general.length > 0, l.id); assert.ok(l.hi > l.lo, l.id);
  })));
});
t('todo nível e item de aquecimento tem vídeo válido', () => {
  const V = new Function(require('fs').readFileSync('./videos.js', 'utf8') + '; return VIDEOS;')();
  Object.keys(D.LADDERS).forEach(s => Object.values(D.LADDERS[s].paths).forEach(p => p.levels.forEach(l => {
    assert.ok(V[l.id], 'sem vídeo: ' + l.id);
  })));
  D.WARMUP.concat(D.WARMUP_EXTRAS.filter(x => x.q)).forEach(w => assert.ok(V['w.' + w.id], 'sem vídeo: w.' + w.id));
  Object.keys(D.LADDERS).forEach(s => Object.values(D.LADDERS[s].paths).forEach(p => p.levels.forEach(l => l.setup.forEach(o => assert.ok(o.label && (!o.k || V[o.k]), 'sem vídeo de montagem: ' + o.k)))));
  Object.keys(V).forEach(k => assert.ok(/^[A-Za-z0-9_-]{11}$/.test(V[k].id) && V[k].t && V[k].c, k));
});
t('aquecimento: extras aparecem com o nível e o anterior vem do nível certo', () => {
  const s = L.defaultState(D); s.settings.hasBar = true;
  s.levels.squat.idx = 3; s.levels.hinge.idx = 3; s.levels.pullup.idx = 2; s.levels.dip.idx = 1;
  const it = L.warmupItems(D, s), names = it.map(x => x.name);
  assert.equal(it.length, 8);
  assert.ok(names.includes('Split squat') && names.includes('Banded nordic curl negative'));
  assert.ok(it.every(x => x.how && x.how.length && x.n && x.unit));
});
console.log('\n' + pass + ' testes ok');
