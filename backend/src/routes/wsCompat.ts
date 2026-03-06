import { Router } from 'express';
import { z } from 'zod';
import { parseBody } from '../utils/validation';
import { checkInvoice, payInvoice } from '../services/lightning';
import { getByHash, confirmByHash } from '../services/transactions';
import { markRoomPlayerPaidByHash } from '../services/rooms';
import { logger } from '../config/logger';

// Compatibility routes for the current websocket server implementation.
// TODO: replace websocket server to call the canonical /api/* routes.
export const wsCompatRouter = Router();

wsCompatRouter.post('/verify-payment', async (req, res, next) => {
  try {
    const body = parseBody(z.object({ pubkey: z.string().min(16), paymentHash: z.string().min(10) }), req.body);

    const tx = getByHash('entry', body.paymentHash);
    if (!tx) return res.json({ verified: false });
    if (tx.pubkey && tx.pubkey !== body.pubkey) return res.json({ verified: false });

    const { paid } = await checkInvoice(body.paymentHash);
    if (!paid) return res.json({ verified: false });

    // Mark confirmed (idempotent)
    confirmByHash('entry', body.paymentHash);
    markRoomPlayerPaidByHash(body.paymentHash);

    res.json({ verified: true });
  } catch (e) {
    next(e);
  }
});

wsCompatRouter.post('/refund', async (_req, res) => {
  // Not implemented for MVP; websocket server calls this only when a player leaves before paying.
  res.json({ ok: true });
});

wsCompatRouter.post('/payout', async (req, res, next) => {
  try {
    const body = parseBody(
      z.object({
        bolt11: z.string().min(10),
        amountSats: z.number().int().positive(),
      }),
      req.body
    );

    logger.info({ amountSats: body.amountSats }, 'wsCompat /payout: initiating Lightning payout');

    const { paymentHash } = await payInvoice(body.bolt11, body.amountSats);

    logger.info({ paymentHash, amountSats: body.amountSats }, 'wsCompat /payout: payout successful');

    res.json({ ok: true, paymentHash });
  } catch (e) {
    logger.error({ err: e }, 'wsCompat /payout: payout failed');
    next(e);
  }
});
# force rebuild
