import { Router } from 'express';
import { z } from 'zod';
import { parseBody } from '../utils/validation';
import { getOrCreatePlayer } from '../services/player';
import { checkInvoice, createInvoice } from '../services/lightning';
import { env } from '../config/env';
import {
  getOrCreateOpenRoom,
  getRoomState,
  markRoomPlayerPaidByHash,
  setRoomPlayerPaymentHash,
  upsertRoomPlayer
} from '../services/rooms';
import { confirmByHash, createPendingEntry } from '../services/transactions';

export const roomsRouter = Router();

roomsRouter.post('/join', async (req, res, next) => {
  try {
    const body = parseBody(z.object({ pubkey: z.string().min(16) }), req.body);

    // ensure player exists
    getOrCreatePlayer(body.pubkey);

    const room = getOrCreateOpenRoom();
    upsertRoomPlayer(room.id, body.pubkey);

    const inv = await createInvoice({
      amountSats: env.ENTRY_FEE,
      memo: env.LIGHTNING_MEMO,
      expirySeconds: env.INVOICE_EXPIRY_SECONDS
    });

    // Helpful for debugging polling flows
    console.log('[rooms/join] created invoice', { roomId: room.id, pubkey: body.pubkey, paymentHash: inv.paymentHash });

    createPendingEntry(body.pubkey, env.ENTRY_FEE, inv.paymentHash);

    // Store the payment_hash on the room_player row immediately so webhooks can
    // confirm payment using only the LNbits payment_hash (no roomId/pubkey needed).
    setRoomPlayerPaymentHash(room.id, body.pubkey, inv.paymentHash);

    res.json({ invoice: inv.paymentRequest, roomId: room.id, paymentHash: inv.paymentHash });
  } catch (e) {
    next(e);
  }
});

// Single-shot payment check — client polls this every 2s via auto-polling in PaymentModal.
// Keeping this stateless avoids holding open HTTP connections while waiting for LNbits.
roomsRouter.post('/confirm', async (req, res, next) => {
  try {
    const body = parseBody(z.object({ paymentHash: z.string().min(10) }), req.body);

    const { paid } = await checkInvoice(body.paymentHash);
    if (paid) {
      confirmByHash('entry', body.paymentHash);
      markRoomPlayerPaidByHash(body.paymentHash);
      return res.json({ ok: true, paid: true });
    }

    res.status(202).json({ ok: true, paid: false });
  } catch (e) {
    next(e);
  }
});

roomsRouter.get('/:id', (req, res, next) => {
  try {
    const state = getRoomState(req.params.id);
    if (!state) return res.status(404).json({ error: 'Room not found' });
    res.json(state);
  } catch (e) {
    next(e);
  }
});
