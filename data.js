/* Dados dos exercícios: escadas de progressão da Recommended Routine (r/bodyweightfitness).
   Dicas de execução parafraseadas das páginas do wiki; músculos são informação geral. */

var WIKI_BASE = 'https://www.reddit.com/r/bodyweightfitness/wiki/exercises/';
function ytUrl(q) { return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q); }

/* Faixas de repetições: força 5 a 8, core 8 a 12, holds 10 a 30 s. */
function mk(id, name, kind, opts) {
  opts = opts || {};
  var core = !!opts.core;
  var lvl = {
    id: id, name: name, kind: kind,
    perSide: !!opts.perSide,
    cues: opts.cues || [],
    equip: opts.equip || '',
    note: opts.note || '',
    q: opts.q || name,
    lo: kind === 'hold' ? 10 : (core ? 8 : 5),
    hi: kind === 'hold' ? 30 : (core ? 12 : 8),
    step: kind === 'hold' ? 5 : 1
  };
  return lvl;
}

var SLOTS = {
  pullup: { label: 'Pull-up', group: 'Puxar na vertical', wiki: 'pullup', needsBar: true,
    muscles: 'Dorsais, bíceps e parte alta das costas',
    general: ['Corpo levemente em hollow, pernas estendidas e sem cruzar', 'Braços retos embaixo, sem pensar em mais nada', 'Busque o peito na barra em cima, subindo aos poucos nessa amplitude', 'Pescoço neutro, sem esticar o queixo para passar da barra'] },
  squat: { label: 'Agachamento', group: 'Pernas', wiki: 'squat',
    muscles: 'Quadríceps e glúteos',
    general: ['Fique em pé por completo no topo', 'Desça o máximo que conseguir, de preferência com o quadril abaixo dos joelhos', 'Pressione o dedão e o calcanhar no chão', 'Joelhos alinhados com os pés e empurrando para fora'] },
  dip: { label: 'Dip', group: 'Empurrar na vertical', wiki: 'dip',
    muscles: 'Peito (parte de baixo), tríceps e ombros',
    general: ['Corpo reto ou levemente em hollow, sem dobrar no quadril', 'Braços travados e escápulas para baixo no topo', 'Desça o máximo que conseguir', 'Cotovelos junto ao corpo'] },
  hinge: { label: 'Hinge', group: 'Posterior de coxa', wiki: 'hinge',
    muscles: 'Posteriores da coxa, glúteos e lombar',
    general: [] },
  row: { label: 'Remada', group: 'Puxar na horizontal', wiki: 'row',
    muscles: 'Meio das costas, dorsais, parte de trás dos ombros e bíceps',
    general: ['Corpo reto', 'Cotovelos junto ao corpo', 'Braços esticados embaixo', 'Peito até a barra ou a borda, com as escápulas juntas em cima', 'Não encolha os ombros'] },
  pushup: { label: 'Flexão', group: 'Empurrar na horizontal', wiki: 'pushup',
    muscles: 'Peito, ombros (frente) e tríceps, com o core firme',
    general: ['Corpo em linha reta da cabeça aos pés, sem deixar o quadril cair', 'Braços travados e escápulas afastadas no topo', 'Desça até o peito quase tocar o chão', 'Cotovelos junto ao corpo e ombros longe das orelhas'] },
  core_ae: { label: 'Core: anti-extensão', group: 'Core', wiki: 'core', core: true,
    muscles: 'Abdômen (reto abdominal e transverso)', general: [] },
  core_ar: { label: 'Core: anti-rotação', group: 'Core', wiki: 'core', core: true,
    muscles: 'Oblíquos e estabilizadores do quadril', general: [] },
  core_ex: { label: 'Core: extensão', group: 'Core', wiki: 'core', core: true,
    muscles: 'Lombar e glúteos', general: [] }
};

