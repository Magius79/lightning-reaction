import { getDb } from './database';

const MIGRATIONS: Array<{ id: string; sql: string }> = [
  {
    id: '001_init',
    sql: `
CREATE TABLE IF NOT EXISTS migrations (
  id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  pubkey TEXT PRIMARY KEY,
  display_name TEXT,
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  total_winnings INTEGER DEFAULT 0,
  avg_reaction_time REAL,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS room_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  pubkey TEXT NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  payment_hash TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(room_id, pubkey),
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (pubkey) REFERENCES players(pubkey) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  room_id TEXT,
  winner_pubkey TEXT,
  prize_pool INTEGER,
  num_players INTEGER,
  start_time INTEGER,
  end_time INTEGER,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS game_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT,
  pubkey TEXT,
  tap_time INTEGER,
  reaction_time INTEGER,
  paid INTEGER,
  payment_hash TEXT,
  FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pubkey TEXT,
  type TEXT,
  amount INTEGER,
  payment_hash TEXT,
  status TEXT,
  created_at INTEGER,
  UNIQUE(type, payment_hash)
);

CREATE INDEX IF NOT EXISTS idx_transactions_pubkey ON transactions(pubkey);
CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(payment_hash);
CREATE INDEX IF NOT EXISTS idx_room_players_room ON room_players(room_id);
CREATE INDEX IF NOT EXISTS idx_players_winnings ON players(total_winnings DESC);
`
  },
  {
    id: '002_used_payment_hashes',
    sql: `
CREATE TABLE IF NOT EXISTS used_payment_hashes (
  payment_hash TEXT PRIMARY KEY,
  pubkey TEXT NOT NULL,
  used_at INTEGER NOT NULL
);
`
  }
];

export function migrate() {
  const db = getDb();

  // Ensure migrations table exists before we query it.
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    id TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  );`);

  db.exec('BEGIN');
  try {
    const applied = new Set(
      db.prepare('SELECT id FROM migrations').all().map((r: any) => r.id)
    );

    const insert = db.prepare(
      'INSERT INTO migrations (id, applied_at) VALUES (@id, @applied_at)'
    );

    for (const m of MIGRATIONS) {
      if (applied.has(m.id)) continue;
      db.exec(m.sql);
      insert.run({ id: m.id, applied_at: Date.now() });
    }

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
