/**
 * The quick-open deep links (src/navigation/deepLinks.ts) only reach the app if the OS
 * routes their scheme to it. iOS registers `com.jarvis.app` in CFBundleURLTypes; Android
 * needs an intent filter, since Expo registers only the package name as a scheme there.
 */
import appJson from '../../app.json';
import { parseQuickOpenUrl } from '../../src/navigation/deepLinks';

const SCHEME = 'com.jarvis.app';

type IntentFilter = {
  action?: string;
  category?: string[];
  data?: { scheme?: string; host?: string }[];
};

describe('quick-open URL scheme registration', () => {
  it('is the scheme deepLinks.ts parses', () => {
    expect(parseQuickOpenUrl(`${SCHEME}://chat`)).toBe('chat');
    expect(parseQuickOpenUrl(`${SCHEME}://stt`)).toBe('stt');
  });

  it('is registered on iOS', () => {
    const types = appJson.expo.ios.infoPlist.CFBundleURLTypes as { CFBundleURLSchemes: string[] }[];
    expect(types.flatMap((t) => t.CFBundleURLSchemes)).toContain(SCHEME);
  });

  it('is registered on Android as a browsable VIEW intent filter', () => {
    const filters = ((appJson.expo.android as { intentFilters?: IntentFilter[] }).intentFilters ?? []);
    const match = filters.find(
      (f) =>
        f.action === 'VIEW' &&
        (f.category ?? []).includes('BROWSABLE') &&
        (f.category ?? []).includes('DEFAULT') &&
        (f.data ?? []).some((d) => d.scheme === SCHEME && d.host === undefined),
    );
    expect(match).toBeDefined();
  });
});
