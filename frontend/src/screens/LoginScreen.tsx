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
import { generateKeypair, saveKeypair, loadKeypair, pubkeyFromNsec } from '../services/auth';

const LoginScreen = ({ navigation }: any) => {
  const [pubkey, setPubkey] = useState('');
  const [lightningAddress, setLightningAddress] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [nsecInput, setNsecInput] = useState('');

  // Auto-generate a keypair on mount if none exists
  useEffect(() => {
    (async () => {
      const existing = await loadKeypair();
      if (existing) {
        setPubkey(existing.pubkey);
      } else {
        const kp = generateKeypair();
        await saveKeypair(kp.nsec, kp.pubkey);
        setPubkey(kp.pubkey);
      }
    })();
  }, []);

  const handleLogin = async () => {
    if (pubkey.length < 10) {
      Alert.alert('Error', 'Keypair not generated. Please restart the app.');
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
      await AsyncStorage.setItem('lightning_address', lightningAddress.trim());
      navigation.replace('Home');
    } catch (e) {
      Alert.alert('Error', 'Failed to save login data.');
    }
  };

  const handleImportNsec = async () => {
    const hex = nsecInput.trim();
    if (!/^[0-9a-f]{64}$/i.test(hex)) {
      Alert.alert('Invalid Key', 'Enter a 64-character hex private key.');
      return;
    }
    try {
      const derived = pubkeyFromNsec(hex);
      await saveKeypair(hex, derived);
      setPubkey(derived);
      setShowImport(false);
      setNsecInput('');
      Alert.alert('Imported', `Pubkey: ${derived.slice(0, 12)}...`);
    } catch {
      Alert.alert('Invalid Key', 'Could not derive a public key from this private key.');
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
          <Text style={styles.label}>Your Game Identity (pubkey)</Text>
          <View style={styles.pubkeyDisplay}>
            <Text style={styles.pubkeyText} selectable>
              {pubkey ? `${pubkey.slice(0, 16)}...${pubkey.slice(-8)}` : 'Generating...'}
            </Text>
          </View>

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

          <TouchableOpacity style={styles.nostrButton} onPress={() => setShowImport(!showImport)}>
            <Text style={styles.nostrButtonText}>Import Existing Key</Text>
          </TouchableOpacity>

          {showImport && (
            <View style={styles.importContainer}>
              <Text style={styles.label}>Private Key (64-char hex)</Text>
              <TextInput
                style={styles.input}
                placeholder="hex private key..."
                placeholderTextColor="#666"
                value={nsecInput}
                onChangeText={setNsecInput}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <TouchableOpacity style={styles.importButton} onPress={handleImportNsec}>
                <Text style={styles.loginButtonText}>Import</Text>
              </TouchableOpacity>
            </View>
          )}
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
  nostrButton: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  nostrButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  pubkeyDisplay: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#444',
    marginBottom: 12,
  },
  pubkeyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: 'monospace',
  },
  importContainer: {
    marginTop: 15,
  },
  importButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
});

export default LoginScreen;
