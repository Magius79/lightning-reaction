import AsyncStorage from '@react-native-async-storage/async-storage';

const PUBKEY_KEY = 'user_pubkey';

/** Persist pubkey to AsyncStorage. */
export async function savePubkey(pubkey: string) {
  await AsyncStorage.setItem(PUBKEY_KEY, pubkey);
}

/** Load stored pubkey. Returns null if none exists. */
export async function loadPubkey(): Promise<string | null> {
  return AsyncStorage.getItem(PUBKEY_KEY);
}
