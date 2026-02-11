import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import { Banner, Button, IconButton, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConfig } from '../../contexts/ConfigContext';
import { AuthStackParamList } from '../../navigation/types';
import { useThemePreference } from '../../theme/ThemeProvider';

type Props = NativeStackScreenProps<AuthStackParamList, 'Landing'>;

const LandingScreen = ({ navigation }: Props) => {
  const { isDark, toggleTheme } = useThemePreference();
  const { fallbackMessage } = useConfig();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      {fallbackMessage && (
        <Banner
          visible
          icon="cloud-outline"
          style={[styles.banner, { marginTop: insets.top }]}
        >
          {fallbackMessage}
        </Banner>
      )}
      <IconButton
        icon={isDark ? 'weather-sunny' : 'weather-night'}
        onPress={toggleTheme}
        style={[styles.themeToggle, { top: insets.top + 8 }]}
        accessibilityLabel="Toggle dark mode"
      />
      <View style={styles.content}>
        <Text variant="displaySmall" style={styles.title}>
          Jarvis Node
        </Text>
        <Text variant="bodyLarge" style={styles.subtitle}>
          Provision and manage your Jarvis voice nodes
        </Text>
      </View>

      <View style={styles.buttons}>
        <Button
          mode="contained"
          onPress={() => navigation.navigate('Login')}
          style={styles.button}
        >
          Log In
        </Button>
        <Button
          mode="outlined"
          onPress={() => navigation.navigate('Register')}
          style={styles.button}
        >
          Create Account
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  themeToggle: {
    position: 'absolute',
    right: 8,
    zIndex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 16,
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.7,
    paddingHorizontal: 32,
  },
  buttons: {
    gap: 12,
    marginBottom: 32,
  },
  button: {},
  banner: {
    marginHorizontal: -24,
  },
});

export default LandingScreen;
