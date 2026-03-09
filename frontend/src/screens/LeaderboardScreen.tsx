import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, API_URL } from '../constants/theme';
import { Trophy } from 'lucide-react-native';

type LeaderboardEntry = {
  pubkey: string;
  displayName: string;
  gamesWon: number;
  avgReactionTime: number | null;
  totalWinnings: number;
  isMe: boolean;
};

// Decode npub bech32 to hex pubkey
function npubToHex(npub: string): string | null {
  try {
    if (!npub.startsWith('npub1')) return null;
    const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
    const data = npub.slice(5);
    const values: number[] = [];
    for (const c of data) {
      const v = CHARSET.indexOf(c);
      if (v === -1) return null;
      values.push(v);
    }
    const payload = values.slice(0, values.length - 6);
    let acc = 0;
    let bits = 0;
    const bytes: number[] = [];
    for (const v of payload) {
      acc = (acc << 5) | v;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((acc >> bits) & 0xff);
      }
    }
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

// Fetch a single Nostr profile from relay
function fetchNostrProfile(
  hexPubkey: string,
  timeoutMs = 4000
): Promise<{ name?: string; display_name?: string } | null> {
  const relays = ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://nos.lol'];

  return new Promise((resolve) => {
    let resolved = false;
    let attempt = 0;

    const tryRelay = (relayUrl: string) => {
      try {
        const ws = new WebSocket(relayUrl);
        const timer = setTimeout(() => {
          ws.close();
          if (!resolved) {
            attempt++;
            if (attempt < relays.length) tryRelay(relays[attempt]);
            else { resolved = true; resolve(null); }
          }
        }, timeoutMs);

        ws.onopen = () => {
          ws.send(JSON.stringify(['REQ', 'p_' + Date.now(), { kinds: [0], authors: [hexPubkey], limit: 1 }]));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg[0] === 'EVENT' && msg[2]?.content) {
              clearTimeout(timer);
              ws.close();
              if (!resolved) { resolved = true; resolve(JSON.parse(msg[2].content)); }
            } else if (msg[0] === 'EOSE') {
              clearTimeout(timer);
              ws.close();
              if (!resolved) { resolved = true; resolve(null); }
            }
          } catch {}
        };

        ws.onerror = () => {
          clearTimeout(timer);
          if (!resolved) {
            attempt++;
            if (attempt < relays.length) tryRelay(relays[attempt]);
            else { resolved = true; resolve(null); }
          }
        };
      } catch {
        if (!resolved) {
          attempt++;
          if (attempt < relays.length) tryRelay(relays[attempt]);
          else { resolved = true; resolve(null); }
        }
      }
    };

    tryRelay(relays[0]);
  });
}

const LeaderboardScreen = ({ navigation }: any) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const myPubkey = (await AsyncStorage.getItem('user_pubkey'))?.trim() || '';
      const resp = await fetch(`${API_URL}/api/leaderboard`);
      if (!resp.ok) return;
      const data = await resp.json();

      console.log('[Leaderboard] myPubkey:', myPubkey?.slice(0, 20));

      // Initial mapping with shortened npubs
      const mapped: LeaderboardEntry[] = (data || []).map((entry: any) => ({
        pubkey: entry.pubkey,
        displayName: `${entry.pubkey.slice(0, 12)}…${entry.pubkey.slice(-4)}`,
        gamesWon: entry.gamesWon ?? 0,
        avgReactionTime: entry.avgReactionTime ? Math.round(entry.avgReactionTime) : null,
        totalWinnings: entry.totalWinnings ?? 0,
        isMe: myPubkey.length > 0 && entry.pubkey.trim() === myPubkey,
      }));

      setEntries(mapped);

      // Resolve Nostr names in background (individual queries)
      const resolveNames = async () => {
        const updates = new Map<string, string>();

        await Promise.all(
          mapped.map(async (entry) => {
            const hex = npubToHex(entry.pubkey);
            if (!hex) return;
            const profile = await fetchNostrProfile(hex);
            const name = profile?.display_name || profile?.name;
            if (name) updates.set(entry.pubkey, name);
          })
        );

        if (updates.size > 0) {
          setEntries((prev) =>
            prev.map((entry) => {
              const name = updates.get(entry.pubkey);
              if (name) return { ...entry, displayName: name };
              return entry;
            })
          );
        }
      };

      resolveNames();
    } catch {
      // Keep existing data
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard().finally(() => setLoading(false));
  }, [fetchLeaderboard]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLeaderboard();
    setRefreshing(false);
  };

  const renderItem = ({ item, index }: { item: LeaderboardEntry; index: number }) => (
    <View style={[styles.item, item.isMe && styles.meItem]}>
      <View style={styles.rankContainer}>
        {index < 3 ? (
          <Trophy color={index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32'} size={24} />
        ) : (
          <Text style={styles.rankText}>{index + 1}</Text>
        )}
      </View>

      <View style={styles.nameContainer}>
        <Text style={[styles.name, item.isMe && styles.meText]}>{item.isMe ? 'You' : item.displayName}</Text>
        <Text style={styles.stats}>
          {item.gamesWon} win{item.gamesWon !== 1 ? 's' : ''} · {item.totalWinnings} sats
        </Text>
      </View>

      <View style={styles.scoreContainer}>
        <Text style={styles.ms}>{item.avgReactionTime ?? '—'}ms</Text>
        <Text style={styles.avgLabel}>average</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Loading…</Text>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No games played yet!</Text>
          <Text style={styles.emptySubText}>Play a game to appear on the leaderboard.</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.pubkey}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  list: {
    padding: 20,
  },
  item: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
    alignItems: 'center',
  },
  meItem: {
    borderColor: COLORS.primary,
    borderWidth: 1,
    backgroundColor: '#332a1e',
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
  },
  rankText: {
    color: COLORS.textSecondary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  nameContainer: {
    flex: 1,
    marginLeft: 15,
  },
  name: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  meText: {
    color: COLORS.primary,
  },
  stats: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  scoreContainer: {
    alignItems: 'flex-end',
  },
  ms: {
    color: COLORS.success,
    fontSize: 18,
    fontWeight: 'bold',
  },
  avgLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  emptySubText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});

export default LeaderboardScreen;
