import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Animated,
  Alert,
  Dimensions,
  AppState,
  Easing,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants/theme';
import { wsService } from '../services/websocket';
import { X, Users } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import PaymentModal from '../components/PaymentModal';
import PayoutModal from '../components/PayoutModal';

const { width } = Dimensions.get('window');

type GameStatus = 'waiting' | 'countdown' | 'wait' | 'ready' | 'result' | 'paying' | 'disqualified';

// Preload sounds
const sounds: Record<string, Audio.Sound | null> = {
  tap: null,
  win: null,
  lose: null,
  countdown: null,
};

async function loadSounds() {
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    // Using built-in system sounds via frequency-based approach
    // We'll generate simple tones programmatically
  } catch {
    // Audio not available — sounds disabled
  }
}

async function playSound(type: 'tap' | 'win' | 'lose' | 'countdown') {
  try {
    const frequency = type === 'tap' ? 800 : type === 'win' ? 1200 : type === 'lose' ? 300 : 600;
    const duration = type === 'win' ? 400 : type === 'lose' ? 500 : 150;

    const { sound } = await Audio.Sound.createAsync(
      { uri: `data:audio/wav;base64,${generateTone(frequency, duration)}` },
      { shouldPlay: true }
    );
    // Clean up after playing
    sound.setOnPlaybackStatusUpdate((s: any) => {
      if (s.didJustFinish) sound.unloadAsync();
    });
  } catch {
    // Silent fail — sounds are optional
  }
}

// Generate a simple WAV tone as base64
function generateTone(freq: number, durationMs: number): string {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const data = new Uint8Array(44 + numSamples);

  // WAV header
  const header = [
    0x52, 0x49, 0x46, 0x46, // RIFF
    ...intToBytes(36 + numSamples, 4), // file size - 8
    0x57, 0x41, 0x56, 0x45, // WAVE
    0x66, 0x6D, 0x74, 0x20, // fmt
    0x10, 0x00, 0x00, 0x00, // chunk size 16
    0x01, 0x00, // PCM
    0x01, 0x00, // mono
    ...intToBytes(sampleRate, 4), // sample rate
    ...intToBytes(sampleRate, 4), // byte rate
    0x01, 0x00, // block align
    0x08, 0x00, // bits per sample
    0x64, 0x61, 0x74, 0x61, // data
    ...intToBytes(numSamples, 4), // data size
  ];

  for (let i = 0; i < header.length; i++) data[i] = header[i];

  // Generate sine wave with fade out
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const fadeOut = 1 - (i / numSamples);
    const sample = Math.sin(2 * Math.PI * freq * t) * 127 * fadeOut + 128;
    data[44 + i] = Math.max(0, Math.min(255, Math.round(sample)));
  }

  // Convert to base64
  let binary = '';
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
  return btoa(binary);
}

function intToBytes(val: number, bytes: number): number[] {
  const result = [];
  for (let i = 0; i < bytes; i++) {
    result.push(val & 0xFF);
    val >>= 8;
  }
  return result;
}

// Pulsing dot component for waiting room
const PulsingDot = ({ delay = 0 }: { delay?: number }) => {
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 600, delay, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <Animated.View style={[styles.pulsingDot, { opacity: anim, transform: [{ scale: anim }] }]} />
  );
};

