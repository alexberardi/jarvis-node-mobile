import authApi from '../../src/api/authApi';
import { updateMyDisplayName } from '../../src/api/accountApi';

jest.mock('../../src/api/authApi', () => ({
  __esModule: true,
  default: { patch: jest.fn(), delete: jest.fn() },
}));

const mockPatch = authApi.patch as jest.Mock;

describe('updateMyDisplayName', () => {
  beforeEach(() => jest.clearAllMocks());

  it('PATCHes /auth/me with the trimmed name and the bearer token', async () => {
    mockPatch.mockResolvedValue({
      data: { id: 1, email: 'j@example.com', username: 'jordan', display_name: 'Jordan' },
    });

    const me = await updateMyDisplayName('  Jordan ', 'tok');

    expect(mockPatch).toHaveBeenCalledWith(
      '/auth/me',
      { display_name: 'Jordan' },
      { headers: { Authorization: 'Bearer tok' } },
    );
    expect(me.display_name).toBe('Jordan');
  });

  it('sends an empty string to clear the name', async () => {
    mockPatch.mockResolvedValue({ data: { id: 1, email: 'j@example.com', display_name: null } });
    await updateMyDisplayName('   ', 'tok');
    expect(mockPatch.mock.calls[0][1]).toEqual({ display_name: '' });
  });

  it('surfaces the server detail on 422', async () => {
    mockPatch.mockRejectedValue({ response: { status: 422, data: { detail: 'bad name' } } });
    await expect(updateMyDisplayName('x\u0007', 'tok')).rejects.toThrow('bad name');
  });

  it('explains when the server predates display names', async () => {
    mockPatch.mockRejectedValue({ response: { status: 405 } });
    await expect(updateMyDisplayName('Jordan', 'tok')).rejects.toThrow(/doesn’t support/);
  });

  it('gives a generic message otherwise', async () => {
    mockPatch.mockRejectedValue(new Error('network'));
    await expect(updateMyDisplayName('Jordan', 'tok')).rejects.toThrow(/Could not save/);
  });
});
