import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, RefreshControl, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, API_URL } from '../constants/theme';
import { Zap, Trophy, BarChart2, Settings, User } from 'lucide-react-native';

// Decode npub bech32 to hex pubkey
function npubToHex(npub: string): string | null {
  try {
    if (!npub.startsWith('npub1')) return null;
    const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
    const data = npub.slice(5); // remove 'npub1'
    const values: number[] = [];
    for (const c of data) {
      const v = CHARSET.indexOf(c);
      if (v === -1) return null;
      values.push(v);
    }
    // Convert 5-bit groups to 8-bit (skip checksum last 6 values)
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

// Fetch Nostr profile (kind 0) from relay
function fetchNostrProfile(hexPubkey: string, timeoutMs = 5000): Promise<{ name?: string; display_name?: string; picture?: string } | null> {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket('wss://relay.damus.io');
      const timer = setTimeout(() => {
        ws.close();
        resolve(null);
      }, timeoutMs);

      ws.onopen = () => {
        const subId = 'profile_' + Date.now();
        ws.send(JSON.stringify(['REQ', subId, { kinds: [0], authors: [hexPubkey], limit: 1 }]));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg[0] === 'EVENT' && msg[2]?.content) {
            const profile = JSON.parse(msg[2].content);
            clearTimeout(timer);
            ws.close();
            resolve(profile);
          } else if (msg[0] === 'EOSE') {
            clearTimeout(timer);
            ws.close();
            resolve(null);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

const HomeScreen = ({ navigation }: any) => {
  const [displayName, setDisplayName] = useState('');
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [stats, setStats] = useState({
    played: 0,
    won: 0,
    avgReaction: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [topPlayers, setTopPlayers] = useState<any[]>([]);

  const loadProfile = async () => {
    try {
      const pubkey = await AsyncStorage.getItem('user_pubkey');
      if (!pubkey) return;

      // Show shortened npub immediately as fallback
      setDisplayName(`${pubkey.slice(0, 12)}…${pubkey.slice(-4)}`);

      // Try to fetch Nostr display name and picture
      const hex = npubToHex(pubkey);
      if (hex) {
        const profile = await fetchNostrProfile(hex);
        const name = profile?.display_name || profile?.name;
        if (name) {
          setDisplayName(name);
        }
        if (profile?.picture) {
          setProfilePic(profile.picture);
        }
      }
    } catch {
      setDisplayName('Player');
    }
  };

  const fetchStats = async () => {
    try {
      const pubkey = await AsyncStorage.getItem('user_pubkey');
      if (!pubkey) return;
      const resp = await fetch(`${API_URL}/api/players/${pubkey}`);
      if (resp.ok) {
        const data = await resp.json();
        setStats({
          played: data.games_played ?? 0,
          won: data.games_won ?? 0,
          avgReaction: data.avg_reaction_time ? Math.round(data.avg_reaction_time) : 0,
        });
      }
    } catch {
      // Keep defaults
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const resp = await fetch(`${API_URL}/api/leaderboard?limit=3`);
      if (resp.ok) {
        const data = await resp.json();
        setTopPlayers(data || []);
      }
    } catch {
      // Keep empty
    }
  };

  useEffect(() => {
    loadProfile();
    fetchStats();
    fetchLeaderboard();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStats(), fetchLeaderboard()]);
    setRefreshing(false);
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['user_pubkey', 'lightning_address']);
    navigation.replace('Login');
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      <View style={styles.header}>
        <View style={styles.profileInfo}>
          <View style={styles.avatarContainer}>
            {profilePic ? (
              <Image source={{ uri: profilePic }} style={styles.avatarImage} />
            ) : (
              <User color={COLORS.textSecondary} size={30} />
            )}
          </View>
          <View>
            <Text style={styles.welcomeText}>Welcome back,</Text>
            <Text style={styles.pubkeyText}>{displayName || 'Player'}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={logout}>
          <Settings color={COLORS.textSecondary} size={24} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <StatCard label="Played" value={stats.played.toString()} icon={<Zap color={COLORS.primary} size={20} />} />
        <StatCard label="Won" value={stats.won.toString()} icon={<Trophy color="#FFD700" size={20} />} />
        <StatCard label="Avg MS" value={stats.avgReaction.toString()} icon={<BarChart2 color={COLORS.success} size={20} />} />
      </View>

      <View style={styles.playContainer}>
        <Text style={styles.sectionTitle}>Ready to Play?</Text>
        <TouchableOpacity 
          style={styles.playButton} 
          onPress={() => navigation.navigate('Game')}
        >
          <Text style={styles.playButtonText}>PLAY NOW</Text>
          <Text style={styles.feeText}>Entry: 100 sats</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.leaderboardPreview}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Global Leaderboard</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Leaderboard')}>
            <Text style={styles.seeAll}>See All</Text>
          </TouchableOpacity>
        </View>
        
        {topPlayers.length > 0 ? topPlayers.map((p: any, i: number) => (
          <View key={p.pubkey} style={styles.leaderboardItem}>
            <Text style={styles.rank}>#{i + 1}</Text>
            <Text style={styles.name}>{`${p.pubkey.slice(0, 10)}…`}</Text>
            <Text style={styles.score}>{p.avgReactionTime ? `${Math.round(p.avgReactionTime)}ms` : '—'}</Text>
          </View>
        )) : (
          <View style={styles.leaderboardItem}>
            <Text style={styles.name}>No games played yet</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const StatCard = ({ label, value, icon }: any) => (
  <View style={styles.statCard}>
    {icon}
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  welcomeText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  pubkeyText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  statCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 15,
    width: '30%',
    alignItems: 'center',
  },
  statValue: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginVertical: 4,
  },
  statLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  playContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  playButton: {
    backgroundColor: COLORS.primary,
    width: '100%',
    padding: 25,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  playButtonText: {
    color: '#000',
    fontSize: 28,
    fontWeight: '900',
  },
  feeText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 4,
    opacity: 0.8,
  },
  leaderboardPreview: {
    marginBottom: 30,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  seeAll: {
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  leaderboardItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  rank: {
    color: COLORS.primary,
    fontWeight: 'bold',
    width: 30,
  },
  name: {
    color: COLORS.text,
    flex: 1,
  },
  score: {
    color: COLORS.success,
    fontWeight: 'bold',
  },
});

export default HomeScreen;
