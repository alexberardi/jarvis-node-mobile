import * as WebBrowser from 'expo-web-browser';

const REDIRECT_URI = 'jarvis://oauth-callback';

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

/**
 * Run a standard OAuth2 authorization code flow.
 *
 * Opens a browser for user auth, exchanges the code at exchangeEndpoint,
 * then passes the tokens to completionHandler for any post-processing
 * (e.g., minting a long-lived token, storing credentials).
 *
 * @returns The result of completionHandler, or null if the user cancelled.
 * @throws Error on network/exchange failures or if completionHandler throws.
 */
export const performOAuthFlow = async <T = OAuthTokens>(options: {
  /** Full authorize URL (e.g., http://192.168.1.100:8123/auth/authorize) */
  authorizeUrl: string;
  /** Full token exchange URL (e.g., http://192.168.1.100:8123/auth/token) */
  exchangeEndpoint: string;
  /** OAuth client ID */
  clientId: string;
  /** Called with the exchanged tokens. Return value becomes the function's result. */
  completionHandler: (tokens: OAuthTokens) => Promise<T> | T;
  /** Custom redirect URI (defaults to jarvis://oauth-callback) */
  redirectUri?: string;
  /** OAuth scopes to request */
  scopes?: string[];
  /** Extra query params for the authorize URL */
  extraAuthorizeParams?: Record<string, string>;
  /** Extra body params for the token exchange */
  extraExchangeParams?: Record<string, string>;
  /** If false, omit redirect_uri from the token exchange body (default: true) */
  sendRedirectUriInExchange?: boolean;
}): Promise<T | null> => {
  const redirectUri = options.redirectUri ?? REDIRECT_URI;

  // Build authorize URL
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    ...options.extraAuthorizeParams,
  });
  if (options.scopes?.length) {
    params.set('scope', options.scopes.join(' '));
  }
  const authUrl = `${options.authorizeUrl}?${params.toString()}`;

  // Open browser for user auth
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

  if (result.type !== 'success' || !result.url) {
    return null; // User cancelled
  }

  // Extract auth code from redirect
  const url = new URL(result.url);
  const code = url.searchParams.get('code');
  if (!code) {
    const error = url.searchParams.get('error');
    throw new Error(
      error
        ? `Authorization error: ${error}`
        : 'No authorization code received',
    );
  }

  // Exchange code for tokens
  const exchangeBody: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    client_id: options.clientId,
    ...options.extraExchangeParams,
  };
  if (options.sendRedirectUriInExchange !== false) {
    exchangeBody.redirect_uri = redirectUri;
  }

  const tokenRes = await fetch(options.exchangeEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(exchangeBody).toString(),
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text().catch(() => '');
    throw new Error(
      `Token exchange failed: HTTP ${tokenRes.status}${errorText ? ` - ${errorText}` : ''}`,
    );
  }

  const tokens: OAuthTokens = await tokenRes.json();

  return options.completionHandler(tokens);
};
