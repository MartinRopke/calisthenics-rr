/* Exercise data: progression ladders of the Recommended Routine (r/bodyweightfitness).
   Execution cues paraphrased from the wiki pages; muscles are general information. */

export var WIKI_BASE = 'https://www.reddit.com/r/bodyweightfitness/wiki/exercises/';
export function ytUrl(q) { return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q); }

/* Rep ranges: strength 5 to 8, core 8 to 12, holds 10 to 30 s. */
function mk(id, name, kind, opts) {
  opts = opts || {};
  var core = !!opts.core;
  var lvl = {
    id: id, name: name, kind: kind,
    perSide: !!opts.perSide,
    cues: opts.cues || [],
    equip: opts.equip || '',
    setup: opts.setup || [],
    std: opts.std || 'Standard',
    note: opts.note || '',
    q: opts.q || name,
    lo: kind === 'hold' ? 10 : (core ? 8 : 5),
    hi: kind === 'hold' ? 30 : (core ? 12 : 8),
    step: kind === 'hold' ? 5 : 1
  };
  return lvl;
}

export var SLOTS = {
  pullup: { label: 'Pull-up', group: 'Vertical pull', wiki: 'pullup', needsBar: true,
    muscles: 'Lats, biceps and upper back',
    general: ['Slightly hollow body, legs straight and uncrossed', 'Arms fully straight at the bottom, with no extra tricks', 'Aim to bring your chest to the bar at the top, building up to that range over time', 'Neutral neck, without stretching your chin to clear the bar'] },
  squat: { label: 'Squat', group: 'Legs', wiki: 'squat',
    muscles: 'Quads and glutes',
    general: ['Stand up fully at the top', 'Go as deep as you can, ideally with the hips below the knees', 'Press the big toe and the heel into the floor', 'Knees in line with the feet and pushing out'] },
  dip: { label: 'Dip', group: 'Vertical push', wiki: 'dip', needsDip: true,
    muscles: 'Lower chest, triceps and shoulders',
    general: ['Straight or slightly hollow body, no bending at the hips', 'Lock the arms and push the shoulder blades down at the top', 'Go as deep as you can', 'Elbows close to the body'] },
  hinge: { label: 'Hinge', group: 'Hamstrings', wiki: 'hinge',
    muscles: 'Hamstrings, glutes and lower back',
    general: [] },
  row: { label: 'Row', group: 'Horizontal pull', wiki: 'row',
    muscles: 'Mid back, lats, rear shoulders and biceps',
    general: ['Straight body', 'Elbows close to the body', 'Arms fully straight at the bottom', 'Chest to the bar or the edge, with the shoulder blades together at the top', 'Do not shrug the shoulders'] },
  pushup: { label: 'Push-up', group: 'Horizontal push', wiki: 'pushup',
    muscles: 'Chest, front shoulders and triceps, with a tight core',
    general: ['Straight line from head to feet, without letting the hips sag', 'Arms locked and shoulder blades spread apart at the top', 'Lower until the chest almost touches the floor', 'Elbows close to the body and shoulders away from the ears'] },
  core_ae: { label: 'Core: anti-extension', group: 'Core', wiki: 'core', core: true,
    muscles: 'Abs (rectus abdominis and transverse abdominis)', general: [] },
  core_ar: { label: 'Core: anti-rotation', group: 'Core', wiki: 'core', core: true,
    muscles: 'Obliques and hip stabilizers', general: [] },
  core_ex: { label: 'Core: extension', group: 'Core', wiki: 'core', core: true,
    muscles: 'Lower back and glutes', general: [] }
};

/* Each slot has paths, each with its own ladder of levels. The first is the default path.
   equip: what the exercise needs, with the options. Empty when nothing is needed. */
