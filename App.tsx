import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider } from './src/auth/AuthContext';
import ConnectionBanner from './src/components/ConnectionBanner';
import { DEV_MODE } from './src/config/env';
import { ConfigProvider } from './src/contexts/ConfigContext';
import { ConnectionProvider } from './src/contexts/ConnectionContext';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import RootNavigator from './src/navigation/RootNavigator';
import { ThemeProvider, useThemePreference } from './src/theme/ThemeProvider';

const queryClient = new QueryClient();

if (__DEV__) {
  console.log('Dev Mode:', DEV_MODE);
}

const PushNotificationManager: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  usePushNotifications();
  return <>{children}</>;
};

const AppContent = () => {
  const { paperTheme, navTheme, isDark } = useThemePreference();

  return (
    <PaperProvider theme={paperTheme}>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <ConnectionProvider>
            <AuthProvider>
              <PushNotificationManager>
                <NavigationContainer theme={navTheme}>
                  <ConnectionBanner />
                  <RootNavigator />
                  <StatusBar style={isDark ? 'light' : 'dark'} />
                </NavigationContainer>
              </PushNotificationManager>
            </AuthProvider>
          </ConnectionProvider>
        </ConfigProvider>
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
