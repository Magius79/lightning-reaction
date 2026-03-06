import { Router } from 'express';
import { z } from 'zod';
import { listLeaderboard } from '../services/player';

export const leaderboardRouter = Router();

leaderboardRouter.get('/', (req, res, next) => {
  try {
    const limit = z.coerce.number().int().min(1).max(200).catch(50).parse(req.query.limit);
    res.json(listLeaderboard(limit));
  } catch (e) {
    next(e);
  }
});
