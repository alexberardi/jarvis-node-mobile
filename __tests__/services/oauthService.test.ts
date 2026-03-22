import * as WebBrowser from 'expo-web-browser';

import { performOAuthFlow } from '../../src/services/oauthService';
import type { OAuthTokens } from '../../src/services/oauthService';

// Mock expo-web-browser
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('oauthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  const defaultOptions = {
    authorizeUrl: 'https://auth.example.com/authorize',
    exchangeEndpoint: 'https://auth.example.com/token',
    clientId: 'test-client-id',
    completionHandler: (tokens: OAuthTokens) => tokens,
  };

  describe('performOAuthFlow', () => {
    it('should return null when user cancels the browser', async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: 'cancel',
      });

      const result = await performOAuthFlow(defaultOptions);

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return null when browser result has no URL', async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: 'success',
        url: undefined,
      });

      const result = await performOAuthFlow(defaultOptions);

      expect(result).toBeNull();
    });

    it('should complete the full OAuth flow successfully', async () => {
      const mockTokens: OAuthTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
      };

      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: 'success',
        url: 'jarvis://oauth-callback?code=auth-code-123',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockTokens,
      });

      const result = await performOAuthFlow(defaultOptions);

      expect(result).toEqual(mockTokens);

      // Verify the authorize URL was built correctly
      const authCall = (WebBrowser.openAuthSessionAsync as jest.Mock).mock.calls[0];
      const authUrl = authCall[0] as string;
      expect(authUrl).toContain('client_id=test-client-id');
      expect(authUrl).toContain('redirect_uri=jarvis%3A%2F%2Foauth-callback');
      expect(authUrl).toContain('response_type=code');

      // Verify token exchange
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );

      const exchangeBody = mockFetch.mock.calls[0][1].body;
      expect(exchangeBody).toContain('grant_type=authorization_code');
      expect(exchangeBody).toContain('code=auth-code-123');
      expect(exchangeBody).toContain('client_id=test-client-id');
      expect(exchangeBody).toContain('redirect_uri=');
    });

    it('should throw when no authorization code in redirect URL', async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: 'success',
        url: 'jarvis://oauth-callback',
      });

      await expect(performOAuthFlow(defaultOptions)).rejects.toThrow(
        'No authorization code received',
      );
    });

    it('should throw with error message when redirect contains error param', async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: 'success',
        url: 'jarvis://oauth-callback?error=access_denied',
      });

      await expect(performOAuthFlow(defaultOptions)).rejects.toThrow(
        'Authorization error: access_denied',
      );
    });

    it('should throw on token exchange HTTP error', async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: 'success',
        url: 'jarvis://oauth-callback?code=valid-code',
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'invalid_grant',
      });

      await expect(performOAuthFlow(defaultOptions)).rejects.toThrow(
        'Token exchange failed: HTTP 400 - invalid_grant',
      );
    });

    it('should throw on token exchange with empty error body', async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: 'success',
        url: 'jarvis://oauth-callback?code=valid-code',
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => '',
      });

      await expect(performOAuthFlow(defaultOptions)).rejects.toThrow(
        'Token exchange failed: HTTP 500',
      );
    });

    it('should use custom redirect URI when provided', async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: 'success',
        url: 'myapp://callback?code=xyz',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'tok' }),
      });

      await performOAuthFlow({
        ...defaultOptions,
        redirectUri: 'myapp://callback',
      });

      const authUrl = (WebBrowser.openAuthSessionAsync as jest.Mock).mock.calls[0][0];
      expect(authUrl).toContain('redirect_uri=myapp%3A%2F%2Fcallback');

      // Should also pass custom redirect to openAuthSessionAsync as the second arg
      const redirectArg = (WebBrowser.openAuthSessionAsync as jest.Mock).mock.calls[0][1];
      expect(redirectArg).toBe('myapp://callback');
    });

    it('should include scopes in authorize URL', async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: 'cancel',
      });

      await performOAuthFlow({
        ...defaultOptions,
        scopes: ['read', 'write'],
      });

      const authUrl = (WebBrowser.openAuthSessionAsync as jest.Mock).mock.calls[0][0];
      expect(authUrl).toContain('scope=read+write');
    });

    it('should include extra authorize params', async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: 'cancel',
      });

      await performOAuthFlow({
        ...defaultOptions,
        extraAuthorizeParams: { prompt: 'consent', state: 'abc' },
      });

      const authUrl = (WebBrowser.openAuthSessionAsync as jest.Mock).mock.calls[0][0];
      expect(authUrl).toContain('prompt=consent');
      expect(authUrl).toContain('state=abc');
    });

    it('should include extra exchange params in token request', async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: 'success',
        url: 'jarvis://oauth-callback?code=abc',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'tok' }),
      });

      await performOAuthFlow({
        ...defaultOptions,
        extraExchangeParams: { code_verifier: 'pkce-verifier' },
      });

      const exchangeBody = mockFetch.mock.calls[0][1].body;
      expect(exchangeBody).toContain('code_verifier=pkce-verifier');
    });

    it('should omit redirect_uri from exchange when sendRedirectUriInExchange is false', async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: 'success',
        url: 'jarvis://oauth-callback?code=abc',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'tok' }),
      });

      await performOAuthFlow({
        ...defaultOptions,
        sendRedirectUriInExchange: false,
      });

      const exchangeBody = mockFetch.mock.calls[0][1].body;
      expect(exchangeBody).not.toContain('redirect_uri');
    });

    it('should call completionHandler with tokens and return its result', async () => {
      const mockTokens: OAuthTokens = {
        access_token: 'raw-access',
        refresh_token: 'raw-refresh',
      };

      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: 'success',
        url: 'jarvis://oauth-callback?code=abc',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockTokens,
      });

      const completionHandler = jest.fn().mockReturnValue({
        processed: true,
        token: 'transformed',
      });

      const result = await performOAuthFlow({
        ...defaultOptions,
        completionHandler,
      });

      expect(completionHandler).toHaveBeenCalledWith(mockTokens);
      expect(result).toEqual({ processed: true, token: 'transformed' });
    });

    it('should propagate errors from completionHandler', async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: 'success',
        url: 'jarvis://oauth-callback?code=abc',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'tok' }),
      });

      await expect(
        performOAuthFlow({
          ...defaultOptions,
          completionHandler: () => {
            throw new Error('Handler error');
          },
        }),
      ).rejects.toThrow('Handler error');
    });
  });
});
