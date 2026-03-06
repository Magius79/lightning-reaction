import { Router } from 'express';
import { getPlayer } from '../services/player';

export const playersRouter = Router();

playersRouter.get('/:pubkey', (req, res, next) => {
  try {
    const player = getPlayer(req.params.pubkey);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    res.json({
      pubkey: player.pubkey,
      gamesPlayed: player.games_played,
      gamesWon: player.games_won,
      avgReactionTime: player.avg_reaction_time
    });
  } catch (e) {
    next(e);
  }
});
