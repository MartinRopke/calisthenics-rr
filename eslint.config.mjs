import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

const rules = {
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: ['error', 'smart'],
  // vars local: funcoes e variaveis de topo sao globais usados por outros arquivos
  'no-unused-vars': ['warn', { vars: 'local' }],
};

// Globais compartilhados entre os scripts do navegador (ordem do build).
const dataNames = ['WIKI_BASE','ytUrl','SLOTS','LADDERS','PAIRS','CORE','SLOT_ORDER','START_LEVELS','WARMUP','WARMUP_EXTRAS','VIDEOS'];
const logicNames = ['isoDate','parseISO','dayDiff','weekStartISO','defaultState','ladderOf','currentLevel','isActive','lastEntry','clamp','targetsFor','prescribe','mastered','buildSteps','restSeconds','warmupItems','finishWorkout','weeklyCounts','seriesFor','scheduleHint','sessionSummaryText'];
const toGlobals = (names) => Object.fromEntries(names.map((n) => [n, 'readonly']));

export default [
  { ignores: ['index.html', 'node_modules/', 'reference/', 'shots/', 'data/', 'docs/'] },
  js.configs.recommended,
  { rules },
  {
    files: ['data.js', 'videos.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, module: 'readonly' } },
  },
  {
    files: ['logic.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, ...toGlobals(dataNames), module: 'readonly' },
    },
  },
  {
    files: ['app.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, ...toGlobals([...dataNames, ...logicNames]), claude: 'readonly' },
    },
  },
  {
    files: ['test.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
  prettier,
];
