import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants/theme';
import { Zap } from 'lucide-react-native';
import { savePubkey, loadPubkey } from '../services/auth';

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/** Decode an npub1... bech32 string to a 64-char hex pubkey. */
function npubToHex(npub: string): string | null {
  try {
    if (!npub.startsWith('npub1')) return null;
    const data = npub.slice(5);
    const values: number[] = [];
    for (const c of data) {
      const v = BECH32_CHARSET.indexOf(c);
      if (v === -1) return null;
      values.push(v);
    }
    // Remove checksum (last 6 values)
    const payload = values.slice(0, -6);
    // Convert from 5-bit to 8-bit
    let bits = 0;
    let acc = 0;
    const bytes: number[] = [];
    for (const v of payload) {
      acc = (acc << 5) | v;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((acc >> bits) & 0xff);
      }
    }
    if (bytes.length !== 32) return null;
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

const LoginScreen = ({ navigation }: any) => {
  const [npub, setNpub] = useState('');
  const [lightningAddress, setLightningAddress] = useState('');

  // Load existing pubkey on mount
  useEffect(() => {
    (async () => {
      const existing = await loadPubkey();
      if (existing) {
        // Already logged in — go straight to Home
        navigation.replace('Home');
      }
    })();
  }, []);

  const handleLogin = async () => {
    const trimmed = npub.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Please enter your npub.');
      return;
    }

    // Accept either npub1... or raw 64-char hex
    let hex: string | null = null;
    if (/^[0-9a-f]{64}$/i.test(trimmed)) {
      hex = trimmed.toLowerCase();
    } else {
      hex = npubToHex(trimmed);
    }

    if (!hex) {
      Alert.alert('Invalid Key', 'Enter a valid npub (npub1...) or 64-character hex public key.');
      return;
    }

    // Validate lightning address format if provided
    if (lightningAddress && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lightningAddress.trim())) {
      Alert.alert(
        'Invalid Lightning Address',
        'Should look like user@wallet.com — leave blank to paste invoices manually when you win.'
      );
      return;
    }

    try {
      await savePubkey(hex);
      await AsyncStorage.setItem('lightning_address', lightningAddress.trim());
      navigation.replace('Home');
    } catch (e) {
      Alert.alert('Error', 'Failed to save login data.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoContainer}>
          <Zap size={80} color={COLORS.primary} fill={COLORS.primary} />
          <Text style={styles.title}>LIGHTNING</Text>
          <Text style={styles.subtitle}>REACTION TOURNAMENT</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Your Nostr Public Key</Text>
          <TextInput
            style={styles.input}
            placeholder="npub1... or 64-char hex"
            placeholderTextColor="#666"
            value={npub}
            onChangeText={setNpub}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>
            Lightning Address{' '}
            <Text style={styles.labelOptional}>(recommended — for instant payouts)</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="you@walletofsatoshi.com"
            placeholderTextColor="#666"
            value={lightningAddress}
            onChangeText={setLightningAddress}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <Text style={styles.hint}>
            If you win, your prize will be sent here automatically. Get a free address at
            walletofsatoshi.com, getalby.com, or strike.me.
          </Text>

          <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
            <Text style={styles.loginButtonText}>Enter Arena</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 50,
  },
  title: {
    fontSize: 42,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 2,
    marginTop: 10,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: 'bold',
    letterSpacing: 4,
  },
  form: {
    width: '100%',
  },
  label: {
    color: COLORS.textSecondary,
    marginBottom: 8,
    fontSize: 14,
  },
  labelOptional: {
    color: COLORS.primary,
    fontSize: 12,
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    color: COLORS.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#444',
    marginBottom: 12,
  },
  hint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginBottom: 24,
    lineHeight: 18,
  },
  loginButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 15,
  },
  loginButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default LoginScreen;
