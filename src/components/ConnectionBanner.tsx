/**
 * Global connection status banner.
 *
 * Shows a slim banner when the command center is unreachable.
 * Displays "Reconnected" briefly when connectivity returns.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, Text, useTheme } from 'react-native-paper';

import { useConnection } from '../contexts/ConnectionContext';

const ConnectionBanner = () => {
  const theme = useTheme();
  const { status, checkNow } = useConnection();
  const [showReconnected, setShowReconnected] = useState(false);
  const prevStatus = useRef(status);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Detect transition from offline → connected (only show once per outage)
  useEffect(() => {
    if (prevStatus.current === 'offline' && status === 'connected') {
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 3000);
      prevStatus.current = status;
      return () => clearTimeout(timer);
    }
    prevStatus.current = status;
  }, [status]);

  const visible = status === 'offline' || showReconnected;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [visible, slideAnim]);

  const height = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 36],
  });

  const opacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  if (status === 'checking' && !showReconnected) return null;

  const isOffline = status === 'offline';
  const bgColor = isOffline ? `${theme.colors.error}15` : '#22c55e18';
  const textColor = isOffline ? theme.colors.error : '#22c55e';

  return (
    <Animated.View style={[styles.container, { height, opacity, backgroundColor: bgColor }]}>
      <View style={styles.content}>
        {isOffline ? (
          <>
            <ActivityIndicator size={12} color={textColor} />
            <Text
              variant="labelSmall"
              style={[styles.text, { color: textColor }]}
              onPress={checkNow}
            >
              Server unreachable — retrying...
            </Text>
          </>
        ) : (
          <>
            <Icon source="check-circle" size={14} color={textColor} />
            <Text variant="labelSmall" style={[styles.text, { color: textColor }]}>
              Reconnected
            </Text>
          </>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
  },
  text: {
    fontWeight: '500',
  },
});

export default ConnectionBanner;
