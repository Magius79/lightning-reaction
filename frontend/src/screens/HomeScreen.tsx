import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants/theme';
import { Zap, Trophy, BarChart2, Settings, User } from 'lucide-react-native';

const HomeScreen = ({ navigation }: any) => {
  const [stats, setStats] = useState({
    played: 12,
    won: 3,
    avgReaction: 245,
  });
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    // Fetch stats from backend
    setTimeout(() => setRefreshing(false), 1000);
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
            <User color={COLORS.textSecondary} size={30} />
          </View>
          <View>
            <Text style={styles.welcomeText}>Welcome back,</Text>
            <Text style={styles.pubkeyText}>Lightning Legend</Text>
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
        
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.leaderboardItem}>
            <Text style={styles.rank}>#{i}</Text>
            <Text style={styles.name}>Player_{i}42</Text>
            <Text style={styles.score}>210ms</Text>
          </View>
        ))}
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
