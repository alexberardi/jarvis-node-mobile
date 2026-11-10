import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Icon, useTheme } from 'react-native-paper';

import { useInboxMedia } from '../../hooks/useInboxMedia';
import { InboxAttachment } from '../../services/inboxMediaService';

interface Props {
  attachment: InboxAttachment;
  size: number;
  testID?: string;
}

/**
 * Square preview of an inbox attachment: the server's thumbnail when it sent
 * one, else the image itself. A video without a thumbnail (or any preview
 * that fails to load) falls back to an icon; videos get a play badge.
 */
const InboxAttachmentThumb: React.FC<Props> = ({ attachment, size, testID }) => {
  const theme = useTheme();
  const previewUrl =
    attachment.thumbnail_url ?? (attachment.kind === 'image' ? attachment.url : undefined);
  // A thumbnail's type is unknown; the full image's is the attachment's.
  const previewMime = attachment.thumbnail_url ? undefined : attachment.mime_type;
  const { status, uri } = useInboxMedia(previewUrl, previewMime);
  const isVideo = attachment.kind === 'video';

  return (
    <View
      testID={testID}
      style={[
        styles.box,
        { width: size, height: size, backgroundColor: theme.colors.surfaceVariant },
      ]}
    >
      {status === 'ready' && uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : status !== 'loading' ? (
        <Icon
          source={isVideo ? 'video-outline' : 'image-outline'}
          size={size / 2}
          color={theme.colors.onSurfaceVariant}
        />
      ) : null}
      {isVideo && status === 'ready' ? (
        <View style={styles.playBadge}>
          <Icon source="play" size={size / 3} color="#fff" />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});

export default InboxAttachmentThumb;
