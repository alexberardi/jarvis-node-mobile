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
