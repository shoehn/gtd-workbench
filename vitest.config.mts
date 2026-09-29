import { defineConfig } from 'vitest/config';

// The api suite runs twice: against the memory store and against SQLite (in memory).
export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: 'memory', env: { STORE: 'memory' } } },
      { extends: true, test: { name: 'sqlite', env: { STORE: 'sqlite', DATABASE_FILE: ':memory:' } } },
    ],
  },
});
