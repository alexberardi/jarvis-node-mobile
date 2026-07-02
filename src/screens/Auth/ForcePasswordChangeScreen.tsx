import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Appbar, Button, HelperText, Text, TextInput, useTheme } from 'react-native-paper';

import { useAuth } from '../../auth/AuthContext';

/**
 * Full-screen gate shown when the session was opened with an admin-issued
 * temporary password (server flag `must_change_password`). Rendered by
 * RootNavigator INSTEAD of the app tree, so nothing else is reachable until a
 * real password is set (or the user logs out).
 *
 * The temp password typed at login is held in memory by AuthContext; after a
 * cold boot it's gone, so the current-password field appears.
 */
const ForcePasswordChangeScreen = () => {
  const { changePassword, hasTempPassword, logout } = useAuth();
  const theme = useTheme();
  const needsCurrentPassword = !hasTempPassword();

  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordError = useMemo(() => {
    if (!password) return null;
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(password)) return 'Add at least one uppercase letter.';
    if (!/[a-z]/.test(password)) return 'Add at least one lowercase letter.';
    if (!/[0-9]/.test(password)) return 'Add at least one number.';
    return null;
  }, [password]);

  const handleSubmit = async () => {
    setError(null);
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
      await changePassword(password, needsCurrentPassword ? currentPassword : undefined);
      // Success: AuthContext clears the gate and RootNavigator swaps in the app.
    } catch (err: unknown) {
      console.debug('[ForcePasswordChangeScreen] Change failed:', err);
      const axiosError = err as { response?: { data?: { detail?: string } }; message?: string };
      const message =
        axiosError?.response?.data?.detail ||
        axiosError?.message ||
        'Unable to change password. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const showInlineError = error || passwordError;

  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Set a New Password" />
      </Appbar.Header>
      <View style={styles.container}>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          You signed in with a temporary password. Choose a new password to continue — your other
          devices will be signed out.
        </Text>

        {needsCurrentPassword && (
          <TextInput
            label="Temporary Password"
            secureTextEntry
            value={currentPassword}
            onChangeText={setCurrentPassword}
            autoCorrect={false}
            autoCapitalize="none"
          />
        )}
        <TextInput
          label="New Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          error={!!passwordError}
        />
        <TextInput
          label="Confirm New Password"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          error={!!confirmPassword && password !== confirmPassword}
        />

        {showInlineError ? (
          <HelperText type="error" visible>
            {showInlineError}
          </HelperText>
        ) : null}

        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={loading}
          disabled={
            loading ||
            !password ||
            !confirmPassword ||
            !!passwordError ||
            password !== confirmPassword ||
            (needsCurrentPassword && !currentPassword)
          }
        >
          Set Password
        </Button>
        <Button mode="text" onPress={() => logout()} disabled={loading}>
          Log Out
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
});

export default ForcePasswordChangeScreen;
