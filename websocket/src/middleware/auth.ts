import { Socket } from 'socket.io';

const AUTH_WINDOW_MS = 60_000; // Signature valid for 60 seconds

/**
 * Socket.io middleware that verifies Nostr Schnorr signatures.
 *
 * The client must provide { pubkey, timestamp, sig } in the handshake auth.
 * - pubkey: 64-char hex x-only public key
 * - timestamp: Unix ms when the signature was created
 * - sig: hex Schnorr signature over "lightning-reaction-auth:<timestamp>"
 *
 * On success, socket.data.pubkey is set to the verified pubkey.
 */
export async function authMiddleware(socket: Socket, next: (err?: Error) => void) {
  const auth = socket.handshake.auth as Record<string, unknown> | undefined;

  if (!auth || !auth.pubkey || !auth.timestamp || !auth.sig) {
    return next(new Error('Authentication required: missing pubkey, timestamp, or sig'));
  }

  const { pubkey, timestamp, sig } = auth as {
    pubkey: string;
    timestamp: number;
    sig: string;
  };

  // Validate field formats
  if (typeof pubkey !== 'string' || !/^[0-9a-f]{64}$/i.test(pubkey)) {
    return next(new Error('Invalid pubkey: expected 64-char hex'));
  }
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return next(new Error('Invalid timestamp'));
  }
  if (typeof sig !== 'string' || !/^[0-9a-f]{128}$/i.test(sig)) {
    return next(new Error('Invalid signature: expected 128-char hex'));
  }

  // Reject stale signatures
  const age = Math.abs(Date.now() - timestamp);
  if (age > AUTH_WINDOW_MS) {
    return next(new Error('Authentication expired: signature too old'));
  }

  // Verify Schnorr signature
  const message = `lightning-reaction-auth:${timestamp}`;
  const msgBytes = new TextEncoder().encode(message);

  try {
    const { schnorr, etc } = await import('@noble/secp256k1');
    const valid = await schnorr.verifyAsync(etc.hexToBytes(sig), msgBytes, etc.hexToBytes(pubkey));
    if (!valid) {
      return next(new Error('Invalid signature: verification failed'));
    }
  } catch (e: any) {
    return next(new Error(`Signature verification error: ${e?.message || 'unknown'}`));
  }

  // Attach verified pubkey to the socket for downstream use
  socket.data.pubkey = pubkey.toLowerCase();

  console.log(`[Auth] Verified pubkey ${pubkey.slice(0, 12)}... for socket ${socket.id}`);
  next();
}
