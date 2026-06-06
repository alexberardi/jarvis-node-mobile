import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import StoreDetailScreen from '../../src/screens/Store/StoreDetailScreen';
import { HelpProvider } from '../../src/components/HelpProvider';
import { lightTheme } from '../../src/theme';
import type { PackageDetail, PackageDownloadInfo } from '../../src/types/Package';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: { commandName: 'mpv-play' } }),
}));

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    state: {
      isAuthenticated: true,
      accessToken: 'mock-token',
      activeHouseholdId: 'h1',
      households: [{ id: 'h1', name: 'Home', role: 'admin' }],
    },
  }),
}));

jest.mock('../../src/config/serviceConfig', () => ({
  getServiceConfig: () => ({ commandCenterUrl: 'https://cc.test' }),
}));

const mockGetPackageDetail = jest.fn();
const mockGetDownloadInfo = jest.fn();

jest.mock('../../src/api/pantryApi', () => ({
  getPackageDetail: (...args: unknown[]) => mockGetPackageDetail(...args),
  getDownloadInfo: (...args: unknown[]) => mockGetDownloadInfo(...args),
}));

const mockRequestInstall = jest.fn();
const mockRequestCCInstall = jest.fn();

jest.mock('../../src/api/packageInstallApi', () => ({
  requestInstall: (...args: unknown[]) => mockRequestInstall(...args),
  requestCCInstall: (...args: unknown[]) => mockRequestCCInstall(...args),
}));

const mockFetchNodeTools = jest.fn();

jest.mock('../../src/api/chatApi', () => ({
  fetchNodeTools: (...args: unknown[]) => mockFetchNodeTools(...args),
}));

const mockApiClientGet = jest.fn();

jest.mock('../../src/api/apiClient', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockApiClientGet(...args) },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>
    <HelpProvider>{children}</HelpProvider>
  </PaperProvider>
);

const baseDetail: PackageDetail = {
  command_name: 'mpv-play',
  display_name: 'MPV Play',
  description: 'Play media via mpv',
  github_repo_url: 'https://github.com/example/mpv-play',
  author: { github: 'example', display_name: 'Example', avatar_url: '' },
  latest_version: '1.0.0',
  categories: ['media'],
  platforms: ['linux'],
  license: 'MIT',
  install_count: 5,
  danger_rating: 2,
  verified: true,
  icon_url: '',
  package_type: 'command',
  components: [
    { type: 'command', name: 'mpv-play', path: '.', description: 'Play media' },
  ],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  security_report: null,
  review_count: 0,
  avg_rating: null,
};

const promptProviderDetail: PackageDetail = {
  ...baseDetail,
  command_name: 'fancy-prompt',
  display_name: 'Fancy Prompt',
  components: [
    { type: 'prompt_provider', name: 'fancy-prompt', path: '.', description: 'A prompt' },
  ],
};

const makeDownloadInfo = (
  manifest: Record<string, unknown>,
  commandName = 'mpv-play',
): PackageDownloadInfo => ({
  command_name: commandName,
  github_repo_url: 'https://github.com/example/mpv-play',
  version: '1.0.0',
  git_tag: 'v1.0.0',
  manifest,
  danger_rating: 2,
  verified: true,
});

