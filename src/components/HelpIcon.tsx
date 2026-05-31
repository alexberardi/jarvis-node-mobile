import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Icon, IconButton, Text, useTheme } from 'react-native-paper';

import { useHelp } from './HelpProvider';

interface HelpIconProps {
  text: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export const HelpIcon = ({ text, size = 18, style }: HelpIconProps) => {
  const showHelp = useHelp();
  const theme = useTheme();
  return (
    <IconButton
      icon="information-outline"
      size={size}
      iconColor={theme.colors.onSurfaceVariant}
      onPress={() => showHelp(text)}
      style={[{ margin: 0 }, style]}
      accessibilityLabel="Help"
    />
  );
};

interface InfoHelperTextProps {
  text: string;
  style?: StyleProp<ViewStyle>;
}

export const InfoHelperText = ({ text, style }: InfoHelperTextProps) => {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 8,
          backgroundColor: theme.colors.surfaceVariant,
          marginHorizontal: 16,
          marginVertical: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: theme.roundness,
        },
        style,
      ]}
    >
      <View style={{ paddingTop: 2 }}>
        <Icon source="information-outline" size={16} color={theme.colors.onSurfaceVariant} />
      </View>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
        {text}
      </Text>
    </View>
  );
};
