// Node 18+ ships a standards-based `fetch` (powered by undici). Use that to
// avoid CJS↔ESM interop issues with node-fetch v3.
import { env } from '../config/env';
import { logger } from '../config/logger';
import { HttpError } from '../utils/httpError';

type RequestInit = globalThis.RequestInit;

const LNBITS_TIMEOUT_MS = 25000; // 25s — under the frontend's 30s abort

function lnbitsFetch(url: string, init: RequestInit = {}) {
  // Needed for .onion access (Tor) and optional corporate proxies.
  // NOTE: undici's fetch (Node built-in) does not accept the Node.js `agent` option.
  // socks-proxy-agent is a Node http(s).Agent, so we can't wire it in directly here.
  // If you need SOCKS proxy support, we should switch to an undici ProxyAgent/Dispatcher
  // implementation or use node-fetch v2.
  if (env.SOCKS_PROXY) {
    logger.warn({ socksProxy: env.SOCKS_PROXY }, 'SOCKS_PROXY is set but not supported with built-in fetch; proceeding without proxy');
  }

  // Apply a timeout so slow Tor responses don't hang the backend indefinitely.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LNBITS_TIMEOUT_MS);
  const signal = init.signal
    ? anySignal([init.signal as AbortSignal, controller.signal])
    : controller.signal;

  return fetch(url, { ...init, signal }).finally(() => clearTimeout(timer));
}

// Combine multiple AbortSignals (any one aborting cancels the fetch)
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) { controller.abort(); break; }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

export type CreateInvoiceResult = {
  paymentHash: string;
  paymentRequest: string;
};

function requireInvoiceKey() {
  if (!env.LNBITS_INVOICE_KEY) {
    throw new HttpError(500, 'Lightning not configured: missing LNBITS_INVOICE_KEY');
  }
}

function requireAdminKey() {
  if (!env.LNBITS_ADMIN_KEY) {
    throw new HttpError(500, 'Lightning not configured: missing LNBITS_ADMIN_KEY');
  }
}

export async function createInvoice(params: {
  amountSats: number;
  memo: string;
  expirySeconds: number;
}): Promise<CreateInvoiceResult> {
  requireInvoiceKey();

  const url = `${env.LNBITS_URL.replace(/\/$/, '')}/api/v1/payments`;
  const res = await lnbitsFetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Api-Key': env.LNBITS_INVOICE_KEY
    },
    body: JSON.stringify({
      out: false,
      amount: params.amountSats,
      memo: params.memo,
      expiry: params.expirySeconds
    })
  });

  const text = await res.text();
  if (!res.ok) {
    logger.error({ status: res.status, body: text }, 'LNbits createInvoice failed');
    throw new HttpError(502, 'Failed to create Lightning invoice');
  }

  const json = JSON.parse(text) as any;
  // LNbits returns { payment_hash, payment_request }
  if (!json.payment_hash || !json.payment_request) {
    throw new HttpError(502, 'Unexpected LNbits invoice response');
  }

  return { paymentHash: json.payment_hash, paymentRequest: json.payment_request };
}

export async function checkInvoice(paymentHash: string): Promise<{ paid: boolean }> {
  requireInvoiceKey();
  const url = `${env.LNBITS_URL.replace(/\/$/, '')}/api/v1/payments/${paymentHash}`;
  const res = await lnbitsFetch(url, {
    headers: {
      'X-Api-Key': env.LNBITS_INVOICE_KEY
    }
  });
  const text = await res.text();
  if (!res.ok) {
    logger.error({ status: res.status, body: text }, 'LNbits checkInvoice failed');
    throw new HttpError(502, 'Failed to check invoice');
  }
  const json = JSON.parse(text) as any;
  return { paid: !!json.paid };
}

export async function payInvoice(bolt11: string, amountSats?: number): Promise<{ paymentHash: string }> {
  requireAdminKey();
  const url = `${env.LNBITS_URL.replace(/\/$/, '')}/api/v1/payments`;

  // Retry 3x
  let lastErr: any;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await lnbitsFetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Api-Key': env.LNBITS_ADMIN_KEY
        },
        body: JSON.stringify({ out: true, bolt11, amount: amountSats })
      });

      const text = await res.text();
      if (!res.ok) {
        logger.error({ attempt, status: res.status, body: text }, 'LNbits payInvoice failed');
        throw new Error(text);
      }
      const json = JSON.parse(text) as any;
      if (!json.payment_hash) throw new Error('Missing payment_hash');
      return { paymentHash: json.payment_hash };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }

  logger.error({ err: lastErr }, 'LNbits payInvoice exhausted retries');
  throw new HttpError(502, 'Failed to pay Lightning invoice');
}
