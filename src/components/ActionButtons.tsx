import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, useTheme } from 'react-native-paper';

import { JarvisButton } from '../types/SmartHome';

interface ActionButtonsProps {
  actions: JarvisButton[];
  onPress: (action: JarvisButton) => void;
  loadingAction: string | null;
  disabled?: boolean;
}

/**
 * Shared adaptive action button layout.
 *
 * Layout rules:
 * - 1 button  → full width (column)
 * - 2 buttons → side by side (row, each flex: 1)
 * - 3+ buttons → vertical stack (column, full width)
 */
const ActionButtons: React.FC<ActionButtonsProps> = ({
  actions,
  onPress,
  loadingAction,
  disabled = false,
}) => {
  const theme = useTheme();
  if (actions.length === 0) return null;

  const isRow = actions.length === 2;

  const getButtonStyle = (type: JarvisButton['button_type']) => {
    switch (type) {
      case 'primary':
        return { bg: theme.colors.primary, text: theme.colors.onPrimary };
      case 'secondary':
        return { bg: theme.colors.surfaceVariant, text: theme.colors.onSurface };
      case 'destructive':
        return { bg: theme.colors.error, text: theme.colors.onError };
      default:
        return { bg: theme.colors.primary, text: theme.colors.onPrimary };
    }
  };

  return (
    <View
      style={[
        styles.container,
        { flexDirection: isRow ? 'row' : 'column' },
      ]}
    >
      {actions.map((action) => {
        const colors = getButtonStyle(action.button_type);
        const isLoading = loadingAction === action.button_action;
        return (
          <Button
            key={action.button_action}
            mode="contained"
            onPress={() => onPress(action)}
            loading={isLoading}
            disabled={disabled || loadingAction !== null}
            icon={action.button_icon || undefined}
            style={[
              styles.button,
              isRow && styles.rowButton,
              { backgroundColor: colors.bg },
            ]}
            labelStyle={{ color: colors.text, fontWeight: '600' }}
          >
            {action.button_text}
          </Button>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  button: {
    borderRadius: 8,
  },
  rowButton: {
    flex: 1,
  },
});

export default ActionButtons;
