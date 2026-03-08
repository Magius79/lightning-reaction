import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  ScrollView,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { COLORS, API_URL } from '../constants/theme';
import { X, Zap, CheckCircle2 } from 'lucide-react-native';

interface PaymentModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (result: { roomId: string; paymentHash: string }) => void;
  pubkey: string;
}

type PayStatus = 'loading' | 'pending' | 'success' | 'error';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // stop polling after 5 minutes

const PaymentModal = ({ visible, onClose, onSuccess, pubkey }: PaymentModalProps) => {
  const [invoice, setInvoice] = useState<string | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PayStatus>('loading');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (hash: string, rid: string) => {
    stopPolling();
    pollStartRef.current = Date.now();

    pollRef.current = setInterval(async () => {
      // Stop after timeout to avoid polling forever
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        stopPolling();
        setError('Invoice expired. Please try again.');
        setStatus('error');
        return;
      }

      try {
        const resp = await fetch(`${API_URL}/api/rooms/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentHash: hash }),
        });

        if (!resp.ok && resp.status !== 202) return; // transient error — keep polling

        const data = await resp.json();
        if (data.paid) {
          stopPolling();
          setStatus('success');
          setTimeout(() => onSuccess({ roomId: rid, paymentHash: hash }), 800);
        }
      } catch {
        // Network blip — keep polling silently
      }
    }, POLL_INTERVAL_MS);
  };

  useEffect(() => {
    if (!visible) {
      stopPolling();
      setInvoice(null);
      setPaymentHash(null);
      setRoomId(null);
      setError(null);
      setStatus('loading');
      return;
    }

    if (!pubkey || pubkey.length < 16) {
      setStatus('loading');
      return;
    }

    void fetchInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, pubkey]);

  // Clean up on unmount
  useEffect(() => () => stopPolling(), []);

  const fetchInvoice = async () => {
    try {
      stopPolling();
      setStatus('loading');
      setError(null);

      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 15000);

      const resp = await fetch(`${API_URL}/api/rooms/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pubkey }),
        signal: controller.signal,
      });

      clearTimeout(t);

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`join failed (${resp.status}): ${txt}`);
      }

      const data = await resp.json(); // { invoice, roomId, paymentHash, credit? }

      // Player has a credit from a timed-out room — skip payment
      if (data.credit) {
        setRoomId(data.roomId);
        setPaymentHash(data.paymentHash);
        setStatus('success');
        setTimeout(() => onSuccess({ roomId: data.roomId, paymentHash: data.paymentHash }), 800);
        return;
      }

      setInvoice(data.invoice);
      setRoomId(data.roomId);
      setPaymentHash(data.paymentHash);
      setStatus('pending');

      // Start auto-polling as soon as invoice is ready
      startPolling(data.paymentHash, data.roomId);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStatus('error');
    }
  };

  const openWallet = async () => {
    if (!invoice) return;
    try {
      await Linking.openURL(`lightning:${invoice}`);
    } catch {
      Alert.alert('No Lightning wallet found', 'Try scanning the QR code with your Lightning wallet.');
    }
  };

  // Manual fallback: user taps "I paid" if auto-poll hasn't caught it yet
  const confirmPaid = async () => {
    if (!paymentHash || !roomId) return;
    try {
      setStatus('loading');
      stopPolling();

      const resp = await fetch(`${API_URL}/api/rooms/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentHash }),
      });

      if (!resp.ok && resp.status !== 202) {
        const txt = await resp.text();
        throw new Error(`confirm failed (${resp.status}): ${txt}`);
      }

      const data = await resp.json();

      if (data.paid) {
        setStatus('success');
        setTimeout(() => onSuccess({ roomId, paymentHash }), 800);
      } else {
        // Resume auto-polling and let the user know
        setStatus('pending');
        startPolling(paymentHash, roomId);
        Alert.alert('Not yet', 'Payment not detected yet — we\'ll keep checking automatically.');
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStatus('error');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Entry Fee</Text>
            <TouchableOpacity onPress={onClose}>
              <X color={COLORS.textSecondary} size={24} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ width: '100%', flex: 1 }}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {status === 'loading' && <ActivityIndicator size="large" color={COLORS.primary} />}

            {status === 'error' && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Payment error</Text>
                <Text style={styles.errorText}>{error || 'Unknown error'}</Text>
                <TouchableOpacity style={styles.walletButton} onPress={fetchInvoice}>
                  <Text style={[styles.walletButtonText, { marginLeft: 0 }]}>Try again</Text>
                </TouchableOpacity>
              </View>
            )}

            {status === 'pending' && invoice && (
              <>
                <View style={styles.qrContainer}>
                  <QRCode value={invoice} size={200} color="black" backgroundColor="white" />
                </View>

                <Text style={styles.amount}>100 SATS</Text>
                <Text style={styles.label}>Scan with any Lightning wallet</Text>
                <Text style={styles.pollingLabel}>Waiting for payment…</Text>

                <View style={styles.buttonsContainer}>
                  <TouchableOpacity style={styles.walletButton} onPress={openWallet}>
                    <Zap size={20} color="#000" fill="#000" />
                    <Text style={styles.walletButtonText}>Open in Wallet</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={[styles.walletButton, styles.checkButton]} onPress={confirmPaid}>
                    <Text style={[styles.walletButtonText, { marginLeft: 0, color: '#fff' }]}>I paid — check now</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {status === 'success' && (
              <View style={styles.successContainer}>
                <CheckCircle2 color={COLORS.success} size={80} />
                <Text style={styles.successText}>Payment received!</Text>
                <Text style={styles.successSub}>Entering the arena…</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 25,
    paddingBottom: 40,
    minHeight: 500,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  qrContainer: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 20,
    marginBottom: 20,
    marginTop: 8,
  },
  amount: {
    color: COLORS.primary,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 5,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginBottom: 8,
    textAlign: 'center',
  },
  pollingLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: 24,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  buttonsContainer: {
    width: '100%',
    marginTop: 8,
  },
  walletButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 15,
    width: '100%',
    justifyContent: 'center',
  },
  walletButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  checkButton: {
    marginTop: 14,
    marginBottom: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  successContainer: {
    alignItems: 'center',
    paddingTop: 18,
  },
  successText: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
    textAlign: 'center',
  },
  successSub: {
    color: COLORS.textSecondary,
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  errorBox: {
    width: '100%',
    gap: 12,
    paddingTop: 10,
  },
  errorTitle: {
    color: COLORS.danger,
    fontWeight: '700',
    fontSize: 16,
  },
  errorText: {
    color: COLORS.textSecondary,
  },
});

export default PaymentModal;
