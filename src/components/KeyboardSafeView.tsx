import React from 'react';
import {
  KeyboardAvoidingView,
  type KeyboardAvoidingViewProps,
  Platform,
  StyleSheet,
} from 'react-native';

type Props = Omit<KeyboardAvoidingViewProps, 'behavior'> & {
  /**
   * iOS behavior. Defaults to none, so wrapping an existing screen leaves iOS
   * exactly as it was; pass 'padding' where the screen already used it.
   */
  iosBehavior?: KeyboardAvoidingViewProps['behavior'];
};

/**
 * Screen root that keeps text inputs above the Android soft keyboard.
 *
 * The app is edge-to-edge on Android (app.json edgeToEdgeEnabled). Under
 * edge-to-edge the system no longer resizes the window for the keyboard —
 * the manifest's adjustResize is a no-op — so the keyboard draws over
 * whatever sits in the bottom part of the screen. 'padding' shrinks this view
 * by the keyboard's overlap instead; a ScrollView inside it then shrinks too,
 * and Android's ScrollView keeps the focused input visible across the resize.
 * If a device does resize the window, the overlap (and so the padding) is 0.
 *
 * Use it as the outermost view of a screen (it fills its parent, flex: 1), so
 * its frame lines up with the window the keyboard is measured against.
 */
const KeyboardSafeView = ({ iosBehavior, style, ...rest }: Props) => (
  <KeyboardAvoidingView
    behavior={Platform.OS === 'android' ? 'padding' : iosBehavior}
    style={[styles.fill, style]}
    {...rest}
  />
);

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

export default KeyboardSafeView;
