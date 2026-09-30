// pnpm db:seed — replace the SQLite store's contents with the demo data (schema kept).
// pnpm db:reset — delete the database file, migrate from scratch and load the demo data.
// The file is DATABASE_FILE (default data/gtd.db), the same one `STORE=sqlite` opens.
import { rmSync } from 'node:fs';
import { demoSeed as seed } from '../src/lib/store/seed';
import { openDatabase, replaceAll } from '../src/lib/store/sqlite';

const file = process.env.DATABASE_FILE ?? 'data/gtd.db';
const command = process.argv[2];

if (command === 'reset') {
  for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });
  openDatabase(file, seed); // a new file starts from the seed given
  console.log(`db:reset — ${file} recreated and seeded`);
} else if (command === 'seed') {
  const { db, state } = openDatabase(file, seed);
  replaceAll(db, state, seed);
  console.log(`db:seed — ${file} now holds the demo data`);
} else {
  console.error('usage: tsx scripts/db.ts seed|reset');
  process.exit(1);
}
