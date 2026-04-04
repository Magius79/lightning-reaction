import { getDb } from './database';

// ---------- inline bech32 decoder (npub only) ----------
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Decode(str: string): Buffer {
  const lower = str.toLowerCase();
  const pos = lower.lastIndexOf('1');
  if (pos < 1) throw new Error('Invalid bech32: no separator');
  const data: number[] = [];
  for (let i = pos + 1; i < lower.length; i++) {
    const v = BECH32_CHARSET.indexOf(lower[i]);
    if (v === -1) throw new Error('Invalid bech32 character');
    data.push(v);
  }
  // Drop the 6-char checksum
  const values = data.slice(0, data.length - 6);
  // Convert 5-bit groups to 8-bit (skip the first value which is the witness version / type byte)
  const result: number[] = [];
  let acc = 0;
  let bits = 0;
  for (let i = 1; i < values.length; i++) {
    acc = (acc << 5) | values[i];
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      result.push((acc >> bits) & 0xff);
    }
  }
  return Buffer.from(result);
}

function npubToHex(npub: string): string {
  const decoded = bech32Decode(npub);
  if (decoded.length !== 32) throw new Error(`Expected 32 bytes, got ${decoded.length}`);
  return decoded.toString('hex');
}

// ---------- programmatic (data) migrations ----------

function migrateNpubToHex() {
  const db = getDb();
  const applied = db.prepare('SELECT id FROM migrations WHERE id = ?').get('003_npub_to_hex');
  if (applied) return;

  const npubRows: any[] = db.prepare("SELECT * FROM players WHERE pubkey LIKE 'npub1%'").all();
  if (npubRows.length === 0) {
    // Nothing to migrate, but mark as done
    db.prepare('INSERT INTO migrations (id, applied_at) VALUES (?, ?)').run('003_npub_to_hex', Date.now());
    return;
  }

  db.exec('BEGIN');
  try {
    for (const row of npubRows) {
      let hex: string;
      try {
        hex = npubToHex(row.pubkey);
      } catch (e) {
        console.warn(`Skipping invalid npub ${row.pubkey}: ${e}`);
        continue;
      }

      const existing: any = db.prepare('SELECT * FROM players WHERE pubkey = ?').get(hex);

      if (existing) {
        // Merge stats into existing hex row
        const mergedPlayed = (existing.games_played || 0) + (row.games_played || 0);
        const mergedWon = (existing.games_won || 0) + (row.games_won || 0);
        const mergedWinnings = (existing.total_winnings || 0) + (row.total_winnings || 0);

        let mergedAvg: number | null = null;
        if (existing.avg_reaction_time != null && row.avg_reaction_time != null) {
          mergedAvg = Math.min(existing.avg_reaction_time, row.avg_reaction_time);
        } else {
          mergedAvg = existing.avg_reaction_time ?? row.avg_reaction_time ?? null;
        }

        db.prepare(
          `UPDATE players SET games_played = ?, games_won = ?, total_winnings = ?, avg_reaction_time = ?
           WHERE pubkey = ?`
        ).run(mergedPlayed, mergedWon, mergedWinnings, mergedAvg, hex);
      } else {
        // Insert as new hex row
        db.prepare(
          `INSERT INTO players (pubkey, display_name, games_played, games_won, total_winnings, avg_reaction_time, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(hex, row.display_name, row.games_played, row.games_won, row.total_winnings, row.avg_reaction_time, row.created_at);
      }

      // Update all FK references to point to hex pubkey
      db.prepare('UPDATE room_players SET pubkey = ? WHERE pubkey = ?').run(hex, row.pubkey);
      db.prepare('UPDATE games SET winner_pubkey = ? WHERE winner_pubkey = ?').run(hex, row.pubkey);
      db.prepare('UPDATE game_players SET pubkey = ? WHERE pubkey = ?').run(hex, row.pubkey);
      db.prepare('UPDATE transactions SET pubkey = ? WHERE pubkey = ?').run(hex, row.pubkey);

      // Delete old npub row
      db.prepare('DELETE FROM players WHERE pubkey = ?').run(row.pubkey);
    }

    db.prepare('INSERT INTO migrations (id, applied_at) VALUES (?, ?)').run('003_npub_to_hex', Date.now());
    db.exec('COMMIT');
    console.log(`Migrated ${npubRows.length} npub pubkey(s) to hex`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---------- schema migrations ----------

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

  // Run programmatic data migrations after schema migrations
  migrateNpubToHex();
}
