import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './env';

let db: Database.Database;

export function getDb() {
  if (db) return db;

  const dbPath = env.DB_PATH;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  // Better safety defaults for concurrent reads/writes.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}
