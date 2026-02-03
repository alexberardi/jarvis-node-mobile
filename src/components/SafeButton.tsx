import React, { useState, useCallback } from 'react';
import { Button, ButtonProps } from 'react-native-paper';

interface SafeButtonProps extends Omit<ButtonProps, 'onPress'> {
  onPress?: () => void | Promise<void>;
  /**
   * Time in ms before re-enabling the button (default: 1000ms)
   * Set to 0 to stay disabled until parent re-renders
   */
  debounceMs?: number;
}

/**
 * A Button wrapper that prevents double-taps by disabling itself
 * immediately after press. Re-enables after debounceMs.
 */
const SafeButton: React.FC<SafeButtonProps> = ({
  onPress,
  disabled,
  debounceMs = 1000,
  children,
  ...props
}) => {
  const [isPressed, setIsPressed] = useState(false);

  const handlePress = useCallback(async () => {
    if (isPressed || disabled) return;

    setIsPressed(true);

    try {
      await onPress?.();
    } finally {
      if (debounceMs > 0) {
        setTimeout(() => setIsPressed(false), debounceMs);
      }
    }
  }, [onPress, isPressed, disabled, debounceMs]);

  return (
    <Button {...props} onPress={handlePress} disabled={disabled || isPressed}>
      {children}
    </Button>
  );
};

export default SafeButton;
