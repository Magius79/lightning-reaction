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
       WHERE games_won > 0
       ORDER BY games_won DESC, avg_reaction_time ASC
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
  try {
    db.exec('ALTER TABLE players ADD COLUMN credited_at INTEGER');
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

const CREDIT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getPlayerCredits(pubkey: string): number {
  initCredits();
  const db = getDb();
  const row = db.prepare('SELECT credits, credited_at FROM players WHERE pubkey = ?').get(pubkey) as { credits: number; credited_at: number | null } | undefined;
  if (!row || row.credits <= 0) return 0;

  // Expire credits older than 24 hours
  if (row.credited_at && (Date.now() - row.credited_at) > CREDIT_TTL_MS) {
    db.prepare('UPDATE players SET credits = 0, credited_at = NULL WHERE pubkey = ?').run(pubkey);
    console.log(`[player] Expired ${row.credits} credit(s) for ${pubkey} (granted ${Math.round((Date.now() - row.credited_at) / 3600000)}h ago)`);
    return 0;
  }

  return row.credits;
}

export function addPlayerCredit(pubkey: string): void {
  initCredits();
  const db = getDb();
  db.prepare('UPDATE players SET credits = credits + 1, credited_at = ? WHERE pubkey = ?').run(Date.now(), pubkey);
}

export function usePlayerCredit(pubkey: string): void {
  initCredits();
  const db = getDb();
  db.prepare('UPDATE players SET credits = credits - 1 WHERE pubkey = ? AND credits > 0').run(pubkey);
  // Clear timestamp if no credits remain
  db.prepare('UPDATE players SET credited_at = NULL WHERE pubkey = ? AND credits <= 0').run(pubkey);
}

export function updatePlayerStats(pubkey: string, won: boolean, reactionTime: number | null, satsWon: number = 0): void {
  const db = getDb();
  if (won) {
    db.prepare(
      `UPDATE players SET
        games_played = games_played + 1,
        games_won = games_won + 1,
        total_winnings = total_winnings + ?,
        avg_reaction_time = CASE
          WHEN ? IS NULL THEN avg_reaction_time
          WHEN avg_reaction_time IS NULL THEN ?
          ELSE (avg_reaction_time * games_played + ?) / (games_played + 1)
        END
      WHERE pubkey = ?`
    ).run(satsWon, reactionTime, reactionTime, reactionTime, pubkey);
  } else {
    db.prepare(
      `UPDATE players SET
        games_played = games_played + 1,
        avg_reaction_time = CASE
          WHEN ? IS NULL THEN avg_reaction_time
          WHEN avg_reaction_time IS NULL THEN ?
          ELSE (avg_reaction_time * games_played + ?) / (games_played + 1)
        END
      WHERE pubkey = ?`
    ).run(reactionTime, reactionTime, reactionTime, pubkey);
  }
}
