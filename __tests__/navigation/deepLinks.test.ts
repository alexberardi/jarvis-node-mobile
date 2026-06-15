import {
  parseQuickOpenUrl,
  setPendingIntent,
  peekPendingIntent,
  consumePendingIntent,
  subscribePendingIntent,
} from '../../src/navigation/deepLinks';

describe('parseQuickOpenUrl', () => {
  it('maps stt/listen hosts to the stt intent', () => {
    expect(parseQuickOpenUrl('com.jarvis.app://stt')).toBe('stt');
    expect(parseQuickOpenUrl('com.jarvis.app://stt/')).toBe('stt');
    expect(parseQuickOpenUrl('com.jarvis.app://listen')).toBe('stt');
    expect(parseQuickOpenUrl('COM.JARVIS.APP://STT')).toBe('stt');
  });

  it('maps chat/open/home hosts to the chat intent', () => {
    expect(parseQuickOpenUrl('com.jarvis.app://chat')).toBe('chat');
    expect(parseQuickOpenUrl('com.jarvis.app://open')).toBe('chat');
    expect(parseQuickOpenUrl('com.jarvis.app://home')).toBe('chat');
  });

  it('maps the docs Universal Link (/app/*) to the right intent', () => {
    expect(parseQuickOpenUrl('https://docs.jarvisautomation.dev/app/stt')).toBe('stt');
    expect(parseQuickOpenUrl('https://docs.jarvisautomation.dev/app/listen')).toBe('stt');
    expect(parseQuickOpenUrl('https://docs.jarvisautomation.dev/app/chat')).toBe('chat');
    expect(parseQuickOpenUrl('https://docs.jarvisautomation.dev/app/open')).toBe('chat');
    expect(parseQuickOpenUrl('https://docs.jarvisautomation.dev/app/stt/')).toBe('stt');
  });

  it('ignores non-/app Universal Link paths and other hosts (does not shadow docs pages)', () => {
    // Real documentation pages must NOT be hijacked.
    expect(parseQuickOpenUrl('https://docs.jarvisautomation.dev/stt')).toBeNull();
    expect(parseQuickOpenUrl('https://docs.jarvisautomation.dev/guides/stt')).toBeNull();
    expect(parseQuickOpenUrl('https://docs.jarvisautomation.dev/app/sttextra')).toBeNull();
    expect(parseQuickOpenUrl('https://evil.com/app/stt')).toBeNull();
  });

  it('ignores OAuth redirects, the Google scheme, and unknown hosts', () => {
    expect(parseQuickOpenUrl('com.jarvis.app://oauthredirect')).toBeNull();
    expect(parseQuickOpenUrl('com.jarvis.app://auth-complete')).toBeNull();
    expect(parseQuickOpenUrl('jarvis://auth-complete')).toBeNull();
    expect(
      parseQuickOpenUrl('com.googleusercontent.apps.123://callback'),
    ).toBeNull();
    expect(parseQuickOpenUrl('https://example.com/stt')).toBeNull();
  });

  it('does not match a host that merely starts with an allowed word', () => {
    // \b guards against "sttsomething" being treated as "stt"
    expect(parseQuickOpenUrl('com.jarvis.app://sttextra')).toBeNull();
    expect(parseQuickOpenUrl('com.jarvis.app://chatroom')).toBeNull();
  });

  it('returns null for empty / nullish input', () => {
    expect(parseQuickOpenUrl('')).toBeNull();
    expect(parseQuickOpenUrl(null)).toBeNull();
    expect(parseQuickOpenUrl(undefined)).toBeNull();
  });
});

describe('pending intent stash', () => {
  afterEach(() => setPendingIntent(null));

  it('stores, peeks (non-destructive), and consumes (destructive)', () => {
    expect(peekPendingIntent()).toBeNull();
    setPendingIntent('stt');
    expect(peekPendingIntent()).toBe('stt');
    expect(peekPendingIntent()).toBe('stt'); // peek does not clear
    expect(consumePendingIntent()).toBe('stt');
    expect(peekPendingIntent()).toBeNull(); // consume cleared it
    expect(consumePendingIntent()).toBeNull();
  });
});

describe('subscribePendingIntent', () => {
  afterEach(() => setPendingIntent(null));

  it('notifies subscribers when an intent is stashed, and unsubscribes', () => {
    const listener = jest.fn();
    const unsubscribe = subscribePendingIntent(listener);

    setPendingIntent('stt');
    expect(listener).toHaveBeenCalledTimes(1);

    setPendingIntent('chat');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setPendingIntent('stt');
    expect(listener).toHaveBeenCalledTimes(2); // no longer notified
  });

  it('does not notify when the stash is cleared (set to null)', () => {
    const listener = jest.fn();
    const unsubscribe = subscribePendingIntent(listener);

    setPendingIntent(null);
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });
});
