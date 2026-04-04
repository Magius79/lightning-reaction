import { Socket } from 'socket.io';

/**
 * Socket.io middleware that extracts and validates the player's pubkey.
 *
 * The client must provide { pubkey } in the handshake auth.
 * - pubkey: 64-char hex x-only public key (Nostr format)
 *
 * On success, socket.data.pubkey is set to the validated pubkey.
 */
export async function authMiddleware(socket: Socket, next: (err?: Error) => void) {
  const auth = socket.handshake.auth as Record<string, unknown> | undefined;
  const ip = socket.handshake.address;
  console.log(`[Auth] Incoming connection from ${ip} | pubkey: ${!!auth?.pubkey}`);

  if (!auth || !auth.pubkey) {
    console.error(`[Auth] Rejected ${ip}: missing pubkey`);
    return next(new Error('Authentication required: missing pubkey'));
  }

  const { pubkey } = auth as { pubkey: string };

  // Validate field format
  if (typeof pubkey !== 'string' || !/^[0-9a-f]{64}$/i.test(pubkey)) {
    console.error(`[Auth] Rejected ${ip}: invalid pubkey format`);
    return next(new Error('Invalid pubkey: expected 64-char hex'));
  }

  // Attach verified pubkey to the socket for downstream use
  socket.data.pubkey = pubkey.toLowerCase();

  console.log(`[Auth] Accepted pubkey ${pubkey.slice(0, 12)}... for socket ${socket.id}`);
  next();
}
