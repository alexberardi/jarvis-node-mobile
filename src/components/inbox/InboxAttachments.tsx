import React, { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { InboxAttachment } from '../../services/inboxMediaService';
import AttachmentViewer from './AttachmentViewer';
import InboxAttachmentThumb from './InboxAttachmentThumb';

interface Props {
  attachments: InboxAttachment[];
}

const THUMB_SIZE = 120;

/**
 * Strip of an inbox item's media attachments; tapping one opens it full
 * screen. Renders nothing for an item without attachments.
 */
const InboxAttachments: React.FC<Props> = ({ attachments }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (attachments.length === 0) return null;
  const open = openIndex !== null ? attachments[openIndex] : undefined;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.strip}
        contentContainerStyle={styles.stripContent}
      >
        {attachments.map((attachment, i) => (
          <TouchableOpacity
            key={`${attachment.id ?? attachment.url}-${i}`}
            testID={`inbox-attachment-${i}`}
            onPress={() => setOpenIndex(i)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${attachment.kind} ${i + 1}`}
          >
            <InboxAttachmentThumb attachment={attachment} size={THUMB_SIZE} />
          </TouchableOpacity>
        ))}
      </ScrollView>
      {open ? <AttachmentViewer attachment={open} onClose={() => setOpenIndex(null)} /> : null}
    </>
  );
};

const styles = StyleSheet.create({
  strip: { marginTop: 16 },
  stripContent: { gap: 8 },
});

export default InboxAttachments;
