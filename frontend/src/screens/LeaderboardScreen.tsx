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

const LeaderboardScreen = ({ navigation }: any) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const myPubkey = await AsyncStorage.getItem('user_pubkey');
      const resp = await fetch(`${API_URL}/api/leaderboard`);
      if (!resp.ok) return;
      const data = await resp.json();

      const mapped: LeaderboardEntry[] = (data || []).map((entry: any) => ({
        pubkey: entry.pubkey,
        displayName: `${entry.pubkey.slice(0, 12)}…${entry.pubkey.slice(-4)}`,
        gamesWon: entry.gamesWon ?? 0,
        avgReactionTime: entry.avgReactionTime ? Math.round(entry.avgReactionTime) : null,
        totalWinnings: entry.totalWinnings ?? 0,
        isMe: entry.pubkey === myPubkey,
      }));

      setEntries(mapped);
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
        <Text style={styles.stats}>{item.gamesWon} wins</Text>
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
