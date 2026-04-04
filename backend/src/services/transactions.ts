import { getDb } from '../config/database';

export type TransactionStatus = 'pending' | 'confirmed' | 'failed';
export type TransactionType = 'entry' | 'payout';

export function createPendingEntry(pubkey: string, amount: number, paymentHash: string) {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO transactions (pubkey, type, amount, payment_hash, status, created_at)
     VALUES (?, 'entry', ?, ?, 'pending', ?)`
  ).run(pubkey, amount, paymentHash, now);
}

export function createPendingPayout(pubkey: string | null, amount: number, paymentHash: string) {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO transactions (pubkey, type, amount, payment_hash, status, created_at)
     VALUES (?, 'payout', ?, ?, 'pending', ?)`
  ).run(pubkey, amount, paymentHash, now);
}

export function confirmByHash(type: TransactionType, paymentHash: string) {
  const db = getDb();
  db.prepare(
    `UPDATE transactions
     SET status = 'confirmed'
     WHERE type = ? AND payment_hash = ?`
  ).run(type, paymentHash);
}

export function getByHash(type: TransactionType, paymentHash: string) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM transactions WHERE type = ? AND payment_hash = ?')
    .get(type, paymentHash) as any | undefined;
}

export function isPaymentHashUsed(paymentHash: string): boolean {
  const db = getDb();
  const row = db
    .prepare('SELECT 1 FROM used_payment_hashes WHERE payment_hash = ?')
    .get(paymentHash);
  return !!row;
}

export function markPaymentHashUsed(paymentHash: string, pubkey: string) {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO used_payment_hashes (payment_hash, pubkey, used_at)
     VALUES (?, ?, ?)`
  ).run(paymentHash, pubkey, Date.now());
}
