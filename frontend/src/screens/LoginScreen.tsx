import React, { useState } from 'react';
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

const LoginScreen = ({ navigation }: any) => {
  const [pubkey, setPubkey] = useState('');
  const [lightningAddress, setLightningAddress] = useState('');

  const handleLogin = async () => {
    if (pubkey.length < 10) {
      Alert.alert('Invalid Pubkey', 'Please enter a valid Nostr pubkey.');
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
      await AsyncStorage.setItem('user_pubkey', pubkey.trim());
      await AsyncStorage.setItem('lightning_address', lightningAddress.trim());
      navigation.replace('Home');
    } catch (e) {
      Alert.alert('Error', 'Failed to save login data.');
    }
  };

  const handleNostrLogin = () => {
    Alert.alert(
      'Nostr extension',
      'NIP-07 not available in mobile context. Please paste your pubkey for now.'
    );
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
          <Text style={styles.label}>Nostr Public Key (npub or hex)</Text>
          <TextInput
            style={styles.input}
            placeholder="npub1..."
            placeholderTextColor="#666"
            value={pubkey}
            onChangeText={setPubkey}
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

          <TouchableOpacity style={styles.nostrButton} onPress={handleNostrLogin}>
            <Text style={styles.nostrButtonText}>Connect with Nostr</Text>
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
});

export default LoginScreen;