var EQ_ROW = 'low bar, rings or a sturdy table';
var EQ_BAR = 'pull-up bar, monkey bars or rings';
var EQ_DIP = 'parallel bars, two sturdy chairs or a counter corner';
/* Equipment options: setup lists the alternatives besides the default (std). With k, uses a video from videos.js; without k, the app shows a YouTube search with q. */
var ROW_SETUP = [{ k: 'eq.row.table', label: 'Table' }, { k: 'eq.row.sheet', label: 'Bedsheet and door' }];
var BAR_SETUP = [{ label: 'Rings', q: 'rings' }];
var DIP_SETUP = [{ label: 'Two chairs', q: 'two chairs' }, { label: 'Counter corner', q: 'counter corner' }];
var EQ_COP = 'bench, couch, counter or sturdy chair';
export var LADDERS = {
  pushup: { defaultPath: 'main', paths: { main: { label: 'Main ladder', levels: [
    mk('pushup.vert', 'Wall push-up', 'reps', { q: 'wall push up', cues: ['Stand facing a wall with your hands on it', 'Do the push-up keeping the body straight'] }),
    mk('pushup.inc', 'Incline push-up', 'reps', { q: 'incline push up', equip: 'table, bench or another sturdy surface', cues: ['Hands on a sturdy surface, like a table or bench', 'The lower the surface, the harder it gets'] }),
    mk('pushup.full', 'Full push-up', 'reps', { q: 'push up form' }),
    mk('pushup.dia', 'Diamond push-up', 'reps', { q: 'diamond push up', cues: ['Hands together, thumbs and index fingers touching', 'If it hurts, start with the hands slightly closer than normal and bring them together gradually'] }),
    mk('pushup.ppu', 'Pseudo planche push-up', 'reps', { q: 'pseudo planche push up', cues: ['Hands turned out to the sides, shoulders ahead of the hands', 'Keep the lean through the whole rep and spread the shoulder blades at the top', 'More lean is harder, less lean is easier'] })
  ] } } },

  row: { defaultPath: 'main', paths: { main: { label: 'Main ladder', levels: [
    mk('row.vert', 'Vertical row', 'reps', { q: 'vertical row bodyweight', equip: EQ_ROW, setup: ROW_SETUP, std: 'Low bar or rings', cues: ['The same row, with the body upright'] }),
    mk('row.inc', 'Incline row', 'reps', { q: 'incline inverted row', equip: EQ_ROW, setup: ROW_SETUP, std: 'Low bar or rings', cues: ['Body between vertical and horizontal', 'The closer to horizontal, the harder', 'On a table: feet farther away make it harder'] }),
    mk('row.hor', 'Horizontal row', 'reps', { q: 'inverted row', equip: EQ_ROW, setup: ROW_SETUP, std: 'Low bar or rings', cues: ['Straight body, parallel to the floor', 'Bent legs make the row easier'] }),
    mk('row.wide', 'Wide row', 'reps', { q: 'wide grip inverted row', equip: EQ_ROW, setup: ROW_SETUP, std: 'Low bar or rings', cues: ['Grip about 1.5 times shoulder width', 'Here the elbows can flare out'] }),
    mk('row.wt', 'Weighted row', 'reps', { q: 'weighted inverted row', equip: EQ_ROW + ', plus a weight vest or plate', cues: ['Weight on the chest or belly, or a weight vest'] })
  ] } } },

  squat: { defaultPath: 'main', paths: { main: { label: 'Main ladder', levels: [
    mk('squat.assist', 'Assisted squat', 'reps', { q: 'assisted squat', cues: ['Hold something in front of you and use your hands to help', 'Reduce the help over time'] }),
    mk('squat.sq', 'Squat', 'reps', { q: 'bodyweight squat form' }),
    mk('squat.split', 'Split squat', 'reps', { perSide: true, q: 'split squat', cues: ['Stay in the lunge position for the whole set', 'Unlike a lunge, the feet never come back together'] }),
    mk('squat.bulg', 'Bulgarian split squat', 'reps', { perSide: true, q: 'bulgarian split squat', equip: 'bench or chair', cues: ['Back foot resting on a bench', 'To progress, also raise the front foot'] }),
    mk('squat.shr1', 'Beginner shrimp squat', 'reps', { perSide: true, q: 'beginner shrimp squat', cues: ['The back knee and the back toes leave the floor together'] }),
    mk('squat.shr2', 'Intermediate shrimp squat', 'reps', { perSide: true, q: 'intermediate shrimp squat', cues: ['The knee touches the floor, the toes do not'] }),
    mk('squat.shr3', 'Advanced shrimp squat', 'reps', { perSide: true, q: 'advanced shrimp squat', cues: ['Hold the heel as you go down', 'Only the knee touches the floor'] }),
    mk('squat.shrw', 'Weighted shrimp squat', 'reps', { perSide: true, q: 'weighted shrimp squat', equip: 'weights', cues: ['The same advanced shrimp, with extra load'] })
  ] } } },

  pullup: { defaultPath: 'main', paths: { main: { label: 'Main ladder', levels: [
    mk('pullup.scap', 'Scapular pulls', 'reps', { q: 'scapular pull ups', equip: EQ_BAR, setup: BAR_SETUP, std: 'Pull-up bar', cues: ['Elbows straight the whole time', 'Hold 3 to 5 s at the top, squeezing the shoulder blades, then lower back to the hang with control', 'If you cannot leave the hang, use a band or your feet to help'] }),
    mk('pullup.arch', 'Arch hangs', 'hold', { q: 'arch hang pull up progression', equip: EQ_BAR, setup: BAR_SETUP, std: 'Pull-up bar', cues: ['Elbows straight, hold for the target time', 'Work toward 90 degrees at the shoulder'] }),
    mk('pullup.neg', 'Negative pull-ups', 'reps', { q: 'negative pull ups', equip: EQ_BAR, setup: BAR_SETUP, std: 'Pull-up bar', cues: ['Jump to the top and lower as slowly as you can, until your arms are straight', 'Work up to 10 s descents'] }),
    mk('pullup.pu', 'Pull-up', 'reps', { q: 'pull up form', equip: EQ_BAR, setup: BAR_SETUP, std: 'Pull-up bar' }),
    mk('pullup.wt', 'Weighted pull-up', 'reps', { q: 'weighted pull up', equip: EQ_BAR + ', plus weights', cues: ['The same pull-up, with extra load'] })
  ] } } },

  dip: { defaultPath: 'main', paths: { main: { label: 'Main ladder', levels: [
    mk('dip.hold', 'Parallel bar support hold', 'hold', { q: 'parallel bar support hold', equip: EQ_DIP, setup: DIP_SETUP, std: 'Parallel bars', note: 'The dip page asks you to work up to 1 minute. The guide\'s general rule is 30 s, which is the target used here.', cues: ['Straight arms, tight body and shoulder blades down, holding for the target time', 'No parallel bars: two sturdy chairs (put some weight on the seats), a counter corner at 90 degrees or two tables of the same height', 'If you cannot hold it, help with your feet or a band'] }),
    mk('dip.neg', 'Negative dips', 'reps', { q: 'negative dips', equip: EQ_DIP, setup: DIP_SETUP, std: 'Parallel bars', cues: ['Only the way down, with control', 'Get back up by jumping or with a support', 'Work up to 10 s descents'] }),
    mk('dip.pb', 'Parallel bar dips', 'reps', { q: 'parallel bar dips', equip: EQ_DIP, setup: DIP_SETUP, std: 'Parallel bars' }),
    mk('dip.wt', 'Weighted dips', 'reps', { q: 'weighted dips', equip: 'parallel bars and weights', cues: ['The same dip, with extra load'] })
  ] } } },

  hinge: { defaultPath: 'main', paths: { main: { label: 'Main ladder', levels: [
    mk('hinge.rdl', 'Romanian deadlift', 'reps', { q: 'bodyweight romanian deadlift', cues: ['Standing, squeeze the glutes to keep the lower back neutral', 'Send the hips back and lean the torso forward so you do not fall over', 'Hands on the chest and belly for feedback, or hanging at your sides', 'The movement is smooth'] }),
    mk('hinge.sldl', 'Single leg deadlift', 'reps', { perSide: true, q: 'single leg romanian deadlift', cues: ['If you lack balance, rest a hand on a surface or widen your stance'] }),
    mk('hinge.nn', 'Banded nordic curl negative', 'reps', { q: 'banded nordic curl negative', equip: 'resistance band and something sturdy to anchor your feet', cues: ['Anchor your feet under something sturdy, about a fist away from the ankle', 'Squeeze the glutes to keep the hips extended', 'Lower slowly, without piking at the hips', 'At the bottom, do a small push-up to get back up'] }),
    mk('hinge.nc', 'Banded nordic curl', 'reps', { q: 'banded nordic curl', equip: 'resistance band and something sturdy to anchor your feet', cues: ['Same setup, now coming up with the strength of the hamstrings', 'When it gets easy, repeat both steps with weaker bands'] }),
    mk('hinge.nord', 'Nordic curl', 'reps', { q: 'nordic hamstring curl', equip: 'something sturdy to anchor your feet', cues: ['Squeeze the glutes, go down and come up without piking at the hips'] })
  ] } } },

  core_ae: { defaultPath: 'plank', paths: {
    plank: { label: 'Plank and rollouts', levels: [
      mk('core_ae.plank', 'Plank', 'hold', { core: true, q: 'plank form', cues: ['Do only the plank, not the other drills in the video', 'When you reach 30 s, move on to the rollouts'] }),
      mk('core_ae.roll', 'Ring ab rollouts', 'reps', { core: true, q: 'ring ab rollout', equip: 'gymnastic rings', cues: ['Elbows straight', 'Stay hollow: ribs down and hips tucked', 'Hands as close as your shoulder mobility allows', 'Higher rings make it easier, elevated feet make it harder'] })
    ] },
    hlr: { label: 'Hanging leg raises', levels: [
      mk('core_ae.tuck', 'Tucked hanging leg raises', 'reps', { core: true, q: 'tucked hanging leg raise', equip: 'bar or rings', cues: ['Passive hang, hollow body', 'Feet in front of the hips and a 1 s pause at the top and bottom to avoid swinging'] }),
      mk('core_ae.pike', 'Pike hanging leg raises negative', 'reps', { core: true, q: 'hanging leg raise negative', equip: 'bar or rings', cues: ['Lift with the legs bent, straighten them and lower with straight legs'] }),
      mk('core_ae.hlr', 'Straight hanging leg raises', 'reps', { core: true, q: 'straight leg hanging leg raise', equip: 'bar or rings', cues: ['Straight legs, no swinging'] })
    ] }
  } },

  core_ar: { defaultPath: 'cph', paths: {
    cph: { label: 'Copenhagen plank', levels: [
      mk('core_ar.cph1', 'Assisted knee Copenhagen plank', 'hold', { core: true, perSide: true, q: 'assisted knee copenhagen plank', equip: EQ_COP, setup: [{ k: 'eq.cop', label: 'Couch or chair' }, { k: 'eq.cph_knee', label: 'Nothing: knee side plank', q: 'side plank knee down' }], std: 'Bench', cues: ['The bottom leg gives the minimum help you need', 'Do not let the hips sag', 'You can rest on your hand instead of your elbow', 'Nothing to rest the top leg on? Do a side plank with the bottom knee down. This swap is not from the guide'] }),
      mk('core_ar.cph2', 'Knee Copenhagen plank', 'hold', { core: true, perSide: true, q: 'knee copenhagen plank', equip: EQ_COP, setup: [{ k: 'eq.cop', label: 'Couch or chair' }], std: 'Bench', cues: ['Do not let the hips sag', 'You can rest on your hand instead of your elbow'] }),
      mk('core_ar.cph3', 'Assisted Copenhagen plank', 'hold', { core: true, perSide: true, q: 'assisted copenhagen plank', equip: EQ_COP, setup: [{ k: 'eq.cop', label: 'Couch or chair' }], std: 'Bench', cues: ['The bottom leg gives the minimum help you need', 'Do not let the hips sag'] }),
      mk('core_ar.cph4', 'Copenhagen plank', 'hold', { core: true, perSide: true, q: 'copenhagen plank', equip: EQ_COP, setup: [{ k: 'eq.cop', label: 'Couch or chair' }], std: 'Bench', cues: ['Do not let the hips sag'] }),
      mk('core_ar.cph5', 'Copenhagen plank with movement', 'reps', { core: true, perSide: true, q: 'copenhagen plank with movement', equip: EQ_COP, setup: [{ k: 'eq.cop', label: 'Couch or chair' }], std: 'Bench', cues: ['Bring the free leg to the chest and return with control', 'Do not let the hips sag'] })
    ] },
    pallof: { label: 'Pallof press', levels: [
      mk('core_ar.pal', 'Banded Pallof press', 'reps', { core: true, perSide: true, q: 'banded pallof press', equip: 'resistance band', cues: ['Under control, with a short pause with the arms extended'] }),
      mk('core_ar.ringpal', 'Ring Pallof press', 'reps', { core: true, perSide: true, q: 'ring pallof press', equip: 'gymnastic rings', cues: ['A wider stance makes it easier, a narrow one makes it harder'] })
    ] }
  } },

  core_ex: { defaultPath: 'arch', paths: {
    arch: { label: 'Arch on the floor', levels: [
      mk('core_ex.raise', 'Arch raises', 'reps', { core: true, q: 'arch raises', cues: ['Only the lower-body raises, as in the guide\'s video'] }),
      mk('core_ex.hold', 'Arch body hold', 'hold', { core: true, q: 'arch body hold', cues: ['Now the rest of the guide\'s video applies'] }),
      mk('core_ex.rock', 'Arch body rocks', 'reps', { core: true, q: 'arch body rocks', cues: ['Rock with control, keeping the arch'] })
    ] },
    rev: { label: 'Reverse hyperextension', levels: [
      mk('core_ex.rev', 'Reverse hyperextension', 'reps', { core: true, q: 'reverse hyperextension bodyweight', equip: 'bench or counter', cues: ['Keep the glutes squeezed'] })
    ] }
  } }
};

