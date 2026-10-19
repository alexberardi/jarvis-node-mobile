import {
  downloadInboxMedia,
  parseInboxAttachments,
  resolveMediaUrl,
  saveMediaToPhotos,
  shareMedia,
} from '../../src/services/inboxMediaService';

const mockGetInfoAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
const mockDownloadAsync = jest.fn();
const mockDeleteAsync = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: (...args: any[]) => mockGetInfoAsync(...args),
  makeDirectoryAsync: (...args: any[]) => mockMakeDirectoryAsync(...args),
  downloadAsync: (...args: any[]) => mockDownloadAsync(...args),
  deleteAsync: (...args: any[]) => mockDeleteAsync(...args),
}));

const mockGetToken = jest.fn(() => 'jwt-token');
const mockRefresh = jest.fn();
jest.mock('../../src/api/apiClient', () => ({
  getCurrentAccessToken: () => mockGetToken(),
  refreshAuthToken: () => mockRefresh(),
}));

jest.mock('../../src/config/serviceConfig', () => ({
  getServiceConfig: jest.fn(() => ({ notificationsUrl: 'http://srv.test:7712/' })),
}));

const mockRequestPermissions = jest.fn();
const mockSaveToLibrary = jest.fn();
jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: (...args: any[]) => mockRequestPermissions(...args),
  saveToLibraryAsync: (...args: any[]) => mockSaveToLibrary(...args),
}));

const mockIsAvailable = jest.fn();
const mockShareAsync = jest.fn();
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockIsAvailable(),
  shareAsync: (...args: any[]) => mockShareAsync(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetToken.mockReturnValue('jwt-token');
  mockGetInfoAsync.mockResolvedValue({ exists: false });
  mockMakeDirectoryAsync.mockResolvedValue(undefined);
  mockDeleteAsync.mockResolvedValue(undefined);
});

describe('parseInboxAttachments', () => {
  const image = {
    id: 'a1',
    kind: 'image',
    url: '/api/v0/inbox/i1/attachments/a1',
    mime_type: 'image/png',
    thumbnail_url: '/thumb',
    width: 1024,
    height: 768,
    filename: 'cat.png',
    size_bytes: 1234,
  };

  it('parses the full shape from the top-level field', () => {
    expect(parseInboxAttachments({ attachments: [image], metadata: null })).toEqual([image]);
  });

  it('falls back to metadata.attachments', () => {
    const video = { kind: 'video', url: 'https://x.test/v.mp4', duration_seconds: 4.5 };
    expect(parseInboxAttachments({ metadata: { attachments: [video] } })).toEqual([
      { kind: 'video', url: 'https://x.test/v.mp4', duration_seconds: 4.5 },
    ]);
  });

  it('prefers the top-level list over metadata', () => {
    const other = { kind: 'image', url: '/other' };
    expect(
      parseInboxAttachments({ attachments: [image], metadata: { attachments: [other] } }),
    ).toEqual([image]);
  });

  it.each([
    ['a legacy item with no field', { metadata: { foo: 1 } }],
    ['null metadata', { metadata: null }],
    ['null attachments', { attachments: null, metadata: null }],
    ['a non-list', { attachments: 'pic.png', metadata: null }],
    ['an object', { attachments: { url: '/a' }, metadata: null }],
  ])('returns [] for %s', (_name, item) => {
    expect(parseInboxAttachments(item as any)).toEqual([]);
  });

  it('drops malformed entries and keeps the good ones', () => {
    const items = [
      null,
      'x',
      { kind: 'audio', url: '/a.wav' },
      { kind: 'image' },
      { kind: 'image', url: '' },
      { kind: 'image', url: '/w', width: 'big' },
      { kind: 'video', url: '/v', duration_seconds: '3s' },
      { kind: 'image', url: '/t', thumbnail_url: 5 },
      { kind: 'image', url: '/ok' },
    ];
    expect(parseInboxAttachments({ attachments: items, metadata: null })).toEqual([
      { kind: 'image', url: '/ok' },
    ]);
  });

  describe("jarvisd's shape", () => {
    it('derives the kind from mime and the url from the item and attachment ids', () => {
      const item = {
        id: 'item 1',
        attachments: [
          { id: 'a/1', mime: 'image/jpeg', size: 10, width: 4, height: 3, duration_ms: null },
          { id: 'a2', mime: 'video/webm', size: 20, width: null, height: null, duration_ms: 4500 },
        ],
        metadata: null,
      };
      expect(parseInboxAttachments(item)).toEqual([
        {
          id: 'a/1',
          kind: 'image',
          url: '/api/v0/inbox/item%201/attachments/a%2F1',
          mime_type: 'image/jpeg',
          size_bytes: 10,
          width: 4,
          height: 3,
        },
        {
          id: 'a2',
          kind: 'video',
          url: '/api/v0/inbox/item%201/attachments/a2',
          mime_type: 'video/webm',
          size_bytes: 20,
          duration_seconds: 4.5,
        },
      ]);
    });

    it('drops entries it cannot place or type', () => {
      const attachments = [
        { id: 'pdf', mime: 'application/pdf', size: 1 },
        { mime: 'image/png', size: 1 },
        { id: '', mime: 'image/png', size: 1 },
        { id: 'n', mime: 5, size: 1 },
        { id: 's', mime: 'image/png', size: '1' },
        { id: 'd', mime: 'video/mp4', size: 1, duration_ms: '4s' },
        { id: 'ok', mime: 'image/gif', size: 1 },
      ];
      expect(parseInboxAttachments({ id: 'i1', attachments, metadata: null })).toEqual([
        { id: 'ok', kind: 'image', url: '/api/v0/inbox/i1/attachments/ok', mime_type: 'image/gif', size_bytes: 1 },
      ]);
    });

    it('needs the item id to build a url', () => {
      expect(parseInboxAttachments({ attachments: [{ id: 'a1', mime: 'image/png' }] })).toEqual([]);
    });
  });

  it('caps the list at 10', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ kind: 'image', url: `/a${i}` }));
    expect(parseInboxAttachments({ attachments: many, metadata: null })).toHaveLength(10);
  });
});

