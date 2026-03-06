import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants/theme';
import { X, CheckCircle2, Zap } from 'lucide-react-native';

type Props = {
  visible: boolean;
  roomId: string | null;
  amountSats: number | null;
  onClose: () => void;
  onSubmit: (bolt11: string) => void;
};

type PayoutStatus = 'idle' | 'resolving' | 'submitting' | 'success' | 'error';

// Resolve a Lightning Address (user@domain.com) to a BOLT11 invoice for amountSats.
async function resolveToInvoice(lightningAddress: string, amountSats: number): Promise<string> {
  const [user, domain] = lightningAddress.split('@');
  if (!user || !domain) throw new Error('Invalid Lightning Address format');

  // Step 1: fetch LNURL-pay metadata
  const metaUrl = `https://${domain}/.well-known/lnurlp/${user}`;
  const metaResp = await fetch(metaUrl);
  if (!metaResp.ok) throw new Error(`Could not reach ${domain} (${metaResp.status})`);

  const meta = await metaResp.json();
  if (meta.status === 'ERROR') throw new Error(meta.reason || 'LNURL error');

  const amountMsats = amountSats * 1000;
  if (amountMsats < meta.minSendable || amountMsats > meta.maxSendable) {
    throw new Error(
      `Amount ${amountSats} sats is outside wallet limits ` +
      `(${meta.minSendable / 1000}–${meta.maxSendable / 1000} sats)`
    );
  }

  // Step 2: fetch invoice from callback
  const sep = meta.callback.includes('?') ? '&' : '?';
  const invoiceResp = await fetch(`${meta.callback}${sep}amount=${amountMsats}`);
  if (!invoiceResp.ok) throw new Error(`Invoice fetch failed (${invoiceResp.status})`);

  const invoiceData = await invoiceResp.json();
  if (invoiceData.status === 'ERROR') throw new Error(invoiceData.reason || 'Invoice error');
  if (!invoiceData.pr) throw new Error('No invoice returned from wallet');

  return invoiceData.pr;
}

export default function PayoutModal({ visible, roomId, amountSats, onClose, onSubmit }: Props) {
  const [payoutStatus, setPayoutStatus] = useState<PayoutStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bolt11, setBolt11] = useState('');
  const [lightningAddress, setLightningAddress] = useState<string | null>(null);

  // Load stored lightning address when modal opens
  useEffect(() => {
    if (!visible) {
      setPayoutStatus('idle');
      setErrorMsg(null);
      setBolt11('');
      return;
    }

    AsyncStorage.getItem('lightning_address').then((addr) => {
      const trimmed = addr?.trim() || null;
      setLightningAddress(trimmed || null);

      // If we have an address and a valid amount, kick off auto-pay immediately
      if (trimmed && amountSats && amountSats > 0) {
        void autoPay(trimmed, amountSats);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, amountSats]);

  const autoPay = async (address: string, sats: number) => {
    try {
      setPayoutStatus('resolving');
      setErrorMsg(null);

      const invoice = await resolveToInvoice(address, sats);

      setPayoutStatus('submitting');
      onSubmit(invoice);

      // Success state is set by the parent via payoutSent WS event,
      // but we optimistically show it here after a short delay
      setTimeout(() => setPayoutStatus('success'), 1000);
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
      setPayoutStatus('error');
    }
  };

  const handleManualSubmit = () => {
    Keyboard.dismiss();
    const trimmed = bolt11.trim();

    if (!roomId) { Alert.alert('Error', 'No room ID for payout.'); return; }
    if (!amountSats || amountSats <= 0) { Alert.alert('Error', 'No payout amount.'); return; }
    if (!trimmed) { Alert.alert('Missing invoice', 'Paste a Lightning invoice first.'); return; }

    if (/^lnbc1[^0-9]/i.test(trimmed)) {
      Alert.alert(
        'Invoice needs an amount',
        `That invoice has no amount. Create one for exactly ${amountSats} sats.`
      );
      return;
    }

    if (!/^lnbc/i.test(trimmed)) {
      Alert.alert('Invalid invoice', 'Should start with lnbc...');
      return;
    }

    setPayoutStatus('submitting');
    onSubmit(trimmed);
    setTimeout(() => setPayoutStatus('success'), 1000);
  };

  const title = amountSats ? `You won ${amountSats} sats! ⚡` : 'You won!';

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()} accessible={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.overlay}
        >
          <View style={styles.modal}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <X color={COLORS.textSecondary} size={24} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ width: '100%' }}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* ── Auto-pay: resolving ── */}
              {(payoutStatus === 'resolving' || payoutStatus === 'submitting') && (
                <View style={styles.centeredBlock}>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                  <Text style={styles.autoPayLabel}>
                    {payoutStatus === 'resolving'
                      ? `Fetching invoice from ${lightningAddress}…`
                      : 'Sending your sats…'}
                  </Text>
                </View>
              )}

              {/* ── Success ── */}
              {payoutStatus === 'success' && (
                <View style={styles.centeredBlock}>
                  <CheckCircle2 color={COLORS.success} size={80} />
                  <Text style={styles.successText}>Sats sent!</Text>
                  <Text style={styles.successSub}>
                    {lightningAddress
                      ? `Paid to ${lightningAddress}`
                      : 'Payment submitted successfully'}
                  </Text>
                  <TouchableOpacity style={styles.button} onPress={onClose}>
                    <Text style={styles.buttonText}>Close</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ── Error from auto-pay — offer manual fallback ── */}
              {payoutStatus === 'error' && (
                <>
                  <View style={styles.errorBox}>
                    <Text style={styles.errorTitle}>Auto-pay failed</Text>
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                  <Text style={styles.fallbackLabel}>
                    Paste a BOLT11 invoice for {amountSats} sats instead:
                  </Text>
                  {renderManualInput()}
                </>
              )}

              {/* ── No lightning address stored — show manual UI ── */}
              {payoutStatus === 'idle' && !lightningAddress && renderManualInput()}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );

  function renderManualInput() {
    return (
      <>
        <TextInput
          style={styles.input}
          value={bolt11}
          onChangeText={setBolt11}
          placeholder="lnbc..."
          placeholderTextColor={COLORS.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity style={styles.button} onPress={handleManualSubmit}>
          <Zap size={18} color="#000" fill="#000" />
          <Text style={styles.buttonText}>Submit invoice</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Wallet → Receive → set amount to {amountSats} sats → copy invoice → paste above.
          {'\n'}Add a Lightning Address on the login screen to skip this next time.
        </Text>
      </>
    );
  }
}

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
    padding: 20,
    paddingBottom: 34,
    minHeight: 380,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
    flex: 1,
    marginRight: 12,
  },
  content: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  centeredBlock: {
    alignItems: 'center',
    paddingTop: 20,
    gap: 16,
    width: '100%',
  },
  autoPayLabel: {
    color: COLORS.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
  successText: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  successSub: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  errorBox: {
    width: '100%',
    marginBottom: 16,
    gap: 6,
  },
  errorTitle: {
    color: COLORS.danger,
    fontWeight: '700',
    fontSize: 15,
  },
  errorText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  fallbackLabel: {
    color: COLORS.textSecondary,
    width: '100%',
    marginBottom: 10,
    fontSize: 14,
  },
  input: {
    width: '100%',
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    color: COLORS.text,
    padding: 12,
    marginBottom: 14,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  buttonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '800',
  },
  hint: {
    color: COLORS.textSecondary,
    marginTop: 12,
    fontSize: 12,
    width: '100%',
    lineHeight: 18,
  },
});
