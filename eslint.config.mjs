// Root ESLint flat config for the ai-merchant-services monorepo.
//
// Conventions enforced here:
//   - TypeScript strict + recommended rules across the workspace.
//   - React + React Hooks rules for TSX files (settings pick up the version
//     the consuming app declares).
//   - `import/no-default-export` for library-style source under `packages/**`
//     and `apps/*/src/**`, with overrides for Next.js App Router files that
//     are required to default-export (`page.tsx`, `layout.tsx`, `route.ts`,
//     etc.) and for framework config files at the app root.
//
// Consumers extend this config from their own `eslint.config.mjs` if needed;
// most workspaces will not need one because the root file matches
// `**/*.{ts,tsx,js,jsx,mjs,cjs}`.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.turbo/**',
      'config/aic/outputs/**',
      'pnpm-lock.yaml',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      import: importPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Named exports only for library sources and app source modules.
    files: ['packages/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
    rules: {
      'import/no-default-export': 'error',
    },
  },
  {
    // Next.js App Router files must default-export their component/handler.
    // Framework config files also expect a default export.
    files: [
      'apps/*/src/app/**/page.{ts,tsx}',
      'apps/*/src/app/**/layout.{ts,tsx}',
      'apps/*/src/app/**/loading.{ts,tsx}',
      'apps/*/src/app/**/error.{ts,tsx}',
      'apps/*/src/app/**/not-found.{ts,tsx}',
      'apps/*/src/app/**/template.{ts,tsx}',
      'apps/*/src/app/**/default.{ts,tsx}',
      'apps/*/src/middleware.{ts,tsx}',
      'apps/*/next.config.{js,mjs,ts}',
      'apps/*/tailwind.config.{js,mjs,ts}',
      'apps/*/postcss.config.{js,mjs,ts}',
    ],
    rules: {
      'import/no-default-export': 'off',
    },
  },
];