describe('resolveMediaUrl', () => {
  it('passes absolute URLs through', () => {
    expect(resolveMediaUrl('https://cdn.test/a.png')).toBe('https://cdn.test/a.png');
  });

  it('resolves relative paths against the notifications (inbox) service', () => {
    expect(resolveMediaUrl('/api/v0/inbox/i1/attachments/a1')).toBe(
      'http://srv.test:7712/api/v0/inbox/i1/attachments/a1',
    );
    expect(resolveMediaUrl('x/y')).toBe('http://srv.test:7712/x/y');
  });
});

describe('downloadInboxMedia', () => {
  it('downloads with the JWT into the media cache, keeping an extension', async () => {
    mockDownloadAsync.mockResolvedValue({ status: 200 });
    const uri = await downloadInboxMedia('/api/v0/inbox/i1/attachments/a1', 'image/png');
    expect(uri).toMatch(/^file:\/\/\/cache\/inbox-media\/[0-9a-f]+\.png$/);
    expect(mockDownloadAsync).toHaveBeenCalledWith(
      'http://srv.test:7712/api/v0/inbox/i1/attachments/a1',
      uri,
      { headers: { Authorization: 'Bearer jwt-token' } },
    );
  });

  it('guesses the extension from the URL when there is no mime type', async () => {
    mockDownloadAsync.mockResolvedValue({ status: 200 });
    const uri = await downloadInboxMedia('https://x.test/clip.MP4?sig=1');
    expect(uri).toMatch(/\.mp4$/);
  });

  it('returns the cached file without downloading again', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    const uri = await downloadInboxMedia('/a', 'image/jpeg');
    expect(uri).toMatch(/\.jpg$/);
    expect(mockDownloadAsync).not.toHaveBeenCalled();
  });

  it('refreshes the token once on 401 and retries with the new one', async () => {
    mockDownloadAsync
      .mockResolvedValueOnce({ status: 401 })
      .mockResolvedValueOnce({ status: 200 });
    mockRefresh.mockImplementation(async () => {
      mockGetToken.mockReturnValue('fresh-token');
      return 'fresh-token';
    });

    await downloadInboxMedia('/a', 'image/png');

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockDownloadAsync).toHaveBeenCalledTimes(2);
    expect(mockDownloadAsync.mock.calls[1][2]).toEqual({
      headers: { Authorization: 'Bearer fresh-token' },
    });
  });

  it('gives up after one retry and does not leave the error body cached', async () => {
    mockDownloadAsync.mockResolvedValue({ status: 401 });
    mockRefresh.mockResolvedValue('fresh-token');

    await expect(downloadInboxMedia('/a', 'image/png')).rejects.toThrow('HTTP 401');
    expect(mockDownloadAsync).toHaveBeenCalledTimes(2);
    expect(mockDeleteAsync).toHaveBeenCalled();
  });

  it('does not retry other failures', async () => {
    mockDownloadAsync.mockResolvedValue({ status: 404 });
    await expect(downloadInboxMedia('/a', 'image/png')).rejects.toThrow('HTTP 404');
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockDeleteAsync).toHaveBeenCalled();
  });
});

describe('saveMediaToPhotos', () => {
  it('asks for write-only permission, then saves', async () => {
    mockRequestPermissions.mockResolvedValue({ granted: true });
    await expect(saveMediaToPhotos('file:///cache/inbox-media/1.png')).resolves.toBe('saved');
    expect(mockRequestPermissions).toHaveBeenCalledWith(true);
    expect(mockSaveToLibrary).toHaveBeenCalledWith('file:///cache/inbox-media/1.png');
  });

  it('reports a refusal without saving', async () => {
    mockRequestPermissions.mockResolvedValue({ granted: false });
    await expect(saveMediaToPhotos('file:///x.png')).resolves.toBe('denied');
    expect(mockSaveToLibrary).not.toHaveBeenCalled();
  });
});

describe('shareMedia', () => {
  it('opens the share sheet on the local file', async () => {
    mockIsAvailable.mockResolvedValue(true);
    await expect(shareMedia('file:///x.png', 'image/png')).resolves.toBe(true);
    expect(mockShareAsync).toHaveBeenCalledWith('file:///x.png', { mimeType: 'image/png' });
  });

  it('returns false when sharing is unavailable', async () => {
    mockIsAvailable.mockResolvedValue(false);
    await expect(shareMedia('file:///x.png')).resolves.toBe(false);
    expect(mockShareAsync).not.toHaveBeenCalled();
  });
});
