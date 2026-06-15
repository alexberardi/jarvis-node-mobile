/**
 * Quick-open deep links for the iOS "instant trigger" entry points
 * (Action Button / Control Center / Lock Screen / Back Tap / Shortcuts).
 *
 * Every native entry point is a thin shell that opens one of these URLs;
 * the app already registers the `com.jarvis.app` scheme in app.json. Two
 * intents are supported:
 *   - `com.jarvis.app://stt`  (aliases: ://listen) -> open chat + start listening
 *   - `com.jarvis.app://chat` (aliases: ://open, ://home) -> just open chat
 *
 * OAuth redirects use `WebBrowser.openAuthSessionAsync` (which captures its
 * own redirect and never reaches `Linking`), and their host is
 * `auth-complete`/`oauthredirect` — so the host allow-list below cannot
 * collide with auth flows or the Google reverse-DNS scheme.
 *
 * Delivery model: the incoming URL is parsed into an intent and *stashed*.
 * App.tsx brings the chat screen into focus, and HomeScreen is the
 * authoritative consumer — it drains the stash when it gains focus and via
 * the subscription below when an intent arrives while it is already focused.
 * Routing consumption through HomeScreen (which only exists once the user is
 * authenticated and the Main navigator is live) avoids races with the
 * auth-gated Auth->Main navigator swap.
 */

export type QuickOpenIntent = 'stt' | 'chat';

/**
 * The Associated Domain hosting the Universal Link used by the Control Center /
 * Lock Screen control. Must match `ios.associatedDomains` in app.json and the
 * AASA hosted at https://<host>/.well-known/apple-app-site-association.
 */
export const UNIVERSAL_LINK_HOST = 'docs.jarvisautomation.dev';

/**
 * Returns the quick-open intent encoded in a deep link, or null if the URL
 * isn't one of ours. Accepts BOTH transports:
 *   1. Custom scheme `com.jarvis.app://stt|chat` — the Action Button / Siri /
 *      Shortcuts / Spotlight intents, which run in the MAIN app target and
 *      foreground the app via UIApplication.open.
 *   2. https Universal Link `https://docs.jarvisautomation.dev/app/stt|chat` —
 *      the Control Center / Lock Screen control, whose intent runs in a widget
 *      extension (no UIApplication) and can only open the app via a Universal
 *      Link (custom schemes are unsupported from a Control).
 * Both map to the same QuickOpenIntent and flow through the same stash.
 */
export function parseQuickOpenUrl(
  url: string | null | undefined,
): QuickOpenIntent | null {
  if (!url) return null;

  // 1) Custom scheme: com.jarvis.app://stt|listen|chat|open|home
  const scheme = url.match(/^com\.jarvis\.app:\/\/(stt|listen|chat|open|home)\b/i);
  if (scheme) {
    const host = scheme[1].toLowerCase();
    return host === 'stt' || host === 'listen' ? 'stt' : 'chat';
  }

  // 2) Universal Link: https://docs.jarvisautomation.dev/app/(stt|listen|chat|open|home)
  const escapedHost = UNIVERSAL_LINK_HOST.replace(/\./g, '\\.');
  const link = url.match(
    new RegExp(`^https?:\\/\\/${escapedHost}\\/app\\/(stt|listen|chat|open|home)\\b`, 'i'),
  );
  if (link) {
    const path = link[1].toLowerCase();
    return path === 'stt' || path === 'listen' ? 'stt' : 'chat';
  }

  return null;
}

// ── Pending intent stash ─────────────────────────────────────────────────
// A deep link can arrive before the user is authenticated (cold launch into
// the login screen). We stash the intent and let HomeScreen drain it once it
// mounts/focuses. Module-level state is intentional: it must survive the
// auth-gated remount of the navigation tree.

type Listener = () => void;

let pending: QuickOpenIntent | null = null;
const listeners = new Set<Listener>();

export const setPendingIntent = (intent: QuickOpenIntent | null): void => {
  pending = intent;
  if (intent) listeners.forEach((listener) => listener());
};

export const peekPendingIntent = (): QuickOpenIntent | null => pending;

export const consumePendingIntent = (): QuickOpenIntent | null => {
  const intent = pending;
  pending = null;
  return intent;
};

/**
 * Subscribe to be notified when a new intent is stashed (so a screen that is
 * already focused can drain it without waiting for a focus change). Returns
 * an unsubscribe function.
 */
export const subscribePendingIntent = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