/* Cada slot tem caminhos (paths) com a sua escada de níveis. O primeiro é o caminho padrão. */
var LADDERS = {
  pushup: { defaultPath: 'main', paths: { main: { label: 'Escada principal', levels: [
    mk('pushup.vert', 'Flexão vertical', 'reps', { q: 'wall push up', cues: ['Em pé, de frente para a parede, mãos apoiadas nela', 'Faça a flexão mantendo o corpo reto'] }),
    mk('pushup.inc', 'Flexão inclinada', 'reps', { q: 'incline push up', cues: ['Mãos num apoio firme, como mesa ou banco', 'Quanto mais baixo o apoio, mais difícil'] }),
    mk('pushup.full', 'Flexão completa', 'reps', { q: 'push up form' }),
    mk('pushup.dia', 'Flexão diamante', 'reps', { q: 'diamond push up', cues: ['Mãos juntas, polegares e indicadores se tocando', 'Se incomodar, comece com as mãos um pouco mais juntas que o normal e feche aos poucos'] }),
    mk('pushup.ppu', 'Pseudo planche push-up', 'reps', { q: 'pseudo planche push up', cues: ['Mãos viradas para os lados, ombros à frente das mãos', 'Mantenha a inclinação durante toda a repetição e afaste as escápulas no topo', 'Mais inclinação deixa mais difícil, menos deixa mais fácil'] })
  ] } } },

  row: { defaultPath: 'main', paths: { main: { label: 'Escada principal', levels: [
    mk('row.vert', 'Remada vertical', 'reps', { q: 'vertical row bodyweight', cues: ['A mesma remada, com o corpo na vertical'] }),
    mk('row.inc', 'Remada inclinada', 'reps', { q: 'incline inverted row', cues: ['Corpo entre vertical e horizontal', 'Mais perto da horizontal, mais difícil', 'Na mesa: pés mais afastados deixam mais difícil'] }),
    mk('row.hor', 'Remada horizontal', 'reps', { q: 'inverted row', cues: ['Corpo reto e paralelo ao chão', 'Pernas dobradas deixam a remada mais fácil'] }),
    mk('row.wide', 'Remada aberta', 'reps', { q: 'wide grip inverted row', cues: ['Pegada com cerca de 1,5 vez a largura dos ombros', 'Aqui os cotovelos podem abrir'] }),
    mk('row.wt', 'Remada invertida com peso', 'reps', { q: 'weighted inverted row', equip: 'colete de peso ou anilha', cues: ['Peso no peito ou na barriga, ou colete de peso'] })
  ] } } },

  squat: { defaultPath: 'main', paths: { main: { label: 'Escada principal', levels: [
    mk('squat.assist', 'Agachamento assistido', 'reps', { q: 'assisted squat', cues: ['Segure em algo à frente e use as mãos para ajudar', 'Reduza a ajuda com o tempo'] }),
    mk('squat.sq', 'Agachamento', 'reps', { q: 'bodyweight squat form' }),
    mk('squat.split', 'Agachamento dividido', 'reps', { perSide: true, q: 'split squat', cues: ['Fique na posição de afundo durante toda a série', 'Diferente do avanço, os pés não voltam a se juntar'] }),
    mk('squat.bulg', 'Agachamento búlgaro', 'reps', { perSide: true, q: 'bulgarian split squat', equip: 'banco ou cadeira', cues: ['Pé de trás apoiado num banco', 'Para evoluir, eleve também o pé da frente'] }),
    mk('squat.shr1', 'Shrimp squat iniciante', 'reps', { perSide: true, q: 'beginner shrimp squat', cues: ['O joelho e a ponta do pé de trás saem do chão juntos'] }),
    mk('squat.shr2', 'Shrimp squat intermediário', 'reps', { perSide: true, q: 'intermediate shrimp squat', cues: ['O joelho toca o chão, a ponta do pé não'] }),
    mk('squat.shr3', 'Shrimp squat avançado', 'reps', { perSide: true, q: 'advanced shrimp squat', cues: ['Segure o calcanhar ao descer', 'Só o joelho toca o chão'] }),
    mk('squat.shrw', 'Shrimp squat com peso', 'reps', { perSide: true, q: 'weighted shrimp squat', equip: 'peso', cues: ['O mesmo shrimp avançado, com carga extra'] })
  ] } } },

  pullup: { defaultPath: 'main', paths: { main: { label: 'Escada principal', levels: [
    mk('pullup.scap', 'Scapular pulls', 'reps', { q: 'scapular pull ups', equip: 'barra', cues: ['Cotovelos retos o tempo todo', 'Segure de 3 a 5 s em cima, apertando as escápulas, e solte até a pendurada com controle', 'Se não sair da pendurada, use faixa ou os pés para ajudar'] }),
    mk('pullup.arch', 'Arch hangs', 'hold', { q: 'arch hang pull up progression', equip: 'barra', cues: ['Cotovelos retos, segure pelo tempo da meta', 'Evolua em direção a 90 graus no ombro'] }),
    mk('pullup.neg', 'Pull-ups negativas', 'reps', { q: 'negative pull ups', equip: 'barra', cues: ['Pule até o topo e desça o mais devagar que conseguir, até esticar os braços', 'Vá subindo até descidas de 10 s'] }),
    mk('pullup.pu', 'Pull-up', 'reps', { q: 'pull up form', equip: 'barra' }),
    mk('pullup.wt', 'Pull-up com peso', 'reps', { q: 'weighted pull up', equip: 'barra e peso', cues: ['A mesma pull-up, com carga extra'] })
  ] } } },

  dip: { defaultPath: 'main', paths: { main: { label: 'Escada principal', levels: [
    mk('dip.hold', 'Sustentação nas paralelas', 'hold', { q: 'parallel bar support hold', equip: 'duas cadeiras firmes ou quina de balcão', note: 'A página do dip pede chegar a 1 minuto. A regra geral do guia é 30 s, que é a meta usada aqui.', cues: ['Braços retos, corpo firme e escápulas para baixo, segurando pelo tempo da meta', 'Sem paralelas: duas cadeiras firmes (ponha peso nos assentos), a quina de um balcão em 90 graus ou duas mesas da mesma altura', 'Se não sustentar, ajude com os pés ou uma faixa'] }),
    mk('dip.neg', 'Dips negativos', 'reps', { q: 'negative dips', equip: 'duas cadeiras firmes ou quina de balcão', cues: ['Só a descida, com controle', 'Suba pulando ou com um apoio', 'Vá subindo até descidas de 10 s'] }),
    mk('dip.pb', 'Dips nas paralelas', 'reps', { q: 'parallel bar dips', equip: 'paralelas ou apoio firme' }),
    mk('dip.wt', 'Dips com peso', 'reps', { q: 'weighted dips', equip: 'paralelas e peso', cues: ['O mesmo dip, com carga extra'] })
  ] } } },

  hinge: { defaultPath: 'main', paths: { main: { label: 'Escada principal', levels: [
    mk('hinge.rdl', 'Levantamento terra romeno', 'reps', { q: 'bodyweight romanian deadlift', cues: ['Em pé, contraia o glúteo para deixar a lombar neutra', 'Leve o quadril para trás e incline o tronco para não cair', 'Mãos no peito e na barriga para ter feedback, ou soltas ao lado', 'O movimento é suave'] }),
    mk('hinge.sldl', 'Terra unilateral', 'reps', { perSide: true, q: 'single leg romanian deadlift', cues: ['Sem equilíbrio, apoie uma mão numa superfície ou afaste as pernas'] }),
    mk('hinge.nn', 'Nordic curl negativo com faixa', 'reps', { q: 'banded nordic curl negative', equip: 'faixa elástica e apoio para os pés', cues: ['Prenda os pés sob algo firme, a cerca de um punho do tornozelo', 'Contraia o glúteo para manter o quadril estendido', 'Desça devagar, sem dobrar no quadril', 'No fim, faça uma pequena flexão para voltar'] }),
    mk('hinge.nc', 'Nordic curl com faixa', 'reps', { q: 'banded nordic curl', equip: 'faixa elástica e apoio para os pés', cues: ['Mesma montagem, agora subindo com a força dos posteriores', 'Quando ficar fácil, repita as duas etapas com faixas mais fracas'] }),
    mk('hinge.nord', 'Nordic curl', 'reps', { q: 'nordic hamstring curl', equip: 'apoio para os pés', cues: ['Contraia o glúteo, desça e suba sem dobrar no quadril'] })
  ] } } },

  core_ae: { defaultPath: 'plank', paths: {
    plank: { label: 'Prancha e rollouts', levels: [
      mk('core_ae.plank', 'Prancha', 'hold', { core: true, q: 'plank form', cues: ['Faça só a prancha, sem os outros exercícios do vídeo', 'Quando chegar a 30 s, passe para os rollouts'] }),
      mk('core_ae.roll', 'Ring ab rollouts', 'reps', { core: true, q: 'ring ab rollout', equip: 'argolas', cues: ['Cotovelos retos', 'Fique em hollow: costelas para baixo e quadril encaixado', 'Mãos tão perto quanto a mobilidade do ombro permitir', 'Argolas mais altas facilitam, pés elevados dificultam'] })
    ] },
    hlr: { label: 'Elevação de pernas na barra', levels: [
      mk('core_ae.tuck', 'Tucked hanging leg raises', 'reps', { core: true, q: 'tucked hanging leg raise', equip: 'barra', cues: ['Pendurada passiva, em hollow', 'Pés à frente do quadril e pausa de 1 s em cima e embaixo para não balançar'] }),
      mk('core_ae.pike', 'Pike hanging leg raises negativo', 'reps', { core: true, q: 'hanging leg raise negative', equip: 'barra', cues: ['Suba com as pernas dobradas, estique e desça com as pernas retas'] }),
      mk('core_ae.hlr', 'Straight hanging leg raises', 'reps', { core: true, q: 'straight leg hanging leg raise', equip: 'barra', cues: ['Pernas retas, sem balançar'] })
    ] }
  } },

  core_ar: { defaultPath: 'cph', paths: {
    cph: { label: 'Copenhagen plank', levels: [
      mk('core_ar.cph1', 'Copenhagen com joelho, assistido', 'hold', { core: true, perSide: true, q: 'assisted knee copenhagen plank', equip: 'banco, sofá ou cadeira firme', cues: ['A perna de baixo dá o mínimo de ajuda necessário', 'Não deixe o quadril cair', 'Pode apoiar na mão em vez do cotovelo'] }),
      mk('core_ar.cph2', 'Copenhagen com joelho', 'hold', { core: true, perSide: true, q: 'knee copenhagen plank', equip: 'banco, sofá ou cadeira firme', cues: ['Não deixe o quadril cair', 'Pode apoiar na mão em vez do cotovelo'] }),
      mk('core_ar.cph3', 'Copenhagen assistido', 'hold', { core: true, perSide: true, q: 'assisted copenhagen plank', equip: 'banco, sofá ou cadeira firme', cues: ['A perna de baixo dá o mínimo de ajuda necessário', 'Não deixe o quadril cair'] }),
      mk('core_ar.cph4', 'Copenhagen plank', 'hold', { core: true, perSide: true, q: 'copenhagen plank', equip: 'banco, sofá ou cadeira firme', cues: ['Não deixe o quadril cair'] }),
      mk('core_ar.cph5', 'Copenhagen com movimento', 'reps', { core: true, perSide: true, q: 'copenhagen plank with movement', equip: 'banco, sofá ou cadeira firme', cues: ['Leve a perna livre ao peito e volte com controle', 'Não deixe o quadril cair'] })
    ] },
    pallof: { label: 'Pallof press', levels: [
      mk('core_ar.pal', 'Pallof press com faixa', 'reps', { core: true, perSide: true, q: 'banded pallof press', equip: 'faixa elástica', cues: ['Com controle, e uma pausa curta com os braços estendidos'] }),
      mk('core_ar.ringpal', 'Ring Pallof press', 'reps', { core: true, perSide: true, q: 'ring pallof press', equip: 'argolas', cues: ['Afastar as pernas facilita, juntar dificulta'] })
    ] }
  } },

  core_ex: { defaultPath: 'arch', paths: {
    arch: { label: 'Arch no chão', levels: [
      mk('core_ex.raise', 'Arch raises', 'reps', { core: true, q: 'arch raises', cues: ['Só as elevações da parte de baixo do corpo, como no vídeo do guia'] }),
      mk('core_ex.hold', 'Arch body hold', 'hold', { core: true, q: 'arch body hold', cues: ['Agora vale o resto do vídeo do guia'] }),
      mk('core_ex.rock', 'Arch body rocks', 'reps', { core: true, q: 'arch body rocks', cues: ['Balance com controle, mantendo o arco'] })
    ] },
    rev: { label: 'Reverse hyperextension', levels: [
      mk('core_ex.rev', 'Reverse hyperextension', 'reps', { core: true, q: 'reverse hyperextension bodyweight', equip: 'banco ou balcão', cues: ['Mantenha o bumbum contraído'] })
    ] }
  } }
};

