import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Lint rules for the web app, mirroring `apps/api/eslint.config.mjs` so both
 * halves of the repo are checked the same way.
 *
 * `next lint` is deprecated in Next 15 and, with no config in the repo, it
 * dropped into an interactive setup prompt and failed in CI-like shells — so
 * `pnpm lint` never actually checked anything. The flat config below makes it
 * non-interactive and real.
 */
export default [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // TypeScript resolves identifiers itself and already reports what is
      // genuinely undefined, so `no-undef` only adds false positives here:
      // every type-only name (`React.FC`, `RequestInit`) reads as undefined.
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-unused-vars': 'off',
      // The rules that catch real bugs in a React app: stale closures and
      // conditional hooks. The compiler has no say in either.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  prettier,
];
