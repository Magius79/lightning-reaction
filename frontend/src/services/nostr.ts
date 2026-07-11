// Shared Nostr profile resolution used by the Home, Leaderboard, and Game
// screens. Kept in one place so name handling stays consistent.

const RELAYS = ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://nos.lol'];

export type NostrProfile = {
  name?: string;
  display_name?: string;
  displayName?: string; // legacy camelCase variant some clients still write
  picture?: string;
};

/**
 * Fetch a Nostr kind:0 profile for a hex pubkey. Tries each relay in turn:
 * a relay returning EOSE (no profile here) advances to the next one rather
 * than giving up, so a profile that only lives on a later relay still resolves.
 * Resolves null only when every relay misses/times out/errors.
 */
export function fetchNostrProfile(hexPubkey: string, timeoutMs = 4000): Promise<NostrProfile | null> {
  return new Promise((resolve) => {
    let resolved = false;
    let attempt = 0;

    const next = () => {
      attempt++;
      if (attempt < RELAYS.length) tryRelay(RELAYS[attempt]);
      else { resolved = true; resolve(null); }
    };

    const tryRelay = (relayUrl: string) => {
      try {
        const ws = new WebSocket(relayUrl);
        const timer = setTimeout(() => {
          try { ws.close(); } catch {}
          if (!resolved) next();
        }, timeoutMs);

        ws.onopen = () => {
          ws.send(JSON.stringify(['REQ', 'p_' + Date.now(), { kinds: [0], authors: [hexPubkey], limit: 1 }]));
        };

        ws.onmessage = (event: any) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg[0] === 'EVENT' && msg[2]?.content) {
              clearTimeout(timer);
              try { ws.close(); } catch {}
              if (!resolved) { resolved = true; resolve(JSON.parse(msg[2].content)); }
            } else if (msg[0] === 'EOSE') {
              clearTimeout(timer);
              try { ws.close(); } catch {}
              if (!resolved) next(); // not on this relay — try the next
            }
          } catch {
            // ignore malformed relay messages
          }
        };

        ws.onerror = () => {
          clearTimeout(timer);
          if (!resolved) next();
        };
      } catch {
        if (!resolved) next();
      }
    };

    tryRelay(RELAYS[0]);
  });
}

/**
 * The friendly name to show for a profile: prefer the display name (NIP-24
 * snake_case, or the legacy camelCase field), falling back to the handle.
 * Returns null if the profile has no usable name.
 */
export function profileDisplayName(profile: NostrProfile | null): string | null {
  if (!profile) return null;
  return profile.display_name || profile.displayName || profile.name || null;
}
