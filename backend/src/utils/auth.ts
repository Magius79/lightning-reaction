import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { HttpError } from './httpError';
import type { Request, Response, NextFunction } from 'express';

export type JwtPayload = { pubkey: string };

export function signToken(payload: JwtPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '30d' });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Missing Authorization header'));
  }
  const token = header.slice('Bearer '.length);
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    (req as any).auth = decoded;
    next();
  } catch {
    next(new HttpError(401, 'Invalid token'));
  }
}
