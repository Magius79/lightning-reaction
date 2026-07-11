import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { HttpError } from './httpError';

/**
 * Guards server-to-server routes that only the websocket server should call
 * (payout, verify-payment, refund, credit, update-stats). The caller must send
 * the shared secret in the `X-Internal-Key` header.
 *
 * Fails closed: if INTERNAL_API_KEY is unset the request is rejected rather than
 * allowed. (The env schema already requires it, so this is a belt-and-braces.)
 */
export function internalAuth(req: Request, _res: Response, next: NextFunction) {
  const configured = env.INTERNAL_API_KEY;
  if (!configured) {
    return next(new HttpError(500, 'Internal API key not configured'));
  }

  const provided = req.header('x-internal-key') || '';
  const a = Buffer.from(configured);
  const b = Buffer.from(provided);

  // Length check first — timingSafeEqual throws on length mismatch.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return next(new HttpError(401, 'Unauthorized'));
  }

  next();
}
