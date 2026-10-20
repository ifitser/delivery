import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export type Db = Database.Database;
export function migrate(db: Db): void {
  const dir = resolve(process.cwd(), 'migrations');
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const applied = db.prepare('SELECT name FROM _migrations WHERE name = ?');
  const insert = db.prepare('INSERT INTO _migrations (name) VALUES (?)');
  for (const file of readdirSync(dir).filter(n => n.endsWith('.sql')).sort()) {
    if (applied.get(file)) continue;
    db.transaction(() => {
      db.exec(readFileSync(resolve(dir, file), 'utf8'));
      insert.run(file);
    })();
  }
}
export function openDatabase(path: string): Db {
  const full = path === ':memory:' ? path : resolve(process.cwd(), path);
  if (full !== ':memory:') mkdirSync(dirname(full), { recursive: true });
  const db = new Database(full);
  db.pragma('foreign_keys = ON');
  if (full !== ':memory:') db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}
