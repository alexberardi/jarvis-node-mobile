import authApi from './authApi';

/**
 * Delete the authenticated user's account (jarvis-auth).
 *
 * Calls ONLY jarvis-auth's `DELETE /auth/me`; jarvis-auth fans out the
 * downstream purge to command-center and notifications server-side. The
 * mobile app must NOT call those services directly.
 *
 * The user JWT is attached manually (mirroring `householdApi.ts`) rather
 * than relying on the apiClient interceptor, since `authApi` is the raw
 * axios instance whose baseURL is pointed at the discovered jarvis-auth
 * URL by ConfigProvider.
 *
 * Surfaces typed errors by HTTP status:
 *   - 401 → 'Incorrect password'
 *   - 409 → the server's response detail (nodes / households guard)
 *   - anything else → 'Could not complete deletion. Please try again.'
 */
export const deleteAccount = async (
  password: string,
  accessToken: string,
): Promise<void> => {
  try {
    await authApi.delete('/auth/me', {
      data: { password },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err: unknown) {
    const response = (err as {
      response?: { status?: number; data?: { detail?: string } };
    })?.response;
    const status = response?.status;

    if (status === 401) {
      throw new Error('Incorrect password');
    }
    if (status === 409) {
      throw new Error(
        response?.data?.detail ?? 'Could not complete deletion. Please try again.',
      );
    }
    throw new Error('Could not complete deletion. Please try again.');
  }
};

/** The current user as returned by GET/PATCH /auth/me. */
export interface MeResponse {
  id: number;
  email: string;
  username?: string;
  display_name?: string | null;
}

/**
 * Set (or clear, with an empty string) the signed-in user's display name via
 * jarvis-auth's `PATCH /auth/me`. Returns the updated user.
 *
 * Errors: 422 (invalid name, e.g. control characters) surfaces the server's
 * detail; a 404/405 means the server predates display names.
 */
export const updateMyDisplayName = async (
  displayName: string,
  accessToken: string,
): Promise<MeResponse> => {
  try {
    const res = await authApi.patch<MeResponse>(
      '/auth/me',
      { display_name: displayName.trim() },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return res.data;
  } catch (err: unknown) {
    const response = (err as {
      response?: { status?: number; data?: { detail?: unknown } };
    })?.response;
    const status = response?.status;
    const detail = response?.data?.detail;
    if (status === 422) {
      throw new Error(
        typeof detail === 'string' ? detail : 'That display name isn’t allowed.',
      );
    }
    if (status === 404 || status === 405) {
      throw new Error('This server doesn’t support display names yet.');
    }
    throw new Error('Could not save your display name. Please try again.');
  }
};