/* Ordem do treino: três pares de força e o trio de core. */
var PAIRS = [['pullup', 'squat'], ['dip', 'hinge'], ['row', 'pushup']];
var CORE = ['core_ae', 'core_ar', 'core_ex'];
var SLOT_ORDER = [].concat.apply([], PAIRS).concat(CORE);

/* Nível inicial de cada exercício (índice na escada padrão), conforme o plano. */
var START_LEVELS = { pushup: 3, row: 1, squat: 1, pullup: 0, dip: 0, hinge: 0, core_ae: 0, core_ar: 0, core_ex: 0 };

/* Aquecimento do guia, mais os extras que entram conforme você sobe de nível.
   n e unit formam a meta ("5 a 10" + "repetições"); secs liga um cronômetro; how são os passos. */
var WARMUP = [
  { id: 'shoulder', name: 'Yuri\'s shoulder band warmup', n: '5 a 10', unit: 'repetições', q: 'Yuri shoulder band warmup',
    how: ['Segure a faixa, ou uma camiseta, com os braços retos e as mãos bem afastadas', 'Leve a faixa por cima da cabeça até atrás do corpo e volte pelo mesmo caminho', 'Devagar e com os cotovelos retos. Se travar, abra mais as mãos'] },
  { id: 'sky', name: 'Squat sky reaches', n: '5 a 10', unit: 'repetições', q: 'squat sky reaches',
    how: ['Desça num agachamento fundo, com os pés na largura dos ombros', 'Embaixo, estique os braços para cima e abra o peito', 'Volte em pé e repita'] },
  { id: 'wrist', name: 'GMB wrist prep', n: '10 ou mais', unit: 'de cada movimento', q: 'GMB wrist prep',
    how: ['Apoie as mãos no chão e faça movimentos suaves de punho', 'Para frente e para trás, para os lados e em círculos', 'Sem forçar. Pare se doer'] },
  { id: 'deadbug', name: 'Deadbugs', n: '30', unit: 'segundos', secs: 30, q: 'dead bug exercise',
    how: ['Deitado, braços estendidos para cima e joelhos dobrados no ar', 'Lombar colada no chão o tempo todo', 'Estique um braço e a perna do lado oposto, volte e troque'] }
];
/* Extras: aparecem quando o exercício chega ao índice indicado. prevLevel usa o nível abaixo do atual. */
var WARMUP_EXTRAS = [
  { id: 'x_arch', slot: 'pullup', minIdx: 2, name: 'Arch hangs', n: '10', unit: 'repetições', q: 'arch hang pull up progression',
    how: ['Pendurado na barra, com os cotovelos retos', 'Afaste o peito da barra e junte as escápulas, formando um arco', 'Solte e repita sem dobrar os cotovelos'] },
  { id: 'x_sup', slot: 'dip', minIdx: 1, name: 'Sustentação nas paralelas', n: '30', unit: 'segundos', secs: 30, q: 'parallel bar support hold',
    how: ['Braços retos e escápulas para baixo', 'Corpo firme, sem encolher os ombros', 'Se precisar, ajude com os pés no chão'] },
  { id: 'x_squat', slot: 'squat', minIdx: 3, prevLevel: true, name: 'Agachamento do nível anterior', n: '10', unit: 'repetições',
    how: ['É o exercício de agachamento do nível abaixo do de hoje', 'Faça com técnica limpa, sem pressa'] },
  { id: 'x_hinge', slot: 'hinge', minIdx: 3, prevLevel: true, name: 'Terra do nível anterior', n: '10', unit: 'repetições',
    how: ['É o exercício de hinge do nível abaixo do de hoje', 'Faça com técnica limpa, sem pressa'] }
];

if (typeof module !== 'undefined') module.exports = { SLOTS: SLOTS, LADDERS: LADDERS, PAIRS: PAIRS, CORE: CORE, SLOT_ORDER: SLOT_ORDER, START_LEVELS: START_LEVELS, WARMUP: WARMUP, WARMUP_EXTRAS: WARMUP_EXTRAS, ytUrl: ytUrl, WIKI_BASE: WIKI_BASE };
