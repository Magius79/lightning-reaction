import React, { useState } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Image } from 'react-native';
import { COLORS } from '../constants/theme';
import { Trophy, ArrowLeft, RefreshCw } from 'lucide-react-native';

const MOCK_LEADERBOARD = [
  { id: '1', name: 'Satoshi_Nakamoto', wins: 42, avgMs: 185 },
  { id: '2', name: 'ReactionGod', wins: 38, avgMs: 192 },
  { id: '3', name: 'Zapper99', wins: 31, avgMs: 205 },
  { id: '4', name: 'LightningFast', wins: 25, avgMs: 215 },
  { id: '5', name: 'BitRunner', wins: 22, avgMs: 218 },
  { id: '6', name: 'NoLagNode', wins: 19, avgMs: 225 },
  { id: '7', name: 'PlebOne', wins: 15, avgMs: 232 },
  { id: '8', name: 'FastFingers', wins: 12, avgMs: 240 },
  { id: '9', name: 'Me', wins: 3, avgMs: 245, isMe: true },
  { id: '10', name: 'SlowPoke', wins: 1, avgMs: 450 },
];

const LeaderboardScreen = ({ navigation }: any) => {
  const [refreshing, setRefreshing] = useState(false);

  const renderItem = ({ item, index }: any) => (
    <View style={[styles.item, item.isMe && styles.meItem]}>
      <View style={styles.rankContainer}>
        {index < 3 ? (
          <Trophy color={index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32'} size={24} />
        ) : (
          <Text style={styles.rankText}>{index + 1}</Text>
        )}
      </View>
      
      <View style={styles.nameContainer}>
        <Text style={[styles.name, item.isMe && styles.meText]}>{item.name}</Text>
        <Text style={styles.stats}>{item.wins} wins</Text>
      </View>

      <View style={styles.scoreContainer}>
        <Text style={styles.ms}>{item.avgMs}ms</Text>
        <Text style={styles.avgLabel}>average</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={MOCK_LEADERBOARD}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={() => {}}
      />
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
});

export default LeaderboardScreen;
