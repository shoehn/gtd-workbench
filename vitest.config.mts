import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The api suite runs twice: against the memory store and against SQLite (in memory).
export default defineConfig({
  // The `@/` alias of tsconfig, for route handlers under test.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    projects: [
      { extends: true, test: { name: 'memory', env: { STORE: 'memory' } } },
      { extends: true, test: { name: 'sqlite', env: { STORE: 'sqlite', DATABASE_FILE: ':memory:' } } },
    ],
  },
});
