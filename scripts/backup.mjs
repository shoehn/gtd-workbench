// pnpm db:backup — an online copy of the SQLite store (better-sqlite3's backup API, safe while
// the app writes) to <BACKUP_DIR>/gtd-YYYYMMDD-HHMM.db, keeping the newest BACKUP_KEEP (14).
// Plain Node on purpose: it runs in the slim runtime image, where there is no tsx or pnpm.
import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const file = process.env.DATABASE_FILE ?? 'data/gtd.db';
const dir = process.env.BACKUP_DIR ?? path.join(path.dirname(file), 'backups');
const keep = Number(process.env.BACKUP_KEEP ?? 14);

const pad = (n) => String(n).padStart(2, '0');
const now = new Date(); // local time: TZ decides the stamp
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const target = path.join(dir, `gtd-${stamp}.db`);

mkdirSync(dir, { recursive: true });
const db = new Database(file, { fileMustExist: true });
try {
  await db.backup(target);
} finally {
  db.close();
}

const old = readdirSync(dir)
  .filter((f) => /^gtd-\d{8}-\d{4}\.db$/.test(f))
  .sort()
  .reverse()
  .slice(keep);
for (const f of old) rmSync(path.join(dir, f));

console.log(`${now.toISOString()} info  backup: ${target}${old.length ? ` (removed ${old.length} old)` : ''}`);
