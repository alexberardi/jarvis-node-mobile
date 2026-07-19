import apiClient from '../../src/api/apiClient';
import {
  createPhoneContact,
  deletePhoneContact,
  listPhoneContacts,
  numberRejectionMessage,
  updatePhoneContact,
} from '../../src/api/phoneContactsApi';

jest.mock('../../src/api/apiClient', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../../src/config/serviceConfig', () => ({
  ...jest.requireActual('../../src/config/serviceConfig'),
  getCommandCenterUrl: jest.fn().mockReturnValue('http://10.0.0.10:7703'),
}));

const HH = 'hh-1';
const BASE = `http://10.0.0.10:7703/api/v0/mobile/household/${HH}/phone-contacts`;

const contact = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: "Tony's Pizzeria",
  number: '+15551234567',
  address: null,
  source: 'call',
  line_type: 'landline',
  do_not_call: false,
  notes: null,
  verified_at: null,
  created_at: '2026-07-20T00:00:00Z',
  ...over,
});

describe('phoneContactsApi', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('listPhoneContacts', () => {
    it('hits the household path and unwraps the envelope', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { contacts: [contact()] },
      });
      const result = await listPhoneContacts(HH);
      expect(apiClient.get).toHaveBeenCalledWith(BASE);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Tony's Pizzeria");
    });

    it('returns [] when the envelope is empty', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: {} });
      expect(await listPhoneContacts(HH)).toEqual([]);
    });
  });

  it('createPhoneContact POSTs the draft and returns the created contact', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({ data: contact() });
    const result = await createPhoneContact(HH, {
      name: "Tony's Pizzeria",
      number: '+15551234567',
    });
    expect(apiClient.post).toHaveBeenCalledWith(BASE, {
      name: "Tony's Pizzeria",
      number: '+15551234567',
    });
    expect(result.id).toBe('c1');
  });

  it('updatePhoneContact PATCHes only the supplied fields', async () => {
    (apiClient.patch as jest.Mock).mockResolvedValueOnce({
      data: contact({ do_not_call: true }),
    });
    const result = await updatePhoneContact(HH, 'c1', { do_not_call: true });
    expect(apiClient.patch).toHaveBeenCalledWith(`${BASE}/c1`, {
      do_not_call: true,
    });
    expect(result.do_not_call).toBe(true);
  });

  it('deletePhoneContact DELETEs the contact path', async () => {
    (apiClient.delete as jest.Mock).mockResolvedValueOnce({ status: 204 });
    await deletePhoneContact(HH, 'c1');
    expect(apiClient.delete).toHaveBeenCalledWith(`${BASE}/c1`);
  });

  describe('numberRejectionMessage', () => {
    it('surfaces a FastAPI string detail', () => {
      const err = {
        response: { status: 400, data: { detail: 'Emergency numbers cannot be called' } },
      };
      expect(numberRejectionMessage(err)).toBe('Emergency numbers cannot be called');
    });

    it('surfaces the first msg from a validation-error array', () => {
      const err = {
        response: { status: 400, data: { detail: [{ msg: 'invalid E.164 number' }] } },
      };
      expect(numberRejectionMessage(err)).toBe('invalid E.164 number');
    });

    it('handles a plain-string body', () => {
      const err = { response: { status: 400, data: 'Not a valid number' } };
      expect(numberRejectionMessage(err)).toBe('Not a valid number');
    });

    it('falls back to a generic message on an unreadable 400 body', () => {
      const err = { response: { status: 400, data: {} } };
      expect(numberRejectionMessage(err)).toBe('That phone number looks invalid.');
    });

    it('returns null for non-400 failures so they surface as real errors', () => {
      expect(numberRejectionMessage({ response: { status: 500, data: {} } })).toBeNull();
      expect(numberRejectionMessage(new Error('network'))).toBeNull();
      expect(numberRejectionMessage(undefined)).toBeNull();
    });
  });
});
