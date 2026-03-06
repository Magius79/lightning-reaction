import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.string().optional().default('development'),
  PORT: z.coerce.number().optional().default(4000),
  CORS_ORIGIN: z.string().optional().default(''),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),

  DB_PATH: z.string().optional().default('./data/app.sqlite'),

  LNBITS_URL: z.string().url().optional().default('https://legend.lnbits.com'),
  LNBITS_ADMIN_KEY: z.string().optional().default(''),
  LNBITS_INVOICE_KEY: z.string().optional().default(''),

  ENTRY_FEE: z.coerce.number().int().positive().optional().default(100),
  HOUSE_EDGE: z.coerce.number().min(0).max(1).optional().default(0.1),
  INVOICE_EXPIRY_SECONDS: z.coerce.number().int().positive().optional().default(300),
  LIGHTNING_MEMO: z.string().optional().default('Lightning Reaction - Entry Fee'),

  WEBHOOK_SECRET: z.string().optional().default(''),

  // Optional: route LNbits HTTP requests through a proxy (needed for .onion)
  // Example: socks5h://127.0.0.1:9050
  SOCKS_PROXY: z.string().optional().default('')
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);

export const corsOrigins = env.CORS_ORIGIN
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
