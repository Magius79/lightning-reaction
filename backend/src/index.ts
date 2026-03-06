import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';

import { env, corsOrigins } from './config/env';
import { logger } from './config/logger';
import { migrate } from './config/migrate';
import { getDb } from './config/database';

import { authRouter } from './routes/auth';
import { roomsRouter } from './routes/rooms';
import { leaderboardRouter } from './routes/leaderboard';
import { playersRouter } from './routes/players';
import { webhookRouter } from './routes/webhook';
import { wsCompatRouter } from './routes/wsCompat';
import { payoutRouter } from './routes/payout';
import { HttpError } from './utils/httpError';

migrate();

const app = express();

// Capture raw body for webhook signature verification
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(helmet());

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (corsOrigins.length === 0) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('CORS blocked'));
    },
    credentials: true,
  })
);

// Readiness: checks DB + LNbits (returns 503 if a dependency is down)
app.get('/health', async (_req, res) => {
  const ts = Date.now();

  // DB check
  let dbOk = false;
  let dbErr: string | undefined;
  try {
    const row = getDb().prepare('SELECT 1 as ok').get() as any;
    dbOk = row?.ok === 1;
    if (!dbOk) dbErr = 'Unexpected DB response';
  } catch (e: any) {
    dbOk = false;
    dbErr = e?.message || String(e);
  }

  // LNbits check (with timeout)
  let lnbitsOk = false;
  let lnbitsErr: string | undefined;
  try {
    if (!env.LNBITS_URL || !env.LNBITS_INVOICE_KEY) {
      throw new Error('LNbits not configured');
    }

    const url = `${env.LNBITS_URL.replace(/\/$/, '')}/api/v1/wallet`;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(url, {
      headers: { 'X-Api-Key': env.LNBITS_INVOICE_KEY },
      signal: controller.signal,
    }).finally(() => clearTimeout(t));

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
    }

    lnbitsOk = true;
  } catch (e: any) {
    lnbitsOk = false;
    lnbitsErr = e?.name === 'AbortError' ? 'timeout' : e?.message || String(e);
  }

  const ok = dbOk && lnbitsOk;

  res.status(ok ? 200 : 503).json({
    ok,
    service: 'lrt-backend',
    ts,
    dbOk,
    lnbitsOk,
    ...(dbErr ? { dbErr } : {}),
    ...(lnbitsErr ? { lnbitsErr } : {}),
  });
});

// Liveness: process is up (no dependency checks)
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  })
);

app.use(pinoHttp({ logger }));

app.use('/api/auth', authRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/players', playersRouter);
app.use('/api/webhook', webhookRouter);


// Real payout endpoint (also mounted at root for websocket compat)
app.use('/payout', payoutRouter);

// Compatibility routes for websocket server (expects these at root)
app.use('/', wsCompatRouter);

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err instanceof HttpError ? err.status : 500;
  const payload: any = { error: err?.message || 'Internal Server Error' };
  if (err instanceof HttpError && err.code) payload.code = err.code;
  if (err instanceof HttpError && err.details) payload.details = err.details;

  if (status >= 500) {
    logger.error({ err }, 'Unhandled error');
  }

  res.status(status).json(payload);
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'backend listening');
});
