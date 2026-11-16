import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

const rules = {
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: ['error', 'smart'],
  'no-unused-vars': 'warn',
};

export default [
  { ignores: ['node_modules/', 'reference/', 'shots/', 'data/', 'docs/'] },
  js.configs.recommended,
  { rules, languageOptions: { sourceType: 'module' } },
  {
    // Browser modules: app, data, logic and videos. `claude` is the optional Claude artifacts runtime.
    files: ['app.js', 'data.js', 'logic.js', 'videos.js'],
    languageOptions: { globals: { ...globals.browser, claude: 'readonly' } },
  },
  {
    files: ['test.js', 'server.mjs', 'scripts/*.mjs', 'eslint.config.mjs'],
    languageOptions: { globals: globals.node },
  },
  prettier,
];
