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
  Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants/theme';
import { wsService } from '../services/websocket';
import { X, Users, Share2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import PaymentModal from '../components/PaymentModal';
import PayoutModal from '../components/PayoutModal';

const { width } = Dimensions.get('window');

type GameStatus = 'waiting' | 'countdown' | 'wait' | 'ready' | 'result' | 'paying' | 'disqualified';

const BOT_PUBKEY = 'bot_lightning_reaction';
function displayName(pubkey: string): string {
  if (pubkey === BOT_PUBKEY) return '⚡ LR Bot';
  return `${pubkey.slice(0, 8)}…`;
}

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

const GameScreen = ({ navigation, route }: any) => {
  const freeplay = route?.params?.freeplay === true;
  const [status, setStatus] = useState<GameStatus>(freeplay ? 'waiting' : 'paying');
  const [players, setPlayers] = useState<any[]>([]);
  const [countdown, setCountdown] = useState(0);
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [prizePool, setPrizePool] = useState<number | null>(null);

  // websocket `gameEnd` sends winner as pubkey string (or null)
  const [winnerPubkey, setWinnerPubkey] = useState<string | null>(null);

  const [showPayment, setShowPayment] = useState(!freeplay);
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

  // Bot warning countdown (paid rooms only)
  const [botCountdown, setBotCountdown] = useState<number | null>(null);
  const botCountdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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
    setBotCountdown(null);
    if (botCountdownTimer.current) clearInterval(botCountdownTimer.current);
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

  // Freeplay: join immediately once pubkey is loaded and socket connected
  useEffect(() => {
    if (!freeplay || !pubkey || pubkey === 'anon') return;
    const timer = setTimeout(() => {
      joinedAt.current = Date.now();
      wsService.joinFreeplay(pubkey);
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freeplay, pubkey]);

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
    let cancelled = false;
    loadSounds();

    const setup = async () => {
      // Load pubkey before connecting so we can send it with auth
      try {
        const pk = await AsyncStorage.getItem('user_pubkey');
        if (cancelled) return;
        setPubkey(pk || 'anon');
      } catch {
        if (cancelled) return;
        setPubkey('anon');
      }

      // Wait for socket to be ready before registering listeners
      await wsService.connect();
      if (cancelled) return;

    const onRoomUpdated = (data: any) => {
      if (Array.isArray(data?.players)) setPlayers(data.players);

      // Capture the actual room ID from the WebSocket server
      // (may differ from the backend's room ID used during payment)
      if (data?.roomId) {
        currentRoomId.current = data.roomId;
      }

      if (data?.status) {
        // Map server-side 'finished' to the frontend 'result' status.
        // Also never override a result/disqualified screen with a stale roomUpdated.
        const incoming = data.status === 'finished' ? 'result' : data.status;
        const protected_ = ['result', 'disqualified'];
        setStatus((prev) => protected_.includes(prev) ? prev : incoming);
      }

      // countdown ticks come via roomUpdated
      if (typeof data?.countdown === 'number') {
        setCountdown(data.countdown);
        if (data.countdown > 0) playSound('countdown');
      }
    };

    const onGameStart = (data: any) => {
      if (typeof data?.countdown === 'number') setCountdown(data.countdown);
      // Clear bot warning — game is starting (opponent or bot joined)
      setBotCountdown(null);
      if (botCountdownTimer.current) {
        clearInterval(botCountdownTimer.current);
        botCountdownTimer.current = null;
      }
      setStatus('countdown');
      playSound('countdown');
    };

    const onShowWait = () => {
      if (statusRef.current === 'disqualified') return;
      setStatus('wait');
      Animated.timing(bgAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }).start();
    };

    const onShowGreen = () => {
      if (statusRef.current === 'disqualified') return;
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

    const onPayoutExpired = (data: any) => {
      setPayoutVisible(false);
      Alert.alert(
        'Payout Expired',
        data?.message || 'You did not claim your winnings in time.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
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

    // Bot warning: server says a bot will join in N seconds
    const onBotWarning = (data: any) => {
      const seconds = data?.countdownSeconds ?? 10;
      setBotCountdown(seconds);
      // Tick down every second
      if (botCountdownTimer.current) clearInterval(botCountdownTimer.current);
      let remaining = seconds;
      botCountdownTimer.current = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(botCountdownTimer.current!);
          botCountdownTimer.current = null;
          setBotCountdown(null);
        } else {
          setBotCountdown(remaining);
        }
      }, 1000);
    };

    const onWaitingCancelled = (data: any) => {
      setBotCountdown(null);
      if (botCountdownTimer.current) {
        clearInterval(botCountdownTimer.current);
        botCountdownTimer.current = null;
      }
      Alert.alert(
        'Refunded',
        data?.message || 'Your credit is ready for your next game.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    };

    // Make server rejections visible (RoomManager uses socket.emit('error', ...))
    const onWsError = (data: any) => {
      const msg = data?.message || '';
      // Silence harmless reconnect noise
      const silenced = ['Room not found', 'Player not found in room'];
      if (silenced.some((s) => msg.includes(s))) {
        console.log('WS error (silenced)', msg);
        return;
      }
      console.log('WS error', data);
      Alert.alert('WS error', msg || JSON.stringify(data));
    };

    wsService.on('roomUpdated', onRoomUpdated);
    wsService.on('gameStart', onGameStart);
    wsService.on('showWait', onShowWait);
    wsService.on('showGreen', onShowGreen);
    wsService.on('gameEnd', onGameEnd);

    wsService.on('payoutRequested', onPayoutRequested);
    wsService.on('payoutSent', onPayoutSent);
    wsService.on('payoutFailed', onPayoutFailed);
    wsService.on('payoutExpired', onPayoutExpired);
    wsService.on('roomTimeout', onRoomTimeout);
    wsService.on('disqualified', onDisqualified);
    wsService.on('botWarning', onBotWarning);
    wsService.on('waitingCancelled', onWaitingCancelled);
    wsService.on('error', onWsError);

    // On socket reconnect, rejoin room if in active game, or check timeout
    const onReconnect = () => {
      const rid = currentRoomId.current;
      if (!rid || !joinedAt.current) return;

      // Don't rejoin if the game is already finished
      if (statusRef.current === 'result' || statusRef.current === 'paying') return;

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
    }; // end setup()

    setup();

    return () => {
      cancelled = true;
      // Avoid duplicate listeners if screen remounts
      wsService.off('roomUpdated');
      wsService.off('gameStart');
      wsService.off('showWait');
      wsService.off('showGreen');
      wsService.off('gameEnd');

      wsService.off('payoutRequested');
      wsService.off('payoutSent');
      wsService.off('payoutFailed');
      wsService.off('payoutExpired');
      wsService.off('roomTimeout');
      wsService.off('disqualified');
      wsService.off('botWarning');
      wsService.off('waitingCancelled');
      wsService.off('error');
      wsService.off('connect');

      if (botCountdownTimer.current) clearInterval(botCountdownTimer.current);

      // Only send leaveRoom if still waiting — once the game has started
      // (countdown/wait/ready/result), let the server handle cleanup via
      // its disconnect timeout. This prevents rapid join/leave cycles on
      // remount from burning through credits.
      if (statusRef.current === 'waiting') {
        wsService.leaveRoom();
      }
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
    if (status === 'ready') {
      const ts = Date.now();
      playSound('tap');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      wsService.sendTap(ts);
    }
  };

  const handlePlayAgain = () => {
    // Don't call leaveRoom() here — the finished room is already handled by
    // the payout timeout, and the explicit leave races with the next joinRoom,
    // causing the player to be removed from the new room they just entered.
    resetForNewRound();
    setShowPayment(true);
    setStatus('paying');
  };

  const handleShareWin = async () => {
    const timeStr = reactionTime ? `in ${reactionTime}ms ` : '';
    const satsStr = prizePool ? `${prizePool} sats` : 'sats';
    const message = `⚡ I just won ${satsStr} ${timeStr}on Lightning Reaction! Think you can beat me?\n\nDownload on Zapstore and challenge me! 🎮⚡\nhttps://zapstore.dev`;
    try {
      await Share.share({ message });
    } catch (e) {
      // User cancelled or share failed — no action needed
    }
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

              {botCountdown !== null && !freeplay && (
                <View style={styles.botWarningContainer}>
                  <Text style={styles.botWarningText}>
                    Bot joining in {botCountdown}s...
                  </Text>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => wsService.cancelWaiting()}
                  >
                    <Text style={styles.cancelButtonText}>Cancel & Refund</Text>
                  </TouchableOpacity>
                </View>
              )}
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

              {!freeplay && prizePool ? (
                <Text style={styles.prizeText}>
                  {isWinner ? `Prize: ${prizePool} sats` : `Pot was ${prizePool} sats`}
                </Text>
              ) : null}

              {!freeplay && winnerPubkey && winnerPubkey !== pubkey ? (
                <Text style={styles.resultSubtitle}>
                  {`Winner: ${displayName(winnerPubkey)}`}
                </Text>
              ) : !freeplay && !winnerPubkey ? (
                <Text style={styles.resultSubtitle}>No winner</Text>
              ) : null}

              {freeplay ? (
                <>
                  <TouchableOpacity style={styles.actionButton} onPress={() => navigation.replace('Game', { freeplay: true })}>
                    <Text style={styles.actionButtonText}>Try Again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.playForRealButton} onPress={() => navigation.replace('Game')}>
                    <Text style={styles.playForRealText}>Play for Real Sats ⚡</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity style={styles.actionButton} onPress={handlePlayAgain}>
                    <Text style={styles.actionButtonText}>Play Again</Text>
                  </TouchableOpacity>

                  {isWinner && (
                    <TouchableOpacity style={styles.shareButton} onPress={handleShareWin}>
                      <Share2 size={18} color={COLORS.text} />
                      <Text style={styles.shareButtonText}>Share your win</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
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
          joinedAt.current = Date.now();

          // joinRoom expects { pubkey, paymentHash }
          // currentRoomId will be set by the first roomUpdated from the WS server
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
  botWarningContainer: {
    marginTop: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(247, 147, 26, 0.15)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  botWarningText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  cancelButton: {
    backgroundColor: COLORS.danger,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
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

  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  shareButtonText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  playForRealButton: {
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  playForRealText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '800',
  },
});

export default GameScreen;
