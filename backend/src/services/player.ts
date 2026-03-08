import { getDb } from '../config/database';

export type PlayerModel = {
  pubkey: string;
  display_name: string | null;
  games_played: number;
  games_won: number;
  total_winnings: number;
  avg_reaction_time: number | null;
  created_at: number;
};

export function getOrCreatePlayer(pubkey: string): PlayerModel {
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM players WHERE pubkey = ?')
    .get(pubkey) as PlayerModel | undefined;

  if (existing) return existing;

  const now = Date.now();
  db.prepare(
    `INSERT INTO players (pubkey, display_name, games_played, games_won, total_winnings, avg_reaction_time, created_at)
     VALUES (?, NULL, 0, 0, 0, NULL, ?)`
  ).run(pubkey, now);

  return db.prepare('SELECT * FROM players WHERE pubkey = ?').get(pubkey) as PlayerModel;
}

export function getPlayer(pubkey: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM players WHERE pubkey = ?').get(pubkey) as PlayerModel | undefined;
}

export function listLeaderboard(limit: number) {
  const db = getDb();
  return db
    .prepare(
      `SELECT pubkey, games_won as gamesWon, avg_reaction_time as avgReactionTime, total_winnings as totalWinnings
       FROM players
       ORDER BY games_won DESC, total_winnings DESC
       LIMIT ?`
    )
    .all(limit) as Array<{ pubkey: string; gamesWon: number; avgReactionTime: number | null; totalWinnings: number }>;
}

// ── Credit system (for room timeout refunds) ──

function ensureCreditsColumn() {
  const db = getDb();
  try {
    db.exec('ALTER TABLE players ADD COLUMN credits INTEGER NOT NULL DEFAULT 0');
  } catch {
    // Column already exists — safe to ignore
  }
}

let creditsColumnReady = false;
function initCredits() {
  if (!creditsColumnReady) {
    ensureCreditsColumn();
    creditsColumnReady = true;
  }
}

export function getPlayerCredits(pubkey: string): number {
  initCredits();
  const db = getDb();
  const row = db.prepare('SELECT credits FROM players WHERE pubkey = ?').get(pubkey) as { credits: number } | undefined;
  return row?.credits ?? 0;
}

export function addPlayerCredit(pubkey: string): void {
  initCredits();
  const db = getDb();
  db.prepare('UPDATE players SET credits = credits + 1 WHERE pubkey = ?').run(pubkey);
}

export function usePlayerCredit(pubkey: string): void {
  initCredits();
  const db = getDb();
  db.prepare('UPDATE players SET credits = credits - 1 WHERE pubkey = ? AND credits > 0').run(pubkey);
}
