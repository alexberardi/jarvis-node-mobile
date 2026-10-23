import apiClient from '../../src/api/apiClient';
import { getLatestRelease } from '../../src/api/nodeUpdateApi';

// The latest release is per node kind (go | python): the app names the node,
// through apiClient so the bearer token goes with it (#487, #496).

jest.mock('../../src/api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

jest.mock('../../src/config/serviceConfig', () => ({
  ...jest.requireActual('../../src/config/serviceConfig'),
  getCommandCenterUrl: jest.fn().mockReturnValue('http://192.168.1.10:8002'),
}));

beforeEach(() => jest.clearAllMocks());

it('asks for the release of the node, through the authenticated client', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({
    data: { tag: 'v0.1.0-rc19', version: '0.1.0-rc19', published_at: null, kind: 'go' },
  });
  const release = await getLatestRelease('node/1 a');
  expect(apiClient.get).toHaveBeenCalledWith(
    'http://192.168.1.10:8002/api/v0/releases/latest?node_id=node%2F1%20a',
    { timeout: 6000 },
  );
  expect(release).toEqual({ tag: 'v0.1.0-rc19', version: '0.1.0-rc19', published_at: null, kind: 'go' });
});

it('returns null when the server has no release', async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({ data: null });
  expect(await getLatestRelease('n1')).toBeNull();
});

it('returns null on an error (a 403 for a non-member)', async () => {
  (apiClient.get as jest.Mock).mockRejectedValue(Object.assign(new Error('forbidden'), { response: { status: 403 } }));
  expect(await getLatestRelease('n1')).toBeNull();
});
