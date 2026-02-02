import 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider } from './src/auth/AuthContext';
import { AUTH_API_BASE_URL, COMMAND_CENTER_URL, DEV_MODE } from './src/config/env';
import RootNavigator from './src/navigation/RootNavigator';
import { ThemeProvider, useThemePreference } from './src/theme/ThemeProvider';

const queryClient = new QueryClient();

if (__DEV__) {
  console.log('Auth API:', AUTH_API_BASE_URL);
  console.log('Command Center:', COMMAND_CENTER_URL);
  console.log('Dev Mode:', DEV_MODE);
}

const AppContent = () => {
  const { paperTheme, navTheme, isDark } = useThemePreference();

  return (
    <PaperProvider theme={paperTheme}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NavigationContainer theme={navTheme}>
            <RootNavigator />
            <StatusBar style={isDark ? 'light' : 'dark'} />
          </NavigationContainer>
        </AuthProvider>
      </QueryClientProvider>
    </PaperProvider>
  );
};

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
