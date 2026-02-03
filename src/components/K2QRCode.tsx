import React, { useState, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, Card, Button, HelperText, TextInput } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';

import { K2KeyPair } from '../services/k2Service';
import {
  generatePlainQRPayload,
  generateEncryptedQRPayload,
  encodeQRPayload,
} from '../services/qrPayloadService';
import { COMMAND_CENTER_URL } from '../config/env';

interface K2QRCodeProps {
  keyPair: K2KeyPair;
  mode: 'plain' | 'encrypted';
  password?: string;
  size?: number;
  onError?: (error: string) => void;
}

const K2QRCode: React.FC<K2QRCodeProps> = ({
  keyPair,
  mode,
  password,
  size = 250,
  onError,
}) => {
  const [qrData, setQrData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const generateQR = async () => {
      try {
        setIsLoading(true);
        setError(null);

        let payload;
        if (mode === 'plain') {
          payload = generatePlainQRPayload(keyPair, COMMAND_CENTER_URL);
        } else {
          if (!password) {
            throw new Error('Password required for encrypted QR');
          }
          payload = await generateEncryptedQRPayload(
            keyPair,
            password,
            COMMAND_CENTER_URL
          );
        }

        const encoded = encodeQRPayload(payload);
        setQrData(encoded);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate QR code';
        setError(message);
        onError?.(message);
      } finally {
        setIsLoading(false);
      }
    };

    generateQR();
  }, [keyPair, mode, password, onError]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Generating QR code...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <HelperText type="error" visible>
          {error}
        </HelperText>
      </View>
    );
  }

  if (!qrData) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.qrWrapper}>
        <QRCode
          value={qrData}
          size={size}
          backgroundColor="white"
          color="black"
        />
      </View>
      <Text style={styles.modeText}>
        {mode === 'plain' ? 'Plain (no password)' : 'Password protected'}
      </Text>
    </View>
  );
};

interface K2BackupCardProps {
  keyPair: K2KeyPair;
  onDone?: () => void;
}

export const K2BackupCard: React.FC<K2BackupCardProps> = ({
  keyPair,
  onDone,
}) => {
  const [mode, setMode] = useState<'choice' | 'plain' | 'encrypted' | 'showQR'>('choice');
  const [password, setPassword] = useState('');
  const [inputPassword, setInputPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleGenerateEncrypted = () => {
    if (inputPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    if (inputPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    setPassword(inputPassword);
    setMode('showQR');
  };

  const handleReset = () => {
    setMode('choice');
    setPassword('');
    setInputPassword('');
    setConfirmPassword('');
    setPasswordError(null);
  };

  if (mode === 'choice') {
    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.title}>
            Backup Encryption Key
          </Text>
          <Text variant="bodyMedium" style={styles.description}>
            Save this QR code to recover access to this node's encrypted
            settings. Choose how to protect it:
          </Text>

          <View style={styles.buttonContainer}>
            <Button
              mode="contained"
              onPress={() => setMode('plain')}
              style={styles.button}
              icon="qrcode"
            >
              Plain QR Code
            </Button>
            <Text variant="bodySmall" style={styles.hint}>
              Quick sharing, but anyone with the QR can access settings
            </Text>

            <Button
              mode="contained-tonal"
              onPress={() => setMode('encrypted')}
              style={styles.button}
              icon="lock"
            >
              Password Protected
            </Button>
            <Text variant="bodySmall" style={styles.hint}>
              Safer backup - requires password to use
            </Text>
          </View>
        </Card.Content>
      </Card>
    );
  }

  if (mode === 'encrypted') {
    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.title}>
            Set Backup Password
          </Text>
          <Text variant="bodyMedium" style={styles.description}>
            Choose a password to protect this backup. You'll need it to restore.
          </Text>

          <View style={styles.passwordContainer}>
            <TextInput
              mode="outlined"
              label="Password"
              value={inputPassword}
              onChangeText={(text) => {
                setInputPassword(text);
                setPasswordError(null);
              }}
              secureTextEntry
              style={styles.input}
            />
            <TextInput
              mode="outlined"
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                setPasswordError(null);
              }}
              secureTextEntry
              style={styles.input}
            />
            {passwordError && (
              <HelperText type="error" visible>
                {passwordError}
              </HelperText>
            )}
            <Button
              mode="outlined"
              onPress={handleReset}
              style={styles.button}
            >
              Back
            </Button>
            <Button
              mode="contained"
              onPress={handleGenerateEncrypted}
              style={styles.button}
              disabled={!inputPassword || !confirmPassword}
            >
              Generate QR
            </Button>
          </View>
        </Card.Content>
      </Card>
    );
  }

  // mode is 'plain' or 'showQR' (encrypted with password set)
  const isEncrypted = mode === 'showQR';

  return (
    <Card style={styles.card}>
      <Card.Content>
        <Text variant="titleMedium" style={styles.title}>
          Your Backup QR Code
        </Text>
        <Text variant="bodyMedium" style={styles.description}>
          {isEncrypted
            ? 'This code is encrypted. You will need your password to use it.'
            : 'Screenshot or photograph this code and store it safely.'}
        </Text>

        <K2QRCode
          keyPair={keyPair}
          mode={isEncrypted ? 'encrypted' : 'plain'}
          password={password}
        />

        <View style={styles.buttonContainer}>
          <Button
            mode="outlined"
            onPress={handleReset}
            style={styles.button}
          >
            Generate Different QR
          </Button>
          {onDone && (
            <Button mode="contained" onPress={onDone} style={styles.button}>
              Done
            </Button>
          )}
        </View>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  qrWrapper: {
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 8,
  },
  loadingText: {
    marginTop: 16,
    opacity: 0.7,
  },
  modeText: {
    marginTop: 12,
    opacity: 0.6,
  },
  card: {
    marginVertical: 8,
  },
  title: {
    marginBottom: 8,
    fontWeight: '600',
  },
  description: {
    marginBottom: 16,
    opacity: 0.8,
    lineHeight: 22,
  },
  buttonContainer: {
    marginTop: 16,
  },
  button: {
    marginTop: 8,
  },
  hint: {
    marginTop: 4,
    marginBottom: 12,
    marginLeft: 8,
    opacity: 0.6,
  },
  passwordContainer: {
    marginTop: 16,
  },
  input: {
    marginBottom: 12,
  },
});

export default K2QRCode;
