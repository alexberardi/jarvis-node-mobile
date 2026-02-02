import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Appbar, Button, HelperText, TextInput } from 'react-native-paper';

import { useAuth } from '../../auth/AuthContext';
import { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

const RegisterScreen = ({ navigation }: Props) => {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await register(email.trim(), password);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
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
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Create Account" />
      </Appbar.Header>
      <View style={styles.container}>
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
});

export default RegisterScreen;
