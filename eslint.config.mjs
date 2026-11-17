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
  { ignores: ['.claude/', 'node_modules/', 'reference/', 'shots/', 'data/', 'docs/'] },
  js.configs.recommended,
  { rules, languageOptions: { sourceType: 'module' } },
  {
    // Browser modules. `claude` is the optional Claude artifacts runtime.
    files: ['src/**/*.js'],
    languageOptions: { globals: { ...globals.browser, claude: 'readonly' } },
  },
  {
    files: ['**/*.test.js', 'server.mjs', 'scripts/*.mjs', 'eslint.config.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // e2e scripts run in Node, but their page.evaluate callbacks run in the browser.
    files: ['e2e/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  prettier,
];
