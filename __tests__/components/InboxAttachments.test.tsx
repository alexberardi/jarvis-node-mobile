import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer } from 'expo-video';

import InboxAttachments from '../../src/components/inbox/InboxAttachments';
import { InboxAttachment } from '../../src/services/inboxMediaService';
import { lightTheme } from '../../src/theme';

const mockDownload = jest.fn();
jest.mock('../../src/services/inboxMediaService', () => ({
  ...jest.requireActual('../../src/services/inboxMediaService'),
  downloadInboxMedia: (...args: any[]) => mockDownload(...args),
}));

const image: InboxAttachment = {
  id: 'a1',
  kind: 'image',
  url: '/api/v0/inbox/i1/attachments/a1',
  mime_type: 'image/png',
};
const video: InboxAttachment = {
  id: 'a2',
  kind: 'video',
  url: '/api/v0/inbox/i1/attachments/a2',
  mime_type: 'video/mp4',
  thumbnail_url: '/api/v0/inbox/i1/attachments/a2/thumbnail',
};

const localFor = (url: string) => `file:///cache/inbox-media/${url.split('/').pop()}`;

const renderStrip = (attachments: InboxAttachment[]) =>
  render(
    <PaperProvider theme={lightTheme}>
      <InboxAttachments attachments={attachments} />
    </PaperProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockDownload.mockImplementation(async (url: string) => localFor(url));
  (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
});

describe('InboxAttachments', () => {
  it('renders nothing without attachments', () => {
    const { queryByTestId } = renderStrip([]);
    expect(queryByTestId('inbox-attachment-0')).toBeNull();
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('shows a thumbnail per attachment, using the video thumbnail_url', async () => {
    const { getByTestId } = renderStrip([image, video]);
    expect(getByTestId('inbox-attachment-0')).toBeTruthy();
    expect(getByTestId('inbox-attachment-1')).toBeTruthy();
    await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(2));
    expect(mockDownload).toHaveBeenCalledWith(image.url, 'image/png');
    expect(mockDownload).toHaveBeenCalledWith(video.thumbnail_url, undefined);
  });

  it('opens an image: loading, then the zoomable image', async () => {
    let resolve: (v: string) => void = () => {};
    const { getByTestId, findByTestId, queryByTestId } = renderStrip([image]);
    await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1));
    mockDownload.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));

    fireEvent.press(getByTestId('inbox-attachment-0'));
    expect(getByTestId('attachment-viewer')).toBeTruthy();
    expect(getByTestId('attachment-loading')).toBeTruthy();
    expect(queryByTestId('attachment-image')).toBeNull();

    resolve(localFor(image.url));
    const img = await findByTestId('attachment-image');
    expect(img.props.source).toEqual({ uri: localFor(image.url) });
  });

  it('shows an error with Retry, and Retry downloads again', async () => {
    const { getByTestId, findByTestId } = renderStrip([image]);
    await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1));
    mockDownload.mockRejectedValueOnce(new Error('HTTP 500'));

    fireEvent.press(getByTestId('inbox-attachment-0'));
    await findByTestId('attachment-error');

    fireEvent.press(getByTestId('attachment-retry'));
    await findByTestId('attachment-image');
    expect(mockDownload).toHaveBeenCalledTimes(3);
  });

  it('plays a video from the downloaded file', async () => {
    const { getByTestId, findByTestId } = renderStrip([video]);
    fireEvent.press(getByTestId('inbox-attachment-0'));
    expect(await findByTestId('attachment-video')).toBeTruthy();
    expect(mockDownload).toHaveBeenCalledWith(video.url, 'video/mp4');
    expect(useVideoPlayer).toHaveBeenCalledWith(localFor(video.url));
  });

  it('asks for the photo permission only when Save is pressed', async () => {
    const { getByTestId, findByTestId, findByText } = renderStrip([image]);
    fireEvent.press(getByTestId('inbox-attachment-0'));
    await findByTestId('attachment-image');
    expect(MediaLibrary.requestPermissionsAsync).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('attachment-save'));
    await findByText('Saved to Photos.');
    expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true);
    expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith(localFor(image.url));
  });

  it('explains a refused permission and does not save', async () => {
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    const { getByTestId, findByTestId } = renderStrip([image]);
    fireEvent.press(getByTestId('inbox-attachment-0'));
    await findByTestId('attachment-image');

    fireEvent.press(getByTestId('attachment-save'));
    const msg = await findByTestId('attachment-message');
    expect(msg.props.children).toMatch(/permission/);
    expect(MediaLibrary.saveToLibraryAsync).not.toHaveBeenCalled();
  });

  it('shares the local file', async () => {
    const { getByTestId, findByTestId } = renderStrip([image]);
    fireEvent.press(getByTestId('inbox-attachment-0'));
    await findByTestId('attachment-image');

    fireEvent.press(getByTestId('attachment-share'));
    await waitFor(() =>
      expect(Sharing.shareAsync).toHaveBeenCalledWith(localFor(image.url), {
        mimeType: 'image/png',
      }),
    );
  });

  it('closes the viewer', async () => {
    const { getByTestId, findByTestId, queryByTestId } = renderStrip([image]);
    fireEvent.press(getByTestId('inbox-attachment-0'));
    await findByTestId('attachment-image');
    fireEvent.press(getByTestId('attachment-close'));
    expect(queryByTestId('attachment-viewer')).toBeNull();
  });
});
