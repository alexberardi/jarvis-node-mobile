/**
 * Walmart item-ID picker.
 *
 * Wraps walmart.com search in a WebView so the user can browse to the
 * right product. When the current URL looks like a product page
 * (/ip/<slug>/<numeric id>), a bottom action bar offers "Use this ID",
 * which PATCHes the shopping-list record's walmart_item_id on the source
 * node and returns to ExportShoppingList with the picked key/id so the
 * row enables immediately (the inbox metadata is a snapshot and won't
 * reflect the new mapping).
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Icon, Text, useTheme } from 'react-native-paper';
import { WebView, WebViewNavigation } from 'react-native-webview';

import { updateRecord } from '../../api/commandDataApi';
import { InboxStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<InboxStackParamList>;
type PickerRoute = RouteProp<InboxStackParamList, 'WalmartIdPicker'>;

/** Walmart product pages: /ip/<slug>/<id> or /ip/<id>; the id is numeric. */
const PRODUCT_URL_RE = /\/ip\/(?:[^/]+\/)?(\d{5,})/;

const WalmartIdPickerScreen = () => {
  const route = useRoute<PickerRoute>();
  const navigation = useNavigation<Nav>();
  const theme = useTheme();

  const { searchQuery, recordKey, nodeId, itemId, productId } = route.params;

  // Numeric item id parsed from the current URL; null off product pages.
  const [detectedId, setDetectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onNavStateChange = useCallback((navState: WebViewNavigation) => {
    const match = navState.url?.match(PRODUCT_URL_RE);
    setDetectedId(match ? match[1] : null);
  }, []);

  const onUseId = useCallback(async () => {
    if (!detectedId) return;
    setSaving(true);
    try {
      await updateRecord(nodeId, 'export_shopping_list', recordKey, {
        walmart_item_id: detectedId,
      });
      // Pop back to the export screen, handing it the new mapping so it
      // can enable + auto-select the row without refetching.
      navigation.navigate('ExportShoppingList', {
        itemId,
        pickedKey: recordKey,
        pickedId: detectedId,
      });
    } catch (err: unknown) {
      setSaving(false);
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Could not save the Walmart ID.',
      );
    }
  }, [detectedId, nodeId, recordKey, itemId, navigation]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon source="arrow-left" size={24} color={theme.colors.onSurface} />
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, marginLeft: 8 }}>
            Back
          </Text>
        </TouchableOpacity>
      </View>

      <WebView
        style={styles.webview}
        source={{
          uri: productId
            ? `https://www.walmart.com/ip/${encodeURIComponent(productId)}`
            : `https://www.walmart.com/search?q=${encodeURIComponent(searchQuery)}`,
        }}
        onNavigationStateChange={onNavStateChange}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" />
          </View>
        )}
      />

      {detectedId ? (
        <View style={[styles.actionBar, { backgroundColor: theme.colors.background }]}>
          {detectedId === productId ? (
            <Text
              variant="bodySmall"
              style={[styles.actionLabel, { color: theme.colors.onSurfaceVariant }]}
            >
              This is the stored product — browse to a different one to change it
            </Text>
          ) : (
            <>
              <Text
                variant="bodySmall"
                style={[styles.actionLabel, { color: theme.colors.onSurfaceVariant }]}
              >
                Product detected
              </Text>
              <Button mode="contained" onPress={onUseId} loading={saving} disabled={saving}>
                {`Use this ID (${detectedId})`}
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
  webview: { flex: 1 },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBar: { padding: 16, paddingBottom: 32 },
  actionLabel: { textAlign: 'center', marginBottom: 8 },
});

export default WalmartIdPickerScreen;