describe('StoreDetailScreen — apt consent UI', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockApiClientGet.mockResolvedValue({
      data: [{ node_id: 'n1', room: 'Kitchen', household_id: 'h1' }],
    });
    mockFetchNodeTools.mockResolvedValue({ client_tools: [] });
    mockRequestInstall.mockResolvedValue({
      id: 'req-1',
      status: 'pending',
      created_at: '2026-01-01T00:00:00Z',
    });
    mockRequestCCInstall.mockResolvedValue({
      id: 'cc-1',
      status: 'pending',
      created_at: '2026-01-01T00:00:00Z',
    });
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  const pressInstall = async (label: string) => {
    mockGetPackageDetail.mockResolvedValue(baseDetail);
    const result = render(<StoreDetailScreen />, { wrapper });
    const button = await waitFor(() => result.getByText(label));
    fireEvent.press(button);
    return result;
  };

  it('shows apt consent dialog and proceeds with install on Continue', async () => {
    mockGetDownloadInfo.mockResolvedValue(
      makeDownloadInfo({ apt_packages: ['mpv', 'alsa-utils'] }),
    );
    alertSpy.mockImplementation((_title, _msg, buttons) => {
      const cont = (buttons as { text: string; onPress?: () => void }[] | undefined)
        ?.find((b) => b.text === 'Continue');
      cont?.onPress?.();
    });

    await pressInstall('Install');

    await waitFor(() => {
      expect(mockRequestInstall).toHaveBeenCalledTimes(1);
    });
    const rootCalls = alertSpy.mock.calls.filter((c) => c[0] === 'Root-privileged install');
    expect(rootCalls).toHaveLength(1);
    expect(rootCalls[0][1]).toContain('mpv, alsa-utils');
    expect(rootCalls[0][1]).toContain('root privileges');
    expect(mockNavigate).toHaveBeenCalledWith(
      'InstallProgress',
      expect.objectContaining({ commandName: 'mpv-play' }),
    );
  });

  it('does not call requestInstall when user cancels the apt consent dialog', async () => {
    mockGetDownloadInfo.mockResolvedValue(
      makeDownloadInfo({ apt_packages: ['mpv'] }),
    );
    alertSpy.mockImplementation((_title, _msg, buttons) => {
      const cancel = (buttons as { text: string; onPress?: () => void }[] | undefined)
        ?.find((b) => b.text === 'Cancel');
      cancel?.onPress?.();
    });

    await pressInstall('Install');

    // Wait through the consent prompt AND the cancel handler's finally
    // block so the trailing setInstalling(false) state update lands inside
    // act(), avoiding leak into the next test (jest act-warning + flaky
    // "no apt_packages key" failure observed in CI).
    await waitFor(() => {
      const rootCalls = alertSpy.mock.calls.filter((c) => c[0] === 'Root-privileged install');
      expect(rootCalls).toHaveLength(1);
    });
    expect(mockRequestInstall).not.toHaveBeenCalled();
    // NB: mockApiClientGet is expected to have been called once at mount
    // by the version-discovery useEffect that drives the Install/Update
    // button label — that fetch is unrelated to the install flow this
    // test gates on, so we assert against the install-side mocks only.
    const installProgressNav = mockNavigate.mock.calls.find((c) => c[0] === 'InstallProgress');
    expect(installProgressNav).toBeUndefined();
  });

  it('treats onDismiss (Android hardware-back / outside-tap) as decline', async () => {
    mockGetDownloadInfo.mockResolvedValue(
      makeDownloadInfo({ apt_packages: ['mpv'] }),
    );
    alertSpy.mockImplementation((_title, _msg, _buttons, options) => {
      (options as { onDismiss?: () => void } | undefined)?.onDismiss?.();
    });

    await pressInstall('Install');

    await waitFor(() => {
      const rootCalls = alertSpy.mock.calls.filter((c) => c[0] === 'Root-privileged install');
      expect(rootCalls).toHaveLength(1);
    });
    expect(mockRequestInstall).not.toHaveBeenCalled();
    // See sibling test for why mockApiClientGet is no longer asserted here.
    const installProgressNav = mockNavigate.mock.calls.find((c) => c[0] === 'InstallProgress');
    expect(installProgressNav).toBeUndefined();
  });

  it('skips consent dialog when manifest.apt_packages is empty', async () => {
    mockGetDownloadInfo.mockResolvedValue(makeDownloadInfo({ apt_packages: [] }));

    await pressInstall('Install');

    await waitFor(() => {
      expect(mockRequestInstall).toHaveBeenCalledTimes(1);
    });
    const rootCalls = alertSpy.mock.calls.filter((c) => c[0] === 'Root-privileged install');
    expect(rootCalls).toHaveLength(0);
    expect(mockNavigate).toHaveBeenCalledWith(
      'InstallProgress',
      expect.objectContaining({ commandName: 'mpv-play' }),
    );
  });

  it('skips consent dialog when manifest has no apt_packages key', async () => {
    mockGetDownloadInfo.mockResolvedValue(makeDownloadInfo({}));

    await pressInstall('Install');

    await waitFor(() => {
      expect(mockRequestInstall).toHaveBeenCalledTimes(1);
    });
    const rootCalls = alertSpy.mock.calls.filter((c) => c[0] === 'Root-privileged install');
    expect(rootCalls).toHaveLength(0);
    expect(mockNavigate).toHaveBeenCalledWith(
      'InstallProgress',
      expect.objectContaining({ commandName: 'mpv-play' }),
    );
  });

  it('prompt-provider package never shows apt consent dialog (regression guard for placement)', async () => {
    mockGetPackageDetail.mockResolvedValue(promptProviderDetail);
    mockGetDownloadInfo.mockResolvedValue(
      makeDownloadInfo({ apt_packages: ['mpv'] }, 'fancy-prompt'),
    );

    const { getByText } = render(<StoreDetailScreen />, { wrapper });
    const button = await waitFor(() => getByText('Install to Command Center'));
    fireEvent.press(button);

    await waitFor(() => {
      expect(mockRequestCCInstall).toHaveBeenCalledTimes(1);
    });
    const rootCalls = alertSpy.mock.calls.filter((c) => c[0] === 'Root-privileged install');
    expect(rootCalls).toHaveLength(0);
    expect(mockRequestInstall).not.toHaveBeenCalled();
    expect(mockApiClientGet).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith(
      'InstallProgress',
      expect.objectContaining({ mode: 'cc-provider' }),
    );
  });

  it('shows Install Error alert when getDownloadInfo rejects (before consent gate runs)', async () => {
    mockGetDownloadInfo.mockRejectedValue(new Error('boom'));

    await pressInstall('Install');

    await waitFor(() => {
      const errorCalls = alertSpy.mock.calls.filter((c) => c[0] === 'Install Error');
      expect(errorCalls).toHaveLength(1);
      expect(errorCalls[0][1]).toBe('boom');
    });
    const rootCalls = alertSpy.mock.calls.filter((c) => c[0] === 'Root-privileged install');
    expect(rootCalls).toHaveLength(0);
    expect(mockRequestInstall).not.toHaveBeenCalled();
    const installProgressNav = mockNavigate.mock.calls.find((c) => c[0] === 'InstallProgress');
    expect(installProgressNav).toBeUndefined();
  });
});
