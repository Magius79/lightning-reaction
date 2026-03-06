import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { HttpError } from '../utils/httpError';
import { parseBody } from '../utils/validation';
import { checkInvoice } from '../services/lightning';
import { confirmByHash, getByHash } from '../services/transactions';
import { getDb } from '../config/database';
import { markRoomPlayerPaidByHash } from '../services/rooms';
import { logger } from '../config/logger';

export const webhookRouter = Router();

function verifySignature(rawBody: Buffer, signatureHeader: string | undefined) {
  if (!env.WEBHOOK_SECRET) return; // allow in dev if not set
  if (!signatureHeader) {
    throw new HttpError(401, 'Missing webhook signature');
  }
  const expected = crypto
    .createHmac('sha256', env.WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  const provided = signatureHeader.trim();

  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new HttpError(401, 'Invalid webhook signature');
  }
}

// LNbits webhooks vary depending on extension/setup.
// For MVP we accept either:
//  - our legacy payload: {paymentHash, roomId, pubkey}
//  - LNbits-style payloads that include payment_hash/paymentHash
// We ALWAYS verify paid status via LNbits before confirming.
webhookRouter.post('/payment', async (req, res, next) => {
  try {
    const rawBody: Buffer | undefined = (req as any).rawBody;
    verifySignature(rawBody || Buffer.from(JSON.stringify(req.body || {})), req.header('x-webhook-signature') || undefined);

    const body = parseBody(
      z
        .object({
          paymentHash: z.string().min(10).optional(),
          payment_hash: z.string().min(10).optional(),
          // legacy fields (optional now)
          roomId: z.string().min(6).optional(),
          pubkey: z.string().min(16).optional()
        })
        .refine((b) => !!(b.paymentHash || b.payment_hash), { message: 'Missing payment hash' }),
      req.body
    );

    const paymentHash = (body.paymentHash || body.payment_hash)!;

    const tx = getByHash('entry', paymentHash);
    if (!tx) {
      throw new HttpError(404, 'Payment intent not found');
    }

    if (tx.status === 'confirmed') {
      return res.json({ ok: true, duplicate: true });
    }

    // Always verify with LNbits to prevent spoofed webhook.
    const { paid } = await checkInvoice(paymentHash);
    if (!paid) {
      throw new HttpError(409, 'Invoice not paid yet');
    }

    const db = getDb();
    db.exec('BEGIN');
    try {
      confirmByHash('entry', paymentHash);

      // Preferred: we already stored payment_hash on room_players at join time.
      markRoomPlayerPaidByHash(paymentHash);

      // Fallback for legacy payloads: if roomId+pubkey present, update that row too.
      if (body.roomId && body.pubkey) {
        db.prepare(
          `UPDATE room_players
           SET paid = 1, payment_hash = ?
           WHERE room_id = ? AND pubkey = ?`
        ).run(paymentHash, body.roomId, body.pubkey);
      }

      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, 'payment webhook error');
    next(e);
  }
});
