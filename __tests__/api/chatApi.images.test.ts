/**
 * chatApi — image-related contract: GET /mobile/chat/capabilities (legacy 404 or
 * any error = no images, cached per server) and ChatRequestError code parsing
 * for the 422 image rejections.
 */
import apiClient from '../../src/api/apiClient';
import {
  ChatRequestError,
  clearChatCapabilitiesCache,
  fetchChatCapabilities,
  getCachedChatCapabilities,
} from '../../src/api/chatApi';

let mockCcUrl = 'http://cc.test';
jest.mock('../../src/config/serviceConfig', () => ({
  getCommandCenterUrl: () => mockCcUrl,
}));

jest.mock('../../src/api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  refreshAuthToken: jest.fn(),
}));

const mockGet = (apiClient as unknown as { get: jest.Mock }).get;

beforeEach(() => {
  jest.clearAllMocks();
  clearChatCapabilitiesCache();
  mockCcUrl = 'http://cc.test';
});

describe('fetchChatCapabilities', () => {
  it('reads the capabilities endpoint', async () => {
    mockGet.mockResolvedValue({ data: { images: true, max_images: 4, max_image_bytes: 2097152 } });
    const caps = await fetchChatCapabilities();
    expect(mockGet).toHaveBeenCalledWith(
      'http://cc.test/api/v0/mobile/chat/capabilities',
      expect.anything(),
    );
    expect(caps).toEqual({ images: true, max_images: 4, max_image_bytes: 2097152 });
  });

  it('treats a legacy server (404) as no images', async () => {
    mockGet.mockRejectedValue(Object.assign(new Error('nf'), { response: { status: 404 } }));
    await expect(fetchChatCapabilities()).resolves.toMatchObject({ images: false });
  });

  it('treats a network error as no images', async () => {
    mockGet.mockRejectedValue(new Error('Network Error'));
    await expect(fetchChatCapabilities()).resolves.toMatchObject({ images: false });
  });

  it('reports images: false when the server says so', async () => {
    mockGet.mockResolvedValue({ data: { images: false, max_images: 4, max_image_bytes: 2097152 } });
    await expect(fetchChatCapabilities()).resolves.toMatchObject({ images: false });
  });

  it('caches the last read per server', async () => {
    mockGet.mockResolvedValueOnce({ data: { images: true, max_images: 4, max_image_bytes: 100 } });
    await fetchChatCapabilities();
    expect(getCachedChatCapabilities()).toMatchObject({ images: true });

    mockCcUrl = 'http://other.test';
    expect(getCachedChatCapabilities()).toBeNull();
  });
});

describe('ChatRequestError', () => {
  it('parses a top-level code', () => {
    const err = new ChatRequestError(422, JSON.stringify({ code: 'images_unavailable', detail: 'off' }));
    expect(err.status).toBe(422);
    expect(err.code).toBe('images_unavailable');
  });

  it('parses a FastAPI-style nested code', () => {
    const err = new ChatRequestError(422, JSON.stringify({ detail: { code: 'images_invalid' } }));
    expect(err.code).toBe('images_invalid');
  });

  it('keeps the legacy message format and tolerates non-JSON bodies', () => {
    const err = new ChatRequestError(500, 'boom');
    expect(err.code).toBeNull();
    expect(err.message).toBe('Chat request failed (500): boom');
  });
});
