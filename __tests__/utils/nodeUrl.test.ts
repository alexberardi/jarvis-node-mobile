import {
  assertNodeReachableUrl,
  isLoopbackHost,
  isLoopbackUrl,
  LOOPBACK_NODE_URL_MESSAGE,
} from '../../src/utils/nodeUrl';

describe('nodeUrl (2026-10-09: a node was handed http://localhost:7703)', () => {
  it.each([
    'http://localhost:7703',
    'http://LOCALHOST:7703/',
    'http://localhost',
    'http://localhost.:7700',
    'http://app.localhost:7703',
    'http://127.0.0.1:7703',
    'http://127.1.2.3',
    'https://[::1]:7703/api',
    'http://0.0.0.0:7703',
    'http://user@localhost:7703',
    ' http://localhost:7703 ',
  ])('treats %s as loopback', (url) => {
    expect(isLoopbackUrl(url)).toBe(true);
    expect(() => assertNodeReachableUrl(url)).toThrow(LOOPBACK_NODE_URL_MESSAGE);
  });

  it.each([
    'http://192.168.1.50:7703',
    'http://10.0.0.122:7700',
    'http://jarvis.local:7703',
    'https://command-center.example.io',
    'http://[fd00::5]:7703',
    'http://localhost-server.lan:7703',
    'http://128.0.0.1:7703',
  ])('accepts %s', (url) => {
    expect(isLoopbackUrl(url)).toBe(false);
    expect(() => assertNodeReachableUrl(url)).not.toThrow();
  });

  it('ignores an absent URL (the node keeps its own default)', () => {
    expect(() => assertNodeReachableUrl(undefined)).not.toThrow();
    expect(() => assertNodeReachableUrl(null)).not.toThrow();
    expect(() => assertNodeReachableUrl('')).not.toThrow();
  });

  it('does not call an unparseable string loopback', () => {
    expect(isLoopbackUrl('not a url')).toBe(false);
  });

  it('isLoopbackHost handles bracketed IPv6', () => {
    expect(isLoopbackHost('[::1]')).toBe(true);
    expect(isLoopbackHost('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackHost('fe80::1')).toBe(false);
  });
});
