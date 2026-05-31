import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Button, Card, Text, useTheme } from 'react-native-paper';

interface FirstRunCardProps {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  body: string;
  dismissLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const FirstRunCard = ({
  visible,
  onDismiss,
  title,
  body,
  dismissLabel = 'Got it',
  style,
}: FirstRunCardProps) => {
  const theme = useTheme();
  if (!visible) return null;
  return (
    <Card
      style={[
        {
          marginHorizontal: 16,
          marginVertical: 12,
          backgroundColor: theme.colors.primaryContainer,
        },
        style,
      ]}
    >
      <Card.Content>
        <Text
          variant="titleMedium"
          style={{ color: theme.colors.onPrimaryContainer, marginBottom: 6 }}
        >
          {title}
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onPrimaryContainer }}>
          {body}
        </Text>
      </Card.Content>
      <Card.Actions>
        <Button onPress={onDismiss} textColor={theme.colors.onPrimaryContainer}>
          {dismissLabel}
        </Button>
      </Card.Actions>
    </Card>
  );
};
