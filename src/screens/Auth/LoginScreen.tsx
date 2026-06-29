import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Appbar, Button, Checkbox, HelperText, TextInput, useTheme } from 'react-native-paper';

import { useAuth } from '../../auth/AuthContext';
import { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

// iOS devices can be Face ID or Touch ID; we can't tell which without the
// optional expo-local-authentication dep, so name both. Android shows a generic
// system biometric prompt.
const BIOMETRIC_LABEL = Platform.OS === 'ios' ? 'Face ID / Touch ID' : 'biometric unlock';

const LoginScreen = ({ navigation }: Props) => {
  const {
    login,
    unlockWithBiometrics,
    biometricAvailable = false,
    state,
  } = useAuth();
  const biometricEnabled = state?.biometricEnabled ?? false;
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useBiometric, setUseBiometric] = useState(false);

  // Show the enroll checkbox only on a capable device that hasn't opted in yet.
  // Once enrolled, show an "Unlock" retry button instead (e.g. after a cancelled
  // cold-boot prompt) — the two are mutually exclusive.
  const showEnroll = biometricAvailable && !biometricEnabled;
  const showUnlock = biometricAvailable && biometricEnabled && typeof unlockWithBiometrics === 'function';

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      // Only pass the opt-in when the enroll checkbox is shown — never overwrite
      // an existing preference on a plain password login (keeps the call 2-arg
      // for callers that don't enroll).
      if (showEnroll) {
        await login(email.trim(), password, { enableBiometric: useBiometric });
      } else {
        await login(email.trim(), password);
      }
    } catch (err: unknown) {
      console.debug('[LoginScreen] Login failed:', err);
      const axiosError = err as { response?: { data?: { detail?: string } }; message?: string };
      const message =
        axiosError?.response?.data?.detail ||
        axiosError?.message ||
        'Unable to log in. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricUnlock = async () => {
    if (!unlockWithBiometrics) return;
    setError(null);
    setLoading(true);
    try {
      const ok = await unlockWithBiometrics();
      if (!ok) {
        setError('Biometric unlock was cancelled. Enter your password to continue.');
      }
    } catch (err: unknown) {
      console.debug('[LoginScreen] Biometric unlock failed:', err);
      setError('Biometric unlock failed. Enter your password to continue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} color={theme.colors.onSurface} />
        <Appbar.Content title="Log In" />
      </Appbar.Header>
      <View style={styles.container}>
        <TextInput
          testID="email-input"
          label="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          autoCorrect={false}
        />
        <TextInput
          testID="password-input"
          label="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error ? (
          <HelperText type="error" visible>
            {error}
          </HelperText>
        ) : null}

        {showEnroll ? (
          <Checkbox.Item
            testID="biometric-enroll-checkbox"
            label={`Use ${BIOMETRIC_LABEL} next time`}
            status={useBiometric ? 'checked' : 'unchecked'}
            onPress={() => setUseBiometric((v) => !v)}
            position="leading"
            style={styles.checkbox}
          />
        ) : null}

        <Button
          testID="login-button"
          mode="contained"
          onPress={handleLogin}
          loading={loading}
          disabled={!email || !password || loading}
        >
          Log In
        </Button>

        {showUnlock ? (
          <Button
            testID="biometric-unlock-button"
            mode="outlined"
            icon="fingerprint"
            onPress={handleBiometricUnlock}
            disabled={loading}
          >
            {`Unlock with ${BIOMETRIC_LABEL}`}
          </Button>
        ) : null}

        <Button mode="text" onPress={() => navigation.navigate('Register')}>
          Need an account? Create one
        </Button>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  checkbox: {
    paddingHorizontal: 0,
  },
});

export default LoginScreen;
