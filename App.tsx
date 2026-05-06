import 'react-native-gesture-handler';
import React, { useCallback } from 'react';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
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
import { ToolsProvider } from './src/contexts/ToolsContext';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import RootNavigator from './src/navigation/RootNavigator';
import { RootStackParamList } from './src/navigation/types';
import { ThemeProvider, useThemePreference } from './src/theme/ThemeProvider';

const queryClient = new QueryClient();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

if (__DEV__) {
  console.log('Dev Mode:', DEV_MODE);
}

const PushNotificationManager: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const handleNotificationTap = useCallback((data: Record<string, any>) => {
    if (!navigationRef.isReady()) return;

    if (data.type === 'bluetooth_scan' && data.node_id) {
      // Deep link to Hardware tab on the specific node
      (navigationRef as any).navigate('Main', {
        screen: 'NodesTab',
        params: {
          screen: 'NodeDetail',
          params: { nodeId: data.node_id, initialTab: 'hardware' },
        },
      });
    } else if (data.type === 'confirmation' && data.inbox_item_id) {
      // Deep link to inbox item
      (navigationRef as any).navigate('Inbox', {
        screen: 'InboxDetail',
        params: { itemId: data.inbox_item_id },
      });
    }
  }, []);

  usePushNotifications(handleNotificationTap);
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
              <ToolsProvider>
                <PushNotificationManager>
                  <NavigationContainer theme={navTheme} ref={navigationRef}>
                    <ConnectionBanner />
                    <RootNavigator />
                    <StatusBar style={isDark ? 'light' : 'dark'} />
                  </NavigationContainer>
                </PushNotificationManager>
              </ToolsProvider>
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
