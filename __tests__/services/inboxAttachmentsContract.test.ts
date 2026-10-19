/**
 * Contract: the inbox item JSON jarvisd sends (#218).
 *
 * The fixture copies the shape of jarvis-server's
 * internal/modules/notifications/attachments.go (type Attachment:
 * {id, mime, size, width, height, duration_ms}) as exercised by
 * TestInboxAttachmentsRoundTrip in attachments_test.go (server bc67dd2,
 * v0.1.0-rc16): a 3×2 PNG and an MP4 whose width, height and duration are
 * null. The bytes are served at GET /api/v0/inbox/{item}/attachments/{id}.
 * If the server's shape changes, update the fixture from that test.
 */
import fixture from '../fixtures/jarvisd-inbox-item-attachments.json';
import { parseInboxAttachments } from '../../src/services/inboxMediaService';

jest.mock('../../src/api/apiClient', () => ({
  getCurrentAccessToken: () => null,
  refreshAuthToken: jest.fn(),
}));
jest.mock('../../src/config/serviceConfig', () => ({
  getServiceConfig: () => ({ notificationsUrl: 'http://srv.test' }),
}));
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-media-library', () => ({}));
jest.mock('expo-sharing', () => ({}));

describe('jarvisd inbox attachments contract', () => {
  it('parses every attachment of a jarvisd item', () => {
    const item = fixture;
    expect(parseInboxAttachments(item)).toEqual([
      {
        id: 'att-png',
        kind: 'image',
        url: `/api/v0/inbox/${item.id}/attachments/att-png`,
        mime_type: 'image/png',
        size_bytes: 75,
        width: 3,
        height: 2,
      },
      {
        id: 'att-mp4',
        kind: 'video',
        url: `/api/v0/inbox/${item.id}/attachments/att-mp4`,
        mime_type: 'video/mp4',
        size_bytes: 124,
      },
    ]);
  });
});
