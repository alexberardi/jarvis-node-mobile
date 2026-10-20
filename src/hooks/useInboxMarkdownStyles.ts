import { useMemo } from 'react';
import { useTheme } from 'react-native-paper';

/** Theme-aware styles for inbox bodies rendered with react-native-markdown-display. */
export function useInboxMarkdownStyles() {
  const theme = useTheme();
  return useMemo(
    () => ({
      body: { color: theme.colors.onSurface, fontSize: 14, lineHeight: 20 },
      heading1: {
        color: theme.colors.onSurface,
        fontSize: 20,
        fontWeight: 'bold' as const,
        marginTop: 16,
        marginBottom: 8,
      },
      heading2: {
        color: theme.colors.onSurface,
        fontSize: 18,
        fontWeight: 'bold' as const,
        marginTop: 14,
        marginBottom: 6,
      },
      heading3: {
        color: theme.colors.onSurface,
        fontSize: 16,
        fontWeight: 'bold' as const,
        marginTop: 12,
        marginBottom: 4,
      },
      link: { color: theme.colors.primary },
      bullet_list: { marginLeft: 8 },
      ordered_list: { marginLeft: 8 },
      hr: { backgroundColor: theme.colors.outlineVariant },
      strong: { fontWeight: 'bold' as const },
      // Without these, the library's light-theme code defaults leak through
      // in dark mode (light-gray box, unreadable light text).
      code_inline: {
        backgroundColor: theme.colors.surfaceVariant,
        color: theme.colors.onSurfaceVariant,
        paddingHorizontal: 4,
        borderRadius: 3,
        fontSize: 13,
      },
      code_block: {
        backgroundColor: theme.colors.surfaceVariant,
        color: theme.colors.onSurfaceVariant,
        borderColor: theme.colors.outlineVariant,
        padding: 8,
        borderRadius: 6,
        fontSize: 13,
      },
      fence: {
        backgroundColor: theme.colors.surfaceVariant,
        color: theme.colors.onSurfaceVariant,
        borderColor: theme.colors.outlineVariant,
        padding: 8,
        borderRadius: 6,
        fontSize: 13,
      },
      // Like code_block above, the library's default blockquote is a light box
      // with light text that's unreadable in dark mode (it made the mid-call
      // escalation card — which quotes the callee's question in a blockquote —
      // render as a broken-looking gray input). Theme it explicitly.
      blockquote: {
        backgroundColor: theme.colors.surfaceVariant,
        color: theme.colors.onSurfaceVariant,
        borderColor: theme.colors.primary,
        borderLeftWidth: 3,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        marginVertical: 4,
      },
    }),
    [theme],
  );
}
