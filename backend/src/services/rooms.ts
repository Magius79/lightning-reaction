import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../config/database';
import { env } from '../config/env';

export type RoomStatus = 'open' | 'running' | 'closed';

export function getOrCreateOpenRoom(): { id: string; status: RoomStatus; created_at: number } {
  const db = getDb();
  const room = db
    .prepare("SELECT * FROM rooms WHERE status = 'open' ORDER BY created_at DESC LIMIT 1")
    .get() as any;
  if (room) return room;

  const now = Date.now();
  const id = uuidv4();
  db.prepare('INSERT INTO rooms (id, status, created_at) VALUES (?, ?, ?)').run(id, 'open', now);
  return { id, status: 'open', created_at: now };
}

export function upsertRoomPlayer(roomId: string, pubkey: string) {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO room_players (room_id, pubkey, paid, payment_hash, created_at)
     VALUES (?, ?, 0, NULL, ?)
     ON CONFLICT(room_id, pubkey) DO NOTHING`
  ).run(roomId, pubkey, now);
}

export function setRoomPlayerPaymentHash(roomId: string, pubkey: string, paymentHash: string) {
  const db = getDb();
  db.prepare(
    `UPDATE room_players
     SET payment_hash = ?
     WHERE room_id = ? AND pubkey = ?`
  ).run(paymentHash, roomId, pubkey);
}

export function markRoomPlayerPaid(roomId: string, pubkey: string, paymentHash: string) {
  const db = getDb();
  db.prepare(
    `UPDATE room_players
     SET paid = 1, payment_hash = ?
     WHERE room_id = ? AND pubkey = ?`
  ).run(paymentHash, roomId, pubkey);
}

export function markRoomPlayerPaidByHash(paymentHash: string) {
  const db = getDb();
  db.prepare(
    `UPDATE room_players
     SET paid = 1
     WHERE payment_hash = ?`
  ).run(paymentHash);
}

export function getRoomState(roomId: string) {
  const db = getDb();
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as any;
  if (!room) return null;

  const players = db
    .prepare(
      `SELECT rp.pubkey, rp.paid, rp.payment_hash as paymentHash
       FROM room_players rp
       WHERE rp.room_id = ?
       ORDER BY rp.created_at ASC`
    )
    .all(roomId) as Array<{ pubkey: string; paid: number; paymentHash: string | null }>;

  const paidCount = players.filter((p) => p.paid === 1).length;
  const prizePool = Math.floor(paidCount * env.ENTRY_FEE * (1 - env.HOUSE_EDGE));

  return {
    id: room.id,
    status: room.status,
    players: players.map((p) => ({ ...p, paid: !!p.paid })),
    prizePool
  };
}
