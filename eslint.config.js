import js from '@eslint/js';
import ts from 'typescript-eslint';

/** Node 22 runtime global'leri — TS dosyalarında @types/node sağlar, .mjs'de burada. */
const nodeGlobals = {
  console: 'readonly',
  process: 'readonly',
  fetch: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  AbortSignal: 'readonly',
  AbortController: 'readonly',
  performance: 'readonly',
  crypto: 'readonly',
  Headers: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  WebSocket: 'readonly',
};

export default ts.config(
  { ignores: ['**/dist/**', '**/build/**', '**/.svelte-kit/**', '**/node_modules/**', '**/*.svelte', 'infra/prod/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    languageOptions: { globals: nodeGlobals },
    rules: {
      // `any` yasak — D2: tip güvenliği pazarlık konusu değil.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      eqeqeq: ['error', 'always'],
      // Yapılandırılmış log için pino; console yalnız uyarı/hata.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // CLI script'leri ve migration/seed runner'ları: console ÇIKTI ARACIDIR.
    files: ['**/scripts/**', '**/db/migrate.ts', '**/db/seed*.ts', 'tools/**', 'infra/blueprints/**/checks/**'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['packages/ui/src/lib/theme-init.js'],
    languageOptions: {
      globals: { localStorage: 'readonly', matchMedia: 'readonly', document: 'readonly' },
    },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }] },
  },
);
