import { getDb } from '../config/database';

export type GameResultRow = {
  pubkey: string;
  reactionTime: number | null;
  won: boolean;
  disqualified: boolean;
  ip?: string | null;
};

export type GameResultBatch = {
  roomId: string | null;
  isFreeplay: boolean;
  hadBot: boolean;
  numPlayers: number;
  players: GameResultRow[];
};

/**
 * Persist one row per human player for a finished game. Best-effort audit log
 * for anti-cheat analysis (win rate, reaction variance, DQ rate, multi-account
 * by IP). Written in a single transaction.
 */
export function recordGameResults(batch: GameResultBatch): void {
  const db = getDb();
  const now = Date.now();

  const insert = db.prepare(
    `INSERT INTO game_results
       (room_id, pubkey, reaction_time, won, disqualified, had_bot, num_players, is_freeplay, ip, created_at)
     VALUES (@room_id, @pubkey, @reaction_time, @won, @disqualified, @had_bot, @num_players, @is_freeplay, @ip, @created_at)`
  );

  const insertMany = db.transaction((players: GameResultRow[]) => {
    for (const p of players) {
      insert.run({
        room_id: batch.roomId ?? null,
        pubkey: p.pubkey,
        reaction_time: p.reactionTime,
        won: p.won ? 1 : 0,
        disqualified: p.disqualified ? 1 : 0,
        had_bot: batch.hadBot ? 1 : 0,
        num_players: batch.numPlayers,
        is_freeplay: batch.isFreeplay ? 1 : 0,
        ip: p.ip ?? null,
        created_at: now,
      });
    }
  });

  insertMany(batch.players);
}
