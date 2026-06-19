import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import ConnectionBanner from './src/components/ConnectionBanner';
import ErrorBoundary from './src/components/ErrorBoundary';
import { HelpProvider } from './src/components/HelpProvider';
import { DEV_MODE } from './src/config/env';
import { ConfigProvider } from './src/contexts/ConfigContext';
import { ConnectionProvider } from './src/contexts/ConnectionContext';
import { PendingNodeProvider } from './src/contexts/PendingNodeContext';
import { ToolsProvider } from './src/contexts/ToolsContext';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import {
  parseQuickOpenUrl,
  peekPendingIntent,
  setPendingIntent,
} from './src/navigation/deepLinks';
import RootNavigator from './src/navigation/RootNavigator';
import { RootStackParamList } from './src/navigation/types';
import { ThemeProvider, useThemePreference } from './src/theme/ThemeProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A down self-hosted server should fail fast, not retry 3x (~30s of
      // hanging) on every screen. One retry rides out a transient blip;
      // disabling refetch-on-focus avoids a thundering re-fetch each time
      // the app returns to the foreground.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
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
    } else if (data.type === 'open_url' && typeof data.url === 'string') {
      Linking.openURL(data.url).catch((err) => {
        console.warn('[Push] Failed to open URL:', err);
      });
    } else if (data.type === 'adapter_proposal' && data.inbox_item_id) {
      (navigationRef as any).navigate('Inbox', {
        screen: 'AdapterProposal',
        params: { itemId: data.inbox_item_id },
      });
    } else if (data.type === 'adapter_deployed' && data.inbox_item_id) {
      (navigationRef as any).navigate('Inbox', {
        screen: 'AdapterDeployed',
        params: { itemId: data.inbox_item_id },
      });
    } else if (data.type === 'interactive_list' && data.inbox_item_id) {
      (navigationRef as any).navigate('Inbox', {
        screen: 'InteractiveList',
        params: { itemId: data.inbox_item_id },
      });
    } else if (data.inbox_item_id) {
      // Generic fallback: any push carrying an inbox_item_id opens that
      // item. New inbox-backed categories deep-link by default without
      // mobile changes; richer destinations get their own branch above.
      (navigationRef as any).navigate('Inbox', {
        screen: 'InboxDetail',
        params: { itemId: data.inbox_item_id },
      });
    }
  }, []);

  usePushNotifications(handleNotificationTap);
  return <>{children}</>;
};

/**
 * Routes quick-open deep links (com.jarvis.app://stt | ://chat) to the chat
 * screen. These back every iOS instant-trigger surface (Action Button,
 * Control Center, Lock Screen, Back Tap, Shortcuts).
 *
 * This manager only *stashes* the intent and brings the chat screen into
 * focus. HomeScreen is the authoritative consumer (it drains the stash on
 * focus / via subscription) — so a link that arrives before login is still
 * honored once HomeScreen mounts after auth, with no dependence on the exact
 * timing of the Auth->Main navigator swap. Lives inside AuthProvider so it
 * can observe auth state.
 */
const DeepLinkManager: React.FC<{ navReady: boolean }> = ({ navReady }) => {
  const {
    state: { isAuthenticated, isLoading },
  } = useAuth();

  // Ref so the URL event callback (registered once) always sees current state.
  const canRouteRef = useRef(false);
  canRouteRef.current = navReady && isAuthenticated && !isLoading;

  // Bring the chat screen into focus for a pending quick-open. HomeScreen
  // consumes the stashed intent, so this only navigates — if it can't yet
  // (e.g. still logged out), the intent stays stashed and HomeScreen drains
  // it when it mounts/focuses after auth.
  const focusChat = useCallback(() => {
    if (!canRouteRef.current) return;
    if (!navigationRef.isReady()) return;
    if (!peekPendingIntent()) return;
    (navigationRef as any).navigate('Main', { screen: 'HomeTab' });
  }, []);

  // Capture incoming URLs: getInitialURL for cold start, the listener for
  // warm/foreground opens.
  useEffect(() => {
    const handle = (url: string | null) => {
      const intent = parseQuickOpenUrl(url);
      if (!intent) return;
      setPendingIntent(intent);
      focusChat();
    };
    Linking.getInitialURL()
      .then(handle)
      .catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, [focusChat]);

  // When nav becomes ready / the user logs in, focus chat for any stashed
  // intent (covers cross-tab + cold-start-authed; the login race is handled
  // by HomeScreen draining on focus regardless).
  useEffect(() => {
    focusChat();
  }, [navReady, isAuthenticated, isLoading, focusChat]);

  return null;
};

const AppContent = () => {
  const { paperTheme, navTheme, isDark } = useThemePreference();
  const [navReady, setNavReady] = useState(false);

  return (
    <PaperProvider theme={paperTheme}>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <ConnectionProvider>
            <AuthProvider>
              <PendingNodeProvider>
                <ToolsProvider>
                  <PushNotificationManager>
                    <DeepLinkManager navReady={navReady} />
                    <HelpProvider>
                      <NavigationContainer
                        theme={navTheme}
                        ref={navigationRef}
                        onReady={() => setNavReady(true)}
                      >
                        <ConnectionBanner />
                        <RootNavigator />
                        <StatusBar style={isDark ? 'light' : 'dark'} />
                      </NavigationContainer>
                    </HelpProvider>
                  </PushNotificationManager>
                </ToolsProvider>
              </PendingNodeProvider>
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
        <ErrorBoundary>
          <ThemeProvider>
            <AppContent />
          </ThemeProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
