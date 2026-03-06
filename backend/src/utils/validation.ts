import { z } from 'zod';
import { HttpError } from './httpError';

export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const res = schema.safeParse(body);
  if (!res.success) {
    throw new HttpError(400, 'Validation error', {
      code: 'VALIDATION_ERROR',
      details: res.error.flatten()
    });
  }
  return res.data;
}
