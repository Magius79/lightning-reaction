import { Router } from 'express';
import { z } from 'zod';
import bolt11 from 'bolt11';
import { parseBody } from '../utils/validation';
import { HttpError } from '../utils/httpError';
import { payInvoice } from '../services/lightning';
import { createPendingPayout, confirmByHash, getByHash } from '../services/transactions';

export const payoutRouter = Router();

// Real payout endpoint.
// Requires the winner to provide a BOLT11 invoice (or LNURL-pay, future).
// Websocket/game engine should call this with the winner's invoice.
//
// Body:
// { bolt11: string, amountSats: number }
//
// Returns:
// { ok: true, paymentHash }
payoutRouter.post('/', async (req, res, next) => {
  try {
    const body = parseBody(
      z.object({
        bolt11: z.string().min(10),
        amountSats: z.number().int().positive(),
        // optional idempotency key (e.g., gameId/roomId) for future use
        idempotencyKey: z.string().optional(),
      }),
      req.body
    );

    // ----- Amount validation (critical) -----
    let invoiceSats: bigint | null = null;

    try {
      const decoded: any = bolt11.decode(body.bolt11);

      const msatsStr: string | undefined = decoded?.millisatoshis;
      const satsStr: string | undefined = decoded?.satoshis;

      if (msatsStr) {
        invoiceSats = BigInt(msatsStr) / 1000n;
      } else if (satsStr) {
        invoiceSats = BigInt(satsStr);
      } else {
        // amountless invoice: unsafe for automated payouts
        throw new Error('Amountless invoice not allowed');
      }
    } catch (err: any) {
      throw new HttpError(400, `Invalid BOLT11 invoice: ${err?.message || String(err)}`);
    }

    if (invoiceSats !== BigInt(body.amountSats)) {
      throw new HttpError(
        400,
        `Invoice amount mismatch: invoice=${invoiceSats.toString()} sats, expected=${body.amountSats} sats`
      );
    }
    // ----- end amount validation -----

    // Pay via LNbits
    const { paymentHash } = await payInvoice(body.bolt11, body.amountSats);

    // Idempotent record: transactions has UNIQUE(type, payment_hash)
    const existing = getByHash('payout', paymentHash);
    if (!existing) {
      createPendingPayout(null, body.amountSats, paymentHash);
    }
    confirmByHash('payout', paymentHash);

    res.json({ ok: true, paymentHash });
  } catch (e: any) {
    if (e instanceof HttpError) return next(e);
    next(e);
  }
});
