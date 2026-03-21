import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState, useMemo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Appbar, Button, Checkbox, HelperText, Text, TextInput, useTheme } from 'react-native-paper';

import { useAuth } from '../../auth/AuthContext';
import authApi from '../../api/authApi';
import { AuthStackParamList } from '../../navigation/types';
import { setPushNotificationsEnabled } from '../../services/pushNotificationService';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

const RegisterScreen = ({ navigation }: Props) => {
  const { register } = useAuth();
  const theme = useTheme();
  const [inviteCode, setInviteCode] = useState('');
  const [inviteStatus, setInviteStatus] = useState<{ valid: boolean; household_name: string | null } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enablePush, setEnablePush] = useState(true);

  const handleInviteBlur = useCallback(async () => {
    const code = inviteCode.trim();
    if (!code) { setInviteStatus(null); return; }
    try {
      const res = await authApi.get<{ valid: boolean; household_name: string | null }>(`/invites/${code}/validate`);
      setInviteStatus(res.data);
    } catch {
      setInviteStatus({ valid: false, household_name: null });
    }
  }, [inviteCode]);

  const isValidEmail = useMemo(() => /\S+@\S+\.\S+/.test(email.trim()), [email]);
  const passwordError = useMemo(() => {
    if (!password) return null;
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(password)) return 'Add at least one uppercase letter.';
    if (!/[a-z]/.test(password)) return 'Add at least one lowercase letter.';
    if (!/[0-9]/.test(password)) return 'Add at least one number.';
    return null;
  }, [password]);

  const handleRegister = async () => {
    setError(null);

    if (!isValidEmail) {
      setError('Enter a valid email address.');
      return;
    }
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await setPushNotificationsEnabled(enablePush);
      await register(email.trim(), password, undefined, inviteCode.trim() || undefined);
    } catch (err: unknown) {
      console.debug('[RegisterScreen] Registration failed:', err);
      const axiosError = err as { response?: { data?: { detail?: string } }; message?: string };
      const message =
        axiosError?.response?.data?.detail ||
        axiosError?.message ||
        'Unable to create account. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const showInlineError = error || (!isValidEmail && email ? 'Enter a valid email.' : passwordError);

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} color={theme.colors.onSurface} />
        <Appbar.Content title="Create Account" />
      </Appbar.Header>
      <View style={styles.container}>
        <TextInput
          label="Invite Code (optional)"
          autoCapitalize="characters"
          value={inviteCode}
          onChangeText={(t) => { setInviteCode(t.toUpperCase()); setInviteStatus(null); }}
          onBlur={handleInviteBlur}
          maxLength={8}
          autoCorrect={false}
          style={{ fontFamily: 'monospace', letterSpacing: 4 }}
        />
        {inviteStatus?.valid && (
          <HelperText type="info" visible style={{ color: theme.colors.primary }}>
            You'll join: {inviteStatus.household_name}
          </HelperText>
        )}
        {inviteStatus && !inviteStatus.valid && (
          <HelperText type="error" visible>
            Invalid or expired invite code
          </HelperText>
        )}
        <TextInput
          label="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          autoCorrect={false}
          error={!!email && !isValidEmail}
        />
        <TextInput
          label="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          error={!!passwordError}
        />
        <TextInput
          label="Confirm Password"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          error={!!confirmPassword && password !== confirmPassword}
        />

        <View style={styles.checkboxRow}>
          <Checkbox
            status={enablePush ? 'checked' : 'unchecked'}
            onPress={() => setEnablePush(!enablePush)}
          />
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium" onPress={() => setEnablePush(!enablePush)}>
              Enable push notifications
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Disable for a fully private, local-only experience. You can change this later in Settings.
            </Text>
          </View>
        </View>

        {showInlineError ? (
          <HelperText type="error" visible>
            {showInlineError}
          </HelperText>
        ) : null}

        <Button
          mode="contained"
          onPress={handleRegister}
          loading={loading}
          disabled={
            loading ||
            !email ||
            !password ||
            !confirmPassword ||
            !isValidEmail ||
            !!passwordError ||
            password !== confirmPassword
          }
        >
          Create Account
        </Button>
        <Button mode="text" onPress={() => navigation.navigate('Login')}>
          Back to Log In
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
});

export default RegisterScreen;
