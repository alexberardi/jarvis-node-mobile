import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useState, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Text,
  TextInput,
  Card,
  ActivityIndicator,
  HelperText,
} from 'react-native-paper';

import {
  parseQRCode,
  importPlainQR,
  importEncryptedQR,
  ImportResult,
} from '../../services/qrImportService';
import { QRPayload, EncryptedQRPayload } from '../../services/qrPayloadService';

type ScanState = 'scanning' | 'password' | 'importing' | 'success' | 'error';

interface ImportKeyScreenProps {
  onComplete?: (nodeId: string) => void;
  onCancel?: () => void;
}

const ImportKeyScreen: React.FC<ImportKeyScreenProps> = ({
  onComplete,
  onCancel,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [scannedPayload, setScannedPayload] = useState<QRPayload | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importedNodeId, setImportedNodeId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleBarCodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (isProcessing || scanState !== 'scanning') return;

      setIsProcessing(true);
      setError(null);

      const result = parseQRCode(data);

      if (!result.success) {
        setError(result.error || 'Invalid QR code');
        setIsProcessing(false);
        return;
      }

      if (result.requiresPassword && result.payload) {
        setScannedPayload(result.payload);
        setScanState('password');
        setIsProcessing(false);
        return;
      }

      // Plain QR - import directly
      if (result.payload) {
        setScanState('importing');
        const importResult = await importPlainQR(result.payload);
        handleImportResult(importResult);
      }

      setIsProcessing(false);
    },
    [isProcessing, scanState]
  );

  const handleImportResult = (result: ImportResult) => {
    if (result.success && result.nodeId) {
      setImportedNodeId(result.nodeId);
      setScanState('success');
    } else {
      setError(result.error || 'Import failed');
      setScanState('error');
    }
  };

  const handlePasswordSubmit = async () => {
    if (!scannedPayload || !password) return;

    setScanState('importing');
    setError(null);

    const result = await importEncryptedQR(
      scannedPayload as EncryptedQRPayload,
      password
    );

    if (!result.success) {
      setError(result.error || 'Decryption failed');
      setScanState('password');
      return;
    }

    handleImportResult(result);
  };

  const handleRetry = () => {
    setScanState('scanning');
    setScannedPayload(null);
    setPassword('');
    setError(null);
  };

  // Permission not granted yet
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={onCancel} />
          <Appbar.Content title="Import Key" />
        </Appbar.Header>
        <View style={styles.permissionContainer}>
          <Text variant="titleMedium" style={styles.permissionTitle}>
            Camera Access Required
          </Text>
          <Text variant="bodyMedium" style={styles.permissionText}>
            To scan a backup QR code, we need access to your camera.
          </Text>
          <Button mode="contained" onPress={requestPermission}>
            Grant Permission
          </Button>
        </View>
      </View>
    );
  }

  // Password entry screen
  if (scanState === 'password') {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={handleRetry} />
          <Appbar.Content title="Enter Password" />
        </Appbar.Header>
        <View style={styles.passwordContainer}>
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.cardTitle}>
                Password Protected QR
              </Text>
              <Text variant="bodyMedium" style={styles.cardDescription}>
                This backup is encrypted. Enter the password to import.
              </Text>

              <TextInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                mode="outlined"
                style={styles.input}
                autoFocus
              />

              {error && (
                <HelperText type="error" visible>
                  {error}
                </HelperText>
              )}

              <Button
                mode="contained"
                onPress={handlePasswordSubmit}
                disabled={!password}
                style={styles.button}
              >
                Import
              </Button>
            </Card.Content>
          </Card>
        </View>
      </View>
    );
  }

  // Importing screen
  if (scanState === 'importing') {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.Content title="Importing..." />
        </Appbar.Header>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" />
          <Text style={styles.importingText}>Importing encryption key...</Text>
        </View>
      </View>
    );
  }

  // Success screen
  if (scanState === 'success') {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.Content title="Import Complete" />
        </Appbar.Header>
        <View style={styles.centerContainer}>
          <Text variant="displaySmall" style={styles.successIcon}>
            ✓
          </Text>
          <Text variant="headlineSmall" style={styles.successTitle}>
            Key Imported!
          </Text>
          <Text variant="bodyMedium" style={styles.successText}>
            Encryption key for {importedNodeId} has been imported.
          </Text>
          <Button
            mode="contained"
            onPress={() => onComplete?.(importedNodeId || '')}
            style={styles.button}
          >
            Done
          </Button>
        </View>
      </View>
    );
  }

  // Error screen
  if (scanState === 'error') {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={onCancel} />
          <Appbar.Content title="Import Failed" />
        </Appbar.Header>
        <View style={styles.centerContainer}>
          <Text variant="headlineSmall" style={styles.errorTitle}>
            Import Failed
          </Text>
          <Text variant="bodyMedium" style={styles.errorText}>
            {error}
          </Text>
          <Button mode="contained" onPress={handleRetry} style={styles.button}>
            Try Again
          </Button>
        </View>
      </View>
    );
  }

  // Scanner screen
  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={onCancel} />
        <Appbar.Content title="Scan Backup QR" />
      </Appbar.Header>

      <View style={styles.scannerContainer}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={handleBarCodeScanned}
        />

        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
        </View>

        <View style={styles.instructions}>
          <Text style={styles.instructionText}>
            Point camera at a Jarvis backup QR code
          </Text>
          {error && (
            <Text style={styles.scanError}>{error}</Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionTitle: {
    marginBottom: 16,
    fontWeight: '600',
  },
  permissionText: {
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.7,
  },
  passwordContainer: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  card: {
    padding: 8,
  },
  cardTitle: {
    marginBottom: 8,
    fontWeight: '600',
  },
  cardDescription: {
    marginBottom: 24,
    opacity: 0.7,
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  importingText: {
    marginTop: 24,
    opacity: 0.7,
  },
  successIcon: {
    color: '#22c55e',
    marginBottom: 24,
  },
  successTitle: {
    marginBottom: 16,
    fontWeight: '600',
  },
  successText: {
    textAlign: 'center',
    marginBottom: 32,
    opacity: 0.7,
  },
  errorTitle: {
    marginBottom: 16,
    fontWeight: '600',
    color: '#ef4444',
  },
  errorText: {
    textAlign: 'center',
    marginBottom: 32,
    opacity: 0.7,
  },
  scannerContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  instructions: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  scanError: {
    marginTop: 16,
    color: '#ef4444',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
});

export default ImportKeyScreen;
