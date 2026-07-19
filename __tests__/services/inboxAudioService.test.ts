import {
  downloadInboxAudio,
  parseInboxAudio,
  resolveAudioUrl,
} from '../../src/services/inboxAudioService';

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

jest.mock('../../src/api/apiClient', () => ({
  getCurrentAccessToken: jest.fn(() => 'jwt-token'),
}));

jest.mock('../../src/config/serviceConfig', () => ({
  getCommandCenterUrl: jest.fn(() => 'http://cc.test:7703'),
}));

describe('parseInboxAudio', () => {
  it('parses the full shape', () => {
    expect(
      parseInboxAudio({
        audio: { url: '/api/v0/phone/sessions/s1/audio', duration_seconds: 93, title: 'Call' },
      }),
    ).toEqual({ url: '/api/v0/phone/sessions/s1/audio', duration_seconds: 93, title: 'Call' });
  });

  it.each([
    ['absent', {}],
    ['null', null],
    ['not an object', { audio: 'x.wav' }],
    ['missing url', { audio: { duration_seconds: 3 } }],
    ['empty url', { audio: { url: '' } }],
    ['bad duration type', { audio: { url: '/a.wav', duration_seconds: 'long' } }],
  ])('rejects %s', (_name, metadata) => {
    expect(parseInboxAudio(metadata as any)).toBeNull();
  });
});

describe('resolveAudioUrl', () => {
  it('passes absolute URLs through', () => {
    expect(resolveAudioUrl('https://cdn.test/a.wav')).toBe('https://cdn.test/a.wav');
  });

  it('resolves relative paths against command-center', () => {
    expect(resolveAudioUrl('/api/v0/phone/sessions/s1/audio')).toBe(
      'http://cc.test:7703/api/v0/phone/sessions/s1/audio',
    );
  });
});

describe('downloadInboxAudio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInfoAsync.mockResolvedValue({ exists: false });
    mockMakeDirectoryAsync.mockResolvedValue(undefined);
    mockDeleteAsync.mockResolvedValue(undefined);
  });

  it('downloads with the JWT and returns the cache uri', async () => {
    mockDownloadAsync.mockResolvedValue({ status: 200 });

    const uri = await downloadInboxAudio('/api/v0/phone/sessions/s1/audio');

    expect(uri).toMatch(/^file:\/\/\/cache\/inbox-audio\/[0-9a-f]+\.wav$/);
    const [url, fileUri, options] = mockDownloadAsync.mock.calls[0];
    expect(url).toBe('http://cc.test:7703/api/v0/phone/sessions/s1/audio');
    expect(fileUri).toBe(uri);
    expect(options.headers.Authorization).toBe('Bearer jwt-token');
  });

  it('returns the cached file without re-downloading', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true });

    const uri = await downloadInboxAudio('/a.wav');

    expect(uri).toContain('inbox-audio/');
    expect(mockDownloadAsync).not.toHaveBeenCalled();
  });

  it('throws and removes the file on a non-200 download (never cache an error body)', async () => {
    mockDownloadAsync.mockResolvedValue({ status: 401 });

    await expect(downloadInboxAudio('/a.wav')).rejects.toThrow('HTTP 401');
    expect(mockDeleteAsync).toHaveBeenCalledWith(
      expect.stringContaining('inbox-audio/'),
      { idempotent: true },
    );
  });
});
