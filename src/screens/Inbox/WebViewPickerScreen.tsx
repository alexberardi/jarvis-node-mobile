/**
 * Generic WebView value picker (webview_pick row action, decision 6).
 *
 * Wraps an https page in a WebView so the user can browse to the right
 * thing. When the current URL matches the action's `pattern` (regex,
 * capture group 1 = the value), a bottom action bar offers "Use this
 * value", which PATCHes `{[field]: value}` onto the record (command_name
 * + row key) on the source node and returns to InteractiveList with the
 * picked key/field/value so the row enables immediately (the inbox
 * metadata is a snapshot and won't reflect the new mapping).
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Icon, Text, useTheme } from 'react-native-paper';
import { WebView, WebViewNavigation } from 'react-native-webview';

import { updateRecord } from '../../api/commandDataApi';
import { InboxStackParamList } from '../../navigation/types';
import { compileRowActionPattern } from '../../utils/interactiveList';

type Nav = NativeStackNavigationProp<InboxStackParamList>;
type PickerRoute = RouteProp<InboxStackParamList, 'WebViewPicker'>;

const WebViewPickerScreen = () => {
  const route = useRoute<PickerRoute>();
  const navigation = useNavigation<Nav>();
  const theme = useTheme();

  const { itemId, rowKey, nodeId, commandName, field, startUrl, pattern, currentValue } =
    route.params;

  // Compiled once per pattern. Null = invalid regex — the list screen
  // hides such actions, so this is belt-and-braces against bad params.
  const valueRegex = useMemo(() => compileRowActionPattern(pattern), [pattern]);

  // Value parsed from the current URL; null when off matching pages.
  const [detectedValue, setDetectedValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onNavStateChange = useCallback(
    (navState: WebViewNavigation) => {
      if (!valueRegex) return;
      const match = navState.url?.match(valueRegex);
      setDetectedValue(match && match[1] ? match[1] : null);
    },
    [valueRegex],
  );

  const onUseValue = useCallback(async () => {
    if (!detectedValue) return;
    setSaving(true);
    try {
      await updateRecord(nodeId, commandName, rowKey, { [field]: detectedValue });
      // Pop back to the list screen, handing it the new mapping so it can
      // enable + auto-select the row without refetching.
      navigation.navigate('InteractiveList', {
        itemId,
        pickedKey: rowKey,
        pickedField: field,
        pickedValue: detectedValue,
      });
    } catch (err: unknown) {
      setSaving(false);
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Could not save the value.',
      );
    }
  }, [detectedValue, nodeId, commandName, rowKey, field, itemId, navigation]);

  const header = (
    <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Icon source="arrow-left" size={24} color={theme.colors.onSurface} />
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, marginLeft: 8 }}>
          Back
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Content rule: pickers only open https pages — anything else renders
  // an error instead of a WebView.
  if (!startUrl.startsWith('https://')) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.center}>
          <Text
            variant="bodyLarge"
            style={{ color: theme.colors.error, textAlign: 'center' }}
          >
            This action links to a non-https page and can't be opened.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}

      <WebView
        style={styles.webview}
        source={{ uri: startUrl }}
        onNavigationStateChange={onNavStateChange}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" />
          </View>
        )}
      />

      {detectedValue ? (
        <View style={[styles.actionBar, { backgroundColor: theme.colors.background }]}>
          {detectedValue === currentValue ? (
            <Text
              variant="bodySmall"
              style={[styles.actionLabel, { color: theme.colors.onSurfaceVariant }]}
            >
              This is the stored value — browse to a different one to change it
            </Text>
          ) : (
            <>
              <Text
                variant="bodySmall"
                style={[styles.actionLabel, { color: theme.colors.onSurfaceVariant }]}
              >
                Value detected
              </Text>
              <Button mode="contained" onPress={onUseValue} loading={saving} disabled={saving}>
                {`Use this value (${detectedValue})`}
              </Button>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: { flexDirection: 'row', alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  webview: { flex: 1 },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBar: { padding: 16, paddingBottom: 32 },
  actionLabel: { textAlign: 'center', marginBottom: 8 },
});

export default WebViewPickerScreen;
