import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * App-wide error boundary. Catches render-time exceptions thrown by any screen
 * or provider below it and shows a recoverable fallback instead of a blank
 * white screen (a thrown render error otherwise unmounts the whole React tree).
 *
 * Deliberately renders with plain React Native primitives only — no Paper,
 * theme, navigation, or context — so the fallback still appears even when one
 * of those providers is the thing that failed. Colors match the app's dark
 * indigo palette so it doesn't look broken.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface for `docs logs` / future crash reporting.
    console.error('[ErrorBoundary] Unhandled render error:', error, info.componentStack);
  }

  handleReset = () => {
    // Re-mount the subtree; recovers from transient errors (bad nav param,
    // momentary null) without forcing the user to kill the app.
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            The app hit an unexpected error. Try again — if it keeps happening,
            restart the app.
          </Text>
          <Pressable
            style={styles.button}
            onPress={this.handleReset}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.buttonText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#0d0d2b',
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    color: '#b9b9d6',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
  },
  button: {
    backgroundColor: '#5b5bd6',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
