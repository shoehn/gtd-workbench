// pnpm db:seed — replace the SQLite store's contents with seed.json (schema kept).
// pnpm db:reset — delete the database file, migrate from scratch and seed.
// The file is DATABASE_FILE (default data/gtd.db), the same one `STORE=sqlite` opens.
import { rmSync } from 'node:fs';
import seed from '../src/lib/store/seed.json';
import { openDatabase, replaceAll } from '../src/lib/store/sqlite';
import type { State } from '../src/lib/store/types';

const file = process.env.DATABASE_FILE ?? 'data/gtd.db';
const command = process.argv[2];

if (command === 'reset') {
  for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });
  openDatabase(file, seed as State); // a new file starts from the seed
  console.log(`db:reset — ${file} recreated and seeded`);
} else if (command === 'seed') {
  const { db, state } = openDatabase(file, seed as State);
  replaceAll(db, state, seed as State);
  console.log(`db:seed — ${file} now holds seed.json`);
} else {
  console.error('usage: tsx scripts/db.ts seed|reset');
  process.exit(1);
}