/* Workout order: three strength pairs and the core trio. */
export var PAIRS = [['pullup', 'squat'], ['dip', 'hinge'], ['row', 'pushup']];
export var CORE = ['core_ae', 'core_ar', 'core_ex'];
export var SLOT_ORDER = [].concat.apply([], PAIRS).concat(CORE);

/* Starting level of each exercise (index in the default ladder), per the plan. */
export var START_LEVELS = { pushup: 3, row: 1, squat: 1, pullup: 0, dip: 0, hinge: 0, core_ae: 0, core_ar: 0, core_ex: 0 };

/* Warmup from the guide, plus the extras that come in as you level up.
   n and unit form the target ("5 to 10" + "reps"); secs turns on a timer; how are the steps. */
export var WARMUP = [
  { id: 'shoulder', name: 'Yuri\'s shoulder band warmup', n: '5 to 10', unit: 'reps', equip: 'resistance band or a t-shirt', q: 'Yuri shoulder band warmup',
    how: ['Hold the band, or a t-shirt, with straight arms and hands far apart', 'Take the band over your head to behind your body and come back the same way', 'Slowly and with straight elbows. If it gets stuck, widen your hands'],
    /* Swaps without equipment, outside the guide. The app shows them as "not from the guide". */
    alts: [
      { id: 'shoulder_wall', label: 'Wall slides', name: 'Wall slides', n: '5 to 10', unit: 'reps', q: 'wall slide shoulder mobility',
        how: ['Stand with your back, head and forearms against a wall, elbows bent', 'Slide the arms up the wall as far as you can, keeping the ribs down and the forearms touching', 'Slide back down slowly and repeat'] },
      { id: 'shoulder_scap', label: 'Scapular push-ups', name: 'Scapular push-ups', n: '5 to 10', unit: 'reps', q: 'scapular push ups',
        how: ['In a push-up position with locked arms', 'Let the chest sink between the shoulder blades, then push the floor away and spread the shoulder blades apart', 'Elbows stay straight the whole time. Only the shoulder blades move'] }
    ] },
  { id: 'sky', name: 'Squat sky reaches', n: '5', unit: 'reps per side', q: 'squat sky reaches',
    how: ['Drop into a deep squat, feet shoulder width apart', 'At the bottom, reach one arm up and open the chest', 'Bring it back, reach with the other arm, and keep alternating. Stand up when you finish'] },
  { id: 'wrist', name: 'GMB wrist prep', n: '10 or more', unit: 'of each movement', q: 'GMB wrist prep',
    how: ['Place your hands on the floor and do smooth wrist movements', 'Forward and back, side to side and in circles', 'Do not force it. Stop if it hurts'] },
  { id: 'deadbug', name: 'Deadbugs', n: '30', unit: 'seconds', secs: 30, q: 'dead bug exercise',
    how: ['Lying down, arms straight up and knees bent in the air', 'Keep your lower back on the floor the whole time', 'Extend one arm and the opposite leg, come back and switch'] }
];
/* Extras: appear when the exercise reaches the given index. prevLevel uses the level below the current one. */
export var WARMUP_EXTRAS = [
  { id: 'x_arch', slot: 'pullup', minIdx: 2, name: 'Arch hangs', n: '10', unit: 'reps', equip: EQ_BAR, q: 'arch hang pull up progression',
    how: ['Hanging from the bar with straight elbows', 'Push your chest away from the bar and bring the shoulder blades together, forming an arch', 'Release and repeat without bending the elbows'] },
  { id: 'x_sup', slot: 'dip', minIdx: 1, name: 'Support hold', n: '30', unit: 'seconds', secs: 30, equip: EQ_DIP, q: 'parallel bar support hold',
    how: ['Straight arms and shoulder blades down', 'Tight body, without shrugging the shoulders', 'If you need to, help with your feet on the floor'] },
  { id: 'x_squat', slot: 'squat', minIdx: 3, prevLevel: true, name: 'Easier squat progression', n: '10', unit: 'reps',
    how: ['This is the squat exercise one level below today\'s', 'Do it with clean technique, without rushing'] },
  { id: 'x_hinge', slot: 'hinge', minIdx: 3, prevLevel: true, name: 'Easier hinge progression', n: '10', unit: 'reps',
    how: ['This is the hinge exercise one level below today\'s', 'Do it with clean technique, without rushing'] }
];
