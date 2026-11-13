/**
 * Android Auto car chat: transport order, auth handling and speech shaping.
 * The headless context has no React tree, so everything is read from storage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { postReply } from '../../modules/jarvis-car';
import {
  CAR_CONVERSATION_KEY,
  CAR_PUBLIC_URL_KEY,
  LAST_NODE_KEY,
  ACTIVE_HOUSEHOLD_KEY,
} from '../../src/config/storageKeys';
import {
  askJarvis,
  carReplyTask,
  MSG_NO_NODE,
  MSG_SIGN_IN,
  MSG_UNREACHABLE,
  toSpeech,
} from '../../src/services/carChatService';

jest.mock('../../src/services/tokenStorage', () => ({
  readTokenForBg: jest.fn(),
  persistBgRotatedTokens: jest.fn(),
}));
jest.mock('../../src/services/presenceService', () => ({
  accessTokenUsable: jest.fn(() => true),
  bgRefresh: jest.fn(),
}));
jest.mock('../../src/config/serviceConfig', () => ({
  getServiceConfig: () => ({
    commandCenterUrl: 'http://ts.example',
    authBaseUrl: 'http://ts.example/auth',
  }),
  loadCachedConfig: jest.fn(),
}));

const { readTokenForBg } = jest.requireMock('../../src/services/tokenStorage');

const sse = (...events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
const res = (status: number, body = '') => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
});

const calls = () => (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem(ACTIVE_HOUSEHOLD_KEY, 'hh1');
  await AsyncStorage.setItem(LAST_NODE_KEY, 'node1');
  readTokenForBg.mockResolvedValue({ access: 'tok', refresh: null });
  global.fetch = jest.fn();
});

describe('toSpeech', () => {
  it('strips markdown and collapses whitespace', () => {
    expect(toSpeech('**Done**\n\nSee [the docs](http://x) `now`')).toBe('Done See the docs now');
  });

  it('caps long text at a sentence end', () => {
    const long = ('This is a sentence. ').repeat(40);
    const out = toSpeech(long);
    expect(out.length).toBeLessThanOrEqual(400);
    expect(out.endsWith('.')).toBe(true);
  });
});

describe('askJarvis', () => {
  it('uses the Tailscale URL first and remembers the conversation', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(res(200)) // /health
      .mockResolvedValueOnce(
        res(200, sse({ type: 'done', full_text: 'Lights are off.', conversation_id: 'c1' })),
      );
    expect(await askJarvis('turn off the lights')).toBe('Lights are off.');
    expect(calls()).toEqual(['http://ts.example/health', 'http://ts.example/api/v0/mobile/chat']);
    const saved = JSON.parse((await AsyncStorage.getItem(CAR_CONVERSATION_KEY)) as string);
    expect(saved.id).toBe('c1');
  });

  it('falls back to the public URL when Tailscale is unreachable', async () => {
    await AsyncStorage.setItem(CAR_PUBLIC_URL_KEY, 'https://pub.example/');
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('timeout')) // tailscale /health
      .mockResolvedValueOnce(res(200)) // public /health
      .mockResolvedValueOnce(res(200, sse({ type: 'done', full_text: 'Hi.' })));
    expect(await askJarvis('hello')).toBe('Hi.');
    expect(calls()[2]).toBe('https://pub.example/api/v0/mobile/chat');
  });

  it('says so when no transport is reachable', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('down'));
    expect(await askJarvis('hello')).toBe(MSG_UNREACHABLE);
  });

  it('asks the user to sign in on a 401', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(res(200)).mockResolvedValueOnce(res(401));
    expect(await askJarvis('hello')).toBe(MSG_SIGN_IN);
  });

  it('asks the user to sign in when there is no token', async () => {
    readTokenForBg.mockResolvedValue({ access: null, refresh: null });
    expect(await askJarvis('hello')).toBe(MSG_SIGN_IN);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('asks for a node when none was ever picked', async () => {
    await AsyncStorage.removeItem(LAST_NODE_KEY);
    expect(await askJarvis('hello')).toBe(MSG_NO_NODE);
  });

  it('speaks the server error message from an error event', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(res(200))
      .mockResolvedValueOnce(res(200, sse({ type: 'error', message: 'Node is offline.' })));
    expect(await askJarvis('hello')).toBe('Node is offline.');
  });
});

describe('carReplyTask', () => {
  it('posts the answer through the native notifier', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(res(200))
      .mockResolvedValueOnce(res(200, sse({ type: 'done', full_text: 'Okay.' })));
    await carReplyTask({ text: 'do it' });
    expect(postReply).toHaveBeenCalledWith('Okay.');
  });

  it('ignores an empty command', async () => {
    await carReplyTask({ text: '  ' });
    expect(postReply).not.toHaveBeenCalled();
  });
});
