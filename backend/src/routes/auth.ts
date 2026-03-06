import { Router } from 'express';
import { z } from 'zod';
import { parseBody } from '../utils/validation';
import { getOrCreatePlayer } from '../services/player';
import { signToken } from '../utils/auth';

export const authRouter = Router();

authRouter.post('/login', (req, res, next) => {
  try {
    const body = parseBody(z.object({ pubkey: z.string().min(16) }), req.body);
    const player = getOrCreatePlayer(body.pubkey);
    const token = signToken({ pubkey: player.pubkey });
    res.json({ player, token });
  } catch (e) {
    next(e);
  }
});
