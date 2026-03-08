import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Animated,
  Alert,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants/theme';
import { wsService } from '../services/websocket';
import { X, Users } from 'lucide-react-native';
import PaymentModal from '../components/PaymentModal';
import PayoutModal from '../components/PayoutModal';

const { width } = Dimensions.get('window');

type GameStatus = 'waiting' | 'countdown' | 'wait' | 'ready' | 'result' | 'paying';

const GameScreen = ({ navigation }: any) => {
  const [status, setStatus] = useState<GameStatus>('paying');
  const [players, setPlayers] = useState<any[]>([]);
  const [countdown, setCountdown] = useState(0);

  // websocket `gameEnd` sends winner as pubkey string (or null)
  const [winnerPubkey, setWinnerPubkey] = useState<string | null>(null);

  const [showPayment, setShowPayment] = useState(true);
  const [pubkey, setPubkey] = useState<string>(''); // load from AsyncStorage

  // Payout UI state (winner pastes invoice)
  const [payoutVisible, setPayoutVisible] = useState(false);
  const [payoutRoomId, setPayoutRoomId] = useState<string | null>(null);
  const [payoutAmountSats, setPayoutAmountSats] = useState<number | null>(null);

  // 0: dark, 1: red (wait), 2: green (tap)
  const bgAnim = useRef(new Animated.Value(0)).current;

  const resetForNewRound = () => {
    setPlayers([]);
    setCountdown(0);
    setWinnerPubkey(null);
    Animated.timing(bgAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  };

  useEffect(() => {
    // Load pubkey early (avoid races)
    AsyncStorage.getItem('user_pubkey')
      .then((pk) => {
        if (pk) setPubkey(pk);
        else setPubkey('anon');
      })
      .catch(() => setPubkey('anon'));

    wsService.connect();

    const onRoomUpdated = (data: any) => {
      if (Array.isArray(data?.players)) setPlayers(data.players);
      if (data?.status) setStatus(data.status);

      // countdown ticks come via roomUpdated
      if (typeof data?.countdown === 'number') {
        setCountdown(data.countdown);
      }
    };

    const onGameStart = (data: any) => {
      if (typeof data?.countdown === 'number') setCountdown(data.countdown);
      setStatus('countdown');
    };

    const onShowWait = () => {
      setStatus('wait');
      Animated.timing(bgAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }).start();
    };

    const onShowGreen = () => {
      setStatus('ready');
      Animated.timing(bgAnim, {
        toValue: 2,
        duration: 50,
        useNativeDriver: false,
      }).start();
    };

    const onGameEnd = (data: any) => {
      // data.winner is a pubkey string (or null)
      setWinnerPubkey(data?.winner ?? null);
      setStatus('result');

      Animated.timing(bgAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: false,
      }).start();
    };

    // Winner payout flow
    const onPayoutRequested = (data: any) => {
      // { roomId, amountSats }
      setPayoutRoomId(data?.roomId ?? null);
      setPayoutAmountSats(typeof data?.amountSats === 'number' ? data.amountSats : null);
      setPayoutVisible(true);
    };

    const onPayoutSent = (data: any) => {
      setPayoutVisible(false);
      Alert.alert('Paid!', data?.duplicate ? 'Payout already sent.' : 'Payout sent.');
    };

    const onPayoutFailed = (data: any) => {
      Alert.alert('Payout failed', data?.error || 'Unknown error');
    };

    const onRoomTimeout = (data: any) => {
      Alert.alert(
        'Room Timed Out',
        data?.message || 'No opponents joined. You have a free credit for your next game.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    };

    // Make server rejections visible (RoomManager uses socket.emit('error', ...))
    const onWsError = (data: any) => {
      console.log('WS error', data);
      Alert.alert('WS error', data?.message || JSON.stringify(data));
    };

    wsService.on('roomUpdated', onRoomUpdated);
    wsService.on('gameStart', onGameStart);
    wsService.on('showWait', onShowWait);
    wsService.on('showGreen', onShowGreen);
    wsService.on('gameEnd', onGameEnd);

    wsService.on('payoutRequested', onPayoutRequested);
    wsService.on('payoutSent', onPayoutSent);
    wsService.on('payoutFailed', onPayoutFailed);
    wsService.on('roomTimeout', onRoomTimeout);
    wsService.on('error', onWsError);

    return () => {
      // Avoid duplicate listeners if screen remounts
      wsService.off('roomUpdated');
      wsService.off('gameStart');
      wsService.off('showWait');
      wsService.off('showGreen');
      wsService.off('gameEnd');

      wsService.off('payoutRequested');
      wsService.off('payoutSent');
      wsService.off('payoutFailed');
      wsService.off('roomTimeout');
      wsService.off('error');

      wsService.leaveRoom();
      wsService.disconnect();
    };
  }, []);

  const handleTap = () => {
    if (status === 'ready' || status === 'wait') {
      const ts = Date.now();
      wsService.sendTap(ts);

      if (status === 'wait') {
        Alert.alert('Too Early!', 'You tapped before the green signal.');
      }
    }
  };

  const handlePlayAgain = () => {
    // Per-round entry fee: force payment modal again
    wsService.leaveRoom();
    resetForNewRound();
    setShowPayment(true);
    setStatus('paying');
  };

  const backgroundColor = bgAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [COLORS.background, COLORS.danger, COLORS.success],
  });

  return (
    <Animated.View style={[styles.container, { backgroundColor }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <X color={COLORS.text} size={30} />
        </TouchableOpacity>

        <View style={styles.playerCount}>
          <Users color={COLORS.text} size={20} />
          <Text style={styles.playerCountText}>{players.length}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.tapArea} activeOpacity={1} onPress={handleTap}>
        <View style={styles.content}>
          {status === 'waiting' && (
            <>
              <Text style={styles.statusTitle}>Waiting for players...</Text>
              <Text style={styles.statusSubtitle}>Game starts with 2+ players</Text>
            </>
          )}

          {status === 'countdown' && <Text style={styles.countdownText}>{countdown}</Text>}
          {status === 'wait' && <Text style={styles.hugeText}>WAIT...</Text>}
          {status === 'ready' && <Text style={styles.hugeText}>TAP!</Text>}

          {status === 'result' && (
            <View style={styles.resultContainer}>
              <Text style={styles.resultTitle}>
                {winnerPubkey && pubkey && winnerPubkey === pubkey ? 'VICTORY!' : 'DEFEAT'}
              </Text>

              <Text style={styles.resultSubtitle}>
                Winner:{' '}
                {winnerPubkey
                  ? winnerPubkey === pubkey
                    ? 'You'
                    : `${winnerPubkey.slice(0, 8)}…`
                  : 'No winner'}
              </Text>

              <TouchableOpacity style={styles.actionButton} onPress={handlePlayAgain}>
                <Text style={styles.actionButtonText}>Play Again</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <PaymentModal
        visible={showPayment && pubkey.length >= 3}
        pubkey={pubkey || 'anon'}
        onClose={() => {
          setShowPayment(false);
          navigation.goBack();
        }}
        onSuccess={({ roomId, paymentHash }) => {
          console.log('paid:', roomId, paymentHash);
          setShowPayment(false);
          setStatus('waiting');

          // joinRoom expects { pubkey, paymentHash }
          wsService.joinRoom(pubkey || 'anon', paymentHash);
        }}
      />

      <PayoutModal
        visible={payoutVisible}
        roomId={payoutRoomId}
        amountSats={payoutAmountSats}
        onClose={() => setPayoutVisible(false)}
        onSubmit={(bolt11: string) => {
          if (!payoutRoomId) return;
          wsService.submitPayoutInvoice(payoutRoomId, bolt11, pubkey || 'anon');
        }}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 20,
    zIndex: 10,
  },

  playerCount: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  playerCountText: {
    color: COLORS.text,
    marginLeft: 6,
    fontWeight: 'bold',
  },

  tapArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  content: { alignItems: 'center' },

  statusTitle: { color: COLORS.text, fontSize: 24, fontWeight: 'bold' },
  statusSubtitle: { color: COLORS.textSecondary, fontSize: 16, marginTop: 8 },

  countdownText: { color: COLORS.primary, fontSize: 120, fontWeight: '900' },
  hugeText: { color: '#000', fontSize: 80, fontWeight: '900' },

  resultContainer: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 40,
    borderRadius: 30,
    width: width * 0.8,
  },

  resultTitle: { color: COLORS.text, fontSize: 32, fontWeight: 'bold' },
  resultSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 18,
    marginVertical: 10,
    textAlign: 'center',
  },

  actionButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 12,
    marginTop: 20,
  },

  actionButtonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
});

export default GameScreen;
