import AsyncStorage from '@react-native-async-storage/async-storage';
import { schnorr, etc } from '@noble/secp256k1';

const NSEC_KEY = 'user_nsec';
const PUBKEY_KEY = 'user_pubkey';

/** Generate a new random 32-byte private key and derive the pubkey. */
export function generateKeypair(): { nsec: string; pubkey: string } {
  const privBytes = etc.randomBytes(32);
  const nsec = etc.bytesToHex(privBytes);
  const pubkey = etc.bytesToHex(schnorr.getPublicKey(privBytes));
  return { nsec, pubkey };
}

/** Derive the x-only public key from a hex private key. */
export function pubkeyFromNsec(nsec: string): string {
  return etc.bytesToHex(schnorr.getPublicKey(etc.hexToBytes(nsec)));
}

/** Persist keypair to AsyncStorage. */
export async function saveKeypair(nsec: string, pubkey: string) {
  await AsyncStorage.setItem(NSEC_KEY, nsec);
  await AsyncStorage.setItem(PUBKEY_KEY, pubkey);
}

/** Load stored keypair. Returns null if none exists. */
export async function loadKeypair(): Promise<{ nsec: string; pubkey: string } | null> {
  const nsec = await AsyncStorage.getItem(NSEC_KEY);
  const pubkey = await AsyncStorage.getItem(PUBKEY_KEY);
  if (nsec && pubkey) return { nsec, pubkey };
  return null;
}

/**
 * Sign a WebSocket auth challenge.
 * Message format: "lightning-reaction-auth:<timestamp>"
 * Returns { pubkey, timestamp, sig } for the Socket.io handshake auth payload.
 */
export async function signAuthChallenge(): Promise<{
  pubkey: string;
  timestamp: number;
  sig: string;
} | null> {
  let kp = await loadKeypair();
  
  // Migration: old app stored pubkey but no private key
  if (!kp) {
    const newKp = generateKeypair();
    await saveKeypair(newKp.nsec, newKp.pubkey);
    kp = newKp;
  }

  const timestamp = Date.now();
  const message = `lightning-reaction-auth:${timestamp}`;
  const msgBytes = new TextEncoder().encode(message);
  const sigBytes = await schnorr.signAsync(msgBytes, etc.hexToBytes(kp.nsec));
  const sig = etc.bytesToHex(sigBytes);
  return { pubkey: kp.pubkey, timestamp, sig };
}