const GameScreen = ({ navigation }: any) => {
  const [status, setStatus] = useState<GameStatus>('paying');
  const [players, setPlayers] = useState<any[]>([]);
  const [countdown, setCountdown] = useState(0);
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [prizePool, setPrizePool] = useState<number | null>(null);

  // websocket `gameEnd` sends winner as pubkey string (or null)
  const [winnerPubkey, setWinnerPubkey] = useState<string | null>(null);

  const [showPayment, setShowPayment] = useState(true);
  const [pubkey, setPubkey] = useState<string>(''); // load from AsyncStorage

  // Payout UI state (winner pastes invoice)
  const [payoutVisible, setPayoutVisible] = useState(false);
  const [payoutRoomId, setPayoutRoomId] = useState<string | null>(null);
  const [payoutAmountSats, setPayoutAmountSats] = useState<number | null>(null);
  const [payoutResult, setPayoutResult] = useState<'none' | 'success' | 'failed'>('none');
  const [payoutError, setPayoutError] = useState<string | null>(null);

  // Waiting room timeout countdown
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const waitingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 0: dark, 1: red (wait), 2: green (tap)
  const bgAnim = useRef(new Animated.Value(0)).current;
  const currentRoomId = useRef<string | null>(null);
  const joinedAt = useRef<number>(0);
  const statusRef = useRef<GameStatus>('paying');
  const pubkeyRef = useRef<string>('');
  const ROOM_TIMEOUT_MS = 5 * 60 * 1000;

  // Result screen animations
  const resultScale = useRef(new Animated.Value(0)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;

  const resetForNewRound = () => {
    setPlayers([]);
    setCountdown(0);
    setWinnerPubkey(null);
    setReactionTime(null);
    setPrizePool(null);
    currentRoomId.current = null;
    joinedAt.current = 0;
    setWaitingSeconds(0);
    if (waitingTimer.current) clearInterval(waitingTimer.current);
    resultScale.setValue(0);
    resultOpacity.setValue(0);
    Animated.timing(bgAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  };

  // Keep statusRef in sync for use in socket callbacks
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    pubkeyRef.current = pubkey;
  }, [pubkey]);

  // Start/stop waiting room timer
  useEffect(() => {
    if (status === 'waiting') {
      setWaitingSeconds(0);
      waitingTimer.current = setInterval(() => {
        setWaitingSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (waitingTimer.current) {
        clearInterval(waitingTimer.current);
        waitingTimer.current = null;
      }
    }
    return () => {
      if (waitingTimer.current) clearInterval(waitingTimer.current);
    };
  }, [status]);

  useEffect(() => {
    loadSounds();

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
        if (data.countdown > 0) playSound('countdown');
      }
    };

    const onGameStart = (data: any) => {
      if (typeof data?.countdown === 'number') setCountdown(data.countdown);
      setStatus('countdown');
      playSound('countdown');
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      Animated.timing(bgAnim, {
        toValue: 2,
        duration: 50,
        useNativeDriver: false,
      }).start();
    };

    const onGameEnd = (data: any) => {
      const myPk = pubkey || 'anon';
      const won = data?.winner === myPk;

      setWinnerPubkey(data?.winner ?? null);
      setReactionTime(data?.reactionTime ?? null);
      setPrizePool(data?.prizePool ?? null);
      setStatus('result');

      // Sound + haptics
      if (won) {
        playSound('win');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        playSound('lose');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      // Animate result card
      resultScale.setValue(0.5);
      resultOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(resultScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(resultOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();

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
      setPayoutResult('none');
      setPayoutError(null);
      setPayoutVisible(true);
    };

    const onPayoutSent = (_data: any) => {
      setPayoutResult('success');
    };

    const onPayoutFailed = (data: any) => {
      setPayoutResult('failed');
      setPayoutError(data?.error || 'Unknown error');
    };

    const onRoomTimeout = (data: any) => {
      Alert.alert(
        'Room Timed Out',
        data?.message || 'No opponents joined. You have a free credit for your next game.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    };

    const onDisqualified = (_data: any) => {
      setStatus('disqualified');
      playSound('lose');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Animated.timing(bgAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    };

    // Make server rejections visible (RoomManager uses socket.emit('error', ...))
    // Transient reconnect errors (room/player not found) are silenced — they self-resolve.
    const SILENT_ERRORS = ['Room not found', 'Player not found in room'];
    const onWsError = (data: any) => {
      const msg = data?.message || JSON.stringify(data);
      console.log('WS error', msg);
      if (SILENT_ERRORS.some((e) => msg.includes(e))) return;
      Alert.alert('Error', msg);
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
    wsService.on('disqualified', onDisqualified);
    wsService.on('error', onWsError);

    // On socket reconnect, rejoin room if in active game, or check timeout
    const onReconnect = () => {
      const rid = currentRoomId.current;
      if (!rid || !joinedAt.current) return;

      const elapsed = Date.now() - joinedAt.current;

      // If waiting and timed out, show alert
      if (elapsed >= ROOM_TIMEOUT_MS && statusRef.current === 'waiting') {
        currentRoomId.current = null;
        joinedAt.current = 0;
        Alert.alert(
          'Room Timed Out',
          'No opponents joined. You have a free credit for your next game.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
        return;
      }

      // Otherwise rejoin the room so the server recognizes our new socket
      const pk = pubkeyRef.current || 'anon';
      console.log(`[GameScreen] Reconnected — rejoining room ${rid}`);
      wsService.rejoinRoom(pk, rid);
    };
    wsService.on('connect', onReconnect);

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
      wsService.off('disqualified');
      wsService.off('error');
      wsService.off('connect');

      wsService.leaveRoom();
      wsService.disconnect();
    };
  }, []);

  // Also check timeout when app comes back to foreground (phone wake)
  useEffect(() => {
    const handleAppState = (nextState: string) => {
      if (nextState === 'active' && currentRoomId.current && joinedAt.current) {
        const elapsed = Date.now() - joinedAt.current;
        if (elapsed >= ROOM_TIMEOUT_MS && statusRef.current === 'waiting') {
          currentRoomId.current = null;
          joinedAt.current = 0;
          Alert.alert(
            'Room Timed Out',
            'No opponents joined. You have a free credit for your next game.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [navigation]);

  const handleTap = () => {
    if (status === 'ready' || status === 'wait') {
      const ts = Date.now();
      playSound('tap');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      wsService.sendTap(ts);
    }
  };

  const handlePlayAgain = () => {
    // Per-round entry fee: force payment modal again
    wsService.leaveRoom();
    resetForNewRound();
    setShowPayment(true);
    setStatus('paying');
  };

  const isWinner = winnerPubkey && pubkey && winnerPubkey === pubkey;
  const timeRemaining = Math.max(0, 300 - waitingSeconds);
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;

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
            <View style={styles.waitingContainer}>
              <Text style={styles.statusTitle}>Waiting for players</Text>
              <View style={styles.pulsingDotsRow}>
                <PulsingDot delay={0} />
                <PulsingDot delay={200} />
                <PulsingDot delay={400} />
              </View>
              <Text style={styles.statusSubtitle}>Game starts with 2+ players</Text>
              <Text style={styles.timerText}>
                {minutes}:{seconds.toString().padStart(2, '0')}
              </Text>
            </View>
          )}

          {status === 'countdown' && <Text style={styles.countdownText}>{countdown}</Text>}
          {status === 'wait' && <Text style={styles.hugeText}>WAIT...</Text>}
          {status === 'ready' && <Text style={styles.hugeText}>TAP!</Text>}

          {status === 'disqualified' && (
            <View style={styles.resultContainer}>
              <Text style={[styles.resultTitle, { color: COLORS.danger }]}>
                DISQUALIFIED
              </Text>
              <Text style={styles.resultSubtitle}>
                You tapped too early! Waiting for the round to finish...
              </Text>
            </View>
          )}

          {status === 'result' && (
            <Animated.View
              style={[
                styles.resultContainer,
                { opacity: resultOpacity, transform: [{ scale: resultScale }] },
              ]}
            >
              <Text style={[styles.resultTitle, { color: isWinner ? COLORS.primary : COLORS.danger }]}>
                {isWinner ? 'VICTORY!' : 'DEFEAT'}
              </Text>

              {reactionTime ? (
                <Text style={styles.reactionTimeText}>
                  {isWinner ? `You won in ${reactionTime}ms!` : `Winner: ${reactionTime}ms`}
                </Text>
              ) : null}

              {prizePool ? (
                <Text style={styles.prizeText}>
                  {isWinner ? `Prize: ${prizePool} sats` : `Pot was ${prizePool} sats`}
                </Text>
              ) : null}

              <Text style={styles.resultSubtitle}>
                {winnerPubkey
                  ? winnerPubkey === pubkey
                    ? 'Collect your winnings below'
                    : `Winner: ${winnerPubkey.slice(0, 8)}…`
                  : 'No winner'}
              </Text>

              <TouchableOpacity style={styles.actionButton} onPress={handlePlayAgain}>
                <Text style={styles.actionButtonText}>Play Again</Text>
              </TouchableOpacity>
            </Animated.View>
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
          currentRoomId.current = roomId;
          joinedAt.current = Date.now();

          // joinRoom expects { pubkey, paymentHash }
          wsService.joinRoom(pubkey || 'anon', paymentHash);
        }}
      />

      <PayoutModal
        visible={payoutVisible}
        roomId={payoutRoomId}
        amountSats={payoutAmountSats}
        onClose={() => setPayoutVisible(false)}
        payoutResult={payoutResult}
        payoutError={payoutError}
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

  // Waiting room
  waitingContainer: {
    alignItems: 'center',
    gap: 12,
  },
  statusTitle: { color: COLORS.text, fontSize: 24, fontWeight: 'bold' },
  statusSubtitle: { color: COLORS.textSecondary, fontSize: 16 },
  pulsingDotsRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 8,
  },
  pulsingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },
  timerText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: 'monospace',
    marginTop: 4,
  },

  countdownText: { color: COLORS.primary, fontSize: 120, fontWeight: '900' },
  hugeText: { color: '#000', fontSize: 80, fontWeight: '900' },

  resultContainer: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 40,
    borderRadius: 30,
    width: width * 0.85,
  },

  resultTitle: { fontSize: 36, fontWeight: '900' },
  reactionTimeText: {
    color: COLORS.success,
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 10,
  },
  prizeText: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 6,
  },
  resultSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 15,
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
