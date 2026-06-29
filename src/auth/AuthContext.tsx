import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { setK2UserId } from '../services/k2Service';
import { clearUserData } from '../services/clearUserData';
import { useConfig } from '../contexts/ConfigContext';

import { configureApiClient } from '../api/apiClient';
import authApi from '../api/authApi';
import { deleteAccount as deleteAccountApi } from '../api/accountApi';

export interface AuthUser {
  id: number;
  email: string;
  username?: string;
}

export type HouseholdRole = 'admin' | 'power_user' | 'member';

export interface Household {
  id: string;
  name: string;
  role: HouseholdRole;
  created_at: string;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  households: Household[];
  activeHouseholdId: string | null;
  /** User has opted in to biometric login (refresh token gated behind Face/Touch ID). */
  biometricEnabled: boolean;
}

type AuthResponse = {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  user: AuthUser;
};

type RegisterResponse = AuthResponse & {
  household_id: string;
};

import {
  USER_KEY,
  ACTIVE_HOUSEHOLD_KEY,
} from '../config/storageKeys';
import {
  getTokens,
  setTokens,
  setAccessToken,
  isBiometricLoginEnabled,
  setBiometricLoginEnabled,
  biometricCapable,
} from '../services/tokenStorage';

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,
  households: [],
  activeHouseholdId: null,
  biometricEnabled: false,
};

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string, opts?: { enableBiometric?: boolean }) => Promise<void>;
  register: (email: string, password: string, username?: string, inviteCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  bootstrapAuth: () => Promise<void>;
  fetchHouseholds: () => Promise<Household[]>;
  setActiveHousehold: (householdId: string | null) => Promise<void>;
  switchHousehold: (householdId: string) => Promise<void>;
  /** Unlock a stored session via the OS biometric prompt (reads the gated
   *  refresh token). Returns true on success. Used by the "Unlock" retry
   *  button after a cancelled cold-boot prompt. */
  unlockWithBiometrics: () => Promise<boolean>;
  /** Turn biometric login on/off; re-keys the stored refresh token immediately. */
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  /** Whether this device can enforce biometric login (enrolled strong biometrics). */
  biometricAvailable: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const parseUser = (value: string | null): AuthUser | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as AuthUser;
  } catch (parseError) {
    console.debug('[AuthContext] Failed to parse stored user JSON:', parseError instanceof Error ? parseError.message : parseError);
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>(initialState);
  const queryClient = useQueryClient();
  const { rediscover } = useConfig();

  // Ref to always have current tokens for the API client interceptor
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const persistAuth = useCallback(
    async (payload: { accessToken: string; refreshToken: string; user: AuthUser }) => {
      const { accessToken, refreshToken, user } = payload;
      setState((prev) => ({
        ...prev,
        user,
        accessToken,
        refreshToken,
        isAuthenticated: true,
      }));
      // Scope K2 storage to current user so different users on the
      // same device cannot read each other's node encryption keys.
      setK2UserId(String(user.id));
      // Tokens go to the OS keychain; the (non-secret) user blob to AsyncStorage.
      await Promise.all([
        setTokens(accessToken, refreshToken),
        AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
      ]);
    },
    [],
  );

  const setActiveHousehold = useCallback(async (householdId: string | null): Promise<void> => {
    setState((prev) => ({ ...prev, activeHouseholdId: householdId }));
    if (householdId) {
      await AsyncStorage.setItem(ACTIVE_HOUSEHOLD_KEY, householdId);
    } else {
      await AsyncStorage.removeItem(ACTIVE_HOUSEHOLD_KEY);
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string, opts?: { enableBiometric?: boolean }) => {
      const res = await authApi.post<AuthResponse>('/auth/login', { email, password });
      // Record the opt-in BEFORE persisting so the refresh token is written with
      // the correct (gated/ungated) keychain policy on this very first write.
      if (opts && typeof opts.enableBiometric === 'boolean') {
        await setBiometricLoginEnabled(opts.enableBiometric);
      }
      await persistAuth({
        accessToken: res.data.access_token,
        refreshToken: res.data.refresh_token,
        user: res.data.user,
      });
      if (opts && typeof opts.enableBiometric === 'boolean') {
        const enabled = opts.enableBiometric;
        setState((prev) => ({ ...prev, biometricEnabled: enabled }));
      }
    },
    [persistAuth],
  );

  const register = useCallback(
    async (email: string, password: string, username?: string, inviteCode?: string) => {
      const res = await authApi.post<RegisterResponse>('/auth/register', {
        email,
        password,
        username,
        ...(inviteCode ? { invite_code: inviteCode } : {}),
      });
      await persistAuth({
        accessToken: res.data.access_token,
        refreshToken: res.data.refresh_token,
        user: res.data.user,
      });
      // Set the household from the registration response
      await setActiveHousehold(res.data.household_id);
    },
    [persistAuth, setActiveHousehold],
  );

  const logout = useCallback(async () => {
    // Wipe all per-user / per-environment caches before resetting state.
    // Without this, dev-environment node IDs, K2 keys, cached service URLs,
    // and react-query data (devices/rooms/smartHomeConfig keyed by
    // householdId) bleed into the next environment the user logs into.
    // A "Log Out" tap must ALWAYS log the user out: swallow any cache-wipe
    // error (e.g. a storage failure) and still force the unauthenticated state.
    // logout() never rejects — the user is logged out regardless.
    try {
      await clearUserData({ queryClient, rediscover });
    } catch (e) {
      console.warn('[AuthContext] logout cache wipe failed; logging out anyway:', e);
    } finally {
      setState({
        ...initialState,
        isLoading: false,
      });
    }
  }, [queryClient, rediscover]);

  const deleteAccount = useCallback(
    async (password: string) => {
      // jarvis-auth orchestrates the full deletion (guards + downstream
      // purge to CC/notifications). We only call it once. A successful
      // 204 means the account is gone server-side, so we MUST wipe local
      // state — anything short of 204 throws and leaves the user logged in.
      await deleteAccountApi(password, stateRef.current.accessToken ?? '');

      // Mirror logout(): wipe per-user / per-environment caches, then drop
      // to the unauthenticated state (RootNavigator routes to AuthNavigator).
      // If clearUserData throws, still force the unauthenticated state in a
      // finally — never leave the user authenticated against a deleted account.
      try {
        await clearUserData({ queryClient, rediscover });
      } finally {
        setState({
          ...initialState,
          isLoading: false,
        });
      }
    },
    [queryClient, rediscover],
  );

  // Wire up the API client interceptor so all apiClient requests
  // automatically attach the current token and retry on 401.
  useEffect(() => {
    configureApiClient({
      getAccessToken: () => stateRef.current.accessToken,
      getRefreshToken: () => stateRef.current.refreshToken,
      updateTokens: (access: string, refresh: string) => {
        setState((prev) => ({ ...prev, accessToken: access, refreshToken: refresh, isAuthenticated: true }));
        void setTokens(access, refresh);
      },
      onForceLogout: () => {
        logout();
      },
    });
  }, [logout]);

  const refreshAccessToken = useCallback(async () => {
    const refreshToken = state.refreshToken;
    if (!refreshToken) return null;
    try {
      const res = await authApi.post<Omit<AuthResponse, 'user'>>('/auth/refresh', {
        refresh_token: refreshToken,
      });
      const newAccess = res.data.access_token;
      const newRefresh = res.data.refresh_token ?? refreshToken;
      setState((prev) => ({
        ...prev,
        accessToken: newAccess,
        refreshToken: newRefresh,
        isAuthenticated: true,
      }));
      await setTokens(newAccess, newRefresh);
      return newAccess;
    } catch (error) {
      console.debug('[AuthContext] Token refresh failed:', error instanceof Error ? error.message : error);
      return null;
    }
  }, [state.refreshToken]);

  const fetchHouseholds = useCallback(async (): Promise<Household[]> => {
    if (!state.accessToken) return [];
    try {
      const res = await authApi.get<Household[]>('/households', {
        headers: { Authorization: `Bearer ${state.accessToken}` },
      });
      const households = res.data;
      setState((prev) => ({ ...prev, households }));
      return households;
    } catch (error) {
      console.debug('[AuthContext] Fetch households failed:', error instanceof Error ? error.message : error);
      return [];
    }
  }, [state.accessToken]);

  const switchHousehold = useCallback(
    async (householdId: string) => {
      const res = await authApi.post<{ access_token: string; household_id: string }>(
        '/auth/switch-household',
        { household_id: householdId },
        { headers: { Authorization: `Bearer ${stateRef.current.accessToken}` } },
      );
      setState((prev) => ({ ...prev, accessToken: res.data.access_token }));
      await setAccessToken(res.data.access_token);
      await setActiveHousehold(res.data.household_id);
    },
    [setActiveHousehold],
  );

  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    try {
      // Reading the gated refresh token triggers the OS biometric prompt.
      const { accessToken, refreshToken } = await getTokens();
      const [storedUser, storedHouseholdId] = await AsyncStorage.multiGet([
        USER_KEY,
        ACTIVE_HOUSEHOLD_KEY,
      ]);
      const user = parseUser(storedUser[1]);
      const activeHouseholdId = storedHouseholdId[1] || null;

      if (accessToken && refreshToken && user) {
        setK2UserId(String(user.id));
        setState({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
          households: [],
          activeHouseholdId,
          biometricEnabled: true,
        });
        return true;
      }
      return false;
    } catch (error) {
      console.debug('[AuthContext] Biometric unlock failed:', error instanceof Error ? error.message : error);
      return false;
    }
  }, []);

  const setBiometricEnabled = useCallback(async (enabled: boolean): Promise<void> => {
    await setBiometricLoginEnabled(enabled);
    setState((prev) => ({ ...prev, biometricEnabled: enabled }));
    // Re-key the stored refresh token immediately so the change takes effect on
    // the very next cold boot — don't wait for the next login/refresh to rewrite.
    const { accessToken, refreshToken } = stateRef.current;
    if (accessToken && refreshToken) {
      await setTokens(accessToken, refreshToken);
    }
  }, []);

  const bootstrapAuth = useCallback(async () => {
    // Read outside the try so the catch branch can still surface the "Unlock"
    // retry button (isBiometricLoginEnabled has its own internal catch → false).
    const biometricEnabled = await isBiometricLoginEnabled();
    try {
      // Tokens come from the keychain (migrating any legacy AsyncStorage copy);
      // the user blob and active household id stay in AsyncStorage. When
      // biometric login is on, getTokens() prompts here — a cancel returns a
      // null refresh token (session locked, tokens left intact).
      const { accessToken, refreshToken } = await getTokens();
      const [storedUser, storedHouseholdId] = await AsyncStorage.multiGet([
        USER_KEY,
        ACTIVE_HOUSEHOLD_KEY,
      ]);
      const user = parseUser(storedUser[1]);
      const activeHouseholdId = storedHouseholdId[1] || null;

      if (accessToken && refreshToken && user) {
        setK2UserId(String(user.id));
        setState({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
          households: [],
          activeHouseholdId,
          biometricEnabled,
        });
      } else {
        // Unauthenticated (or biometric cancelled). Keep biometricEnabled so the
        // login screen offers an "Unlock" retry instead of only a password form.
        setState({
          ...initialState,
          isLoading: false,
          biometricEnabled,
        });
      }
    } catch (error) {
      console.debug('[AuthContext] Bootstrap auth failed:', error instanceof Error ? error.message : error);
      setState({
        ...initialState,
        isLoading: false,
        biometricEnabled,
      });
    }
  }, []);

  useEffect(() => {
    bootstrapAuth();
  }, [bootstrapAuth]);

  useEffect(() => {
    if (!state.isAuthenticated) return;
    const timer = setInterval(() => {
      refreshAccessToken().catch((refreshError) => {
        // best-effort; if refresh fails, next guarded request will trigger logout
        console.debug('[AuthContext] Background token refresh failed:', refreshError instanceof Error ? refreshError.message : refreshError);
      });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [state.isAuthenticated, refreshAccessToken]);

  // Fetch households when authenticated
  useEffect(() => {
    if (state.isAuthenticated && state.households.length === 0) {
      fetchHouseholds().then((households) => {
        // Auto-select first household if none is active
        if (households.length > 0 && !state.activeHouseholdId) {
          setActiveHousehold(households[0].id);
        }
      });
    }
  }, [state.isAuthenticated, state.households.length, state.activeHouseholdId, fetchHouseholds, setActiveHousehold]);

  // Device capability is constant for the app session.
  const biometricAvailable = useMemo(() => biometricCapable(), []);

  const value = useMemo(
    () => ({
      state,
      login,
      register,
      logout,
      deleteAccount,
      refreshAccessToken,
      bootstrapAuth,
      fetchHouseholds,
      setActiveHousehold,
      switchHousehold,
      unlockWithBiometrics,
      setBiometricEnabled,
      biometricAvailable,
    }),
    [bootstrapAuth, deleteAccount, fetchHouseholds, login, logout, refreshAccessToken, register, setActiveHousehold, switchHousehold, unlockWithBiometrics, setBiometricEnabled, biometricAvailable, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};
