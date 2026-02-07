import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import authApi from '../api/authApi';

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
}

type AuthResponse = {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  user: AuthUser;
};

const ACCESS_TOKEN_KEY = '@jarvis_node_mobile/access_token';
const REFRESH_TOKEN_KEY = '@jarvis_node_mobile/refresh_token';
const USER_KEY = '@jarvis_node_mobile/user';
const ACTIVE_HOUSEHOLD_KEY = '@jarvis_node_mobile/active_household_id';

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,
  households: [],
  activeHouseholdId: null,
};

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  bootstrapAuth: () => Promise<void>;
  fetchHouseholds: () => Promise<Household[]>;
  setActiveHousehold: (householdId: string | null) => Promise<void>;
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
      await AsyncStorage.multiSet([
        [ACCESS_TOKEN_KEY, accessToken],
        [REFRESH_TOKEN_KEY, refreshToken],
        [USER_KEY, JSON.stringify(user)],
      ]);
    },
    [],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.post<AuthResponse>('/auth/login', { email, password });
      await persistAuth({
        accessToken: res.data.access_token,
        refreshToken: res.data.refresh_token,
        user: res.data.user,
      });
    },
    [persistAuth],
  );

  const register = useCallback(
    async (email: string, password: string, username?: string) => {
      const res = await authApi.post<AuthResponse>('/auth/register', {
        email,
        password,
        username,
      });
      await persistAuth({
        accessToken: res.data.access_token,
        refreshToken: res.data.refresh_token,
        user: res.data.user,
      });
    },
    [persistAuth],
  );

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY, ACTIVE_HOUSEHOLD_KEY]);
    setState({
      ...initialState,
      isLoading: false,
    });
  }, []);

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
      await AsyncStorage.multiSet([
        [ACCESS_TOKEN_KEY, newAccess],
        [REFRESH_TOKEN_KEY, newRefresh],
      ]);
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

  const setActiveHousehold = useCallback(async (householdId: string | null): Promise<void> => {
    setState((prev) => ({ ...prev, activeHouseholdId: householdId }));
    if (householdId) {
      await AsyncStorage.setItem(ACTIVE_HOUSEHOLD_KEY, householdId);
    } else {
      await AsyncStorage.removeItem(ACTIVE_HOUSEHOLD_KEY);
    }
  }, []);

  const bootstrapAuth = useCallback(async () => {
    try {
      const [storedAccess, storedRefresh, storedUser, storedHouseholdId] = await AsyncStorage.multiGet([
        ACCESS_TOKEN_KEY,
        REFRESH_TOKEN_KEY,
        USER_KEY,
        ACTIVE_HOUSEHOLD_KEY,
      ]);
      const accessToken = storedAccess[1];
      const refreshToken = storedRefresh[1];
      const user = parseUser(storedUser[1]);
      const activeHouseholdId = storedHouseholdId[1] || null;

      if (accessToken && refreshToken && user) {
        setState({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
          households: [],
          activeHouseholdId,
        });
      } else {
        setState({
          ...initialState,
          isLoading: false,
        });
      }
    } catch (error) {
      console.debug('[AuthContext] Bootstrap auth failed:', error instanceof Error ? error.message : error);
      setState({
        ...initialState,
        isLoading: false,
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

  const value = useMemo(
    () => ({
      state,
      login,
      register,
      logout,
      refreshAccessToken,
      bootstrapAuth,
      fetchHouseholds,
      setActiveHousehold,
    }),
    [bootstrapAuth, fetchHouseholds, login, logout, refreshAccessToken, register, setActiveHousehold, state],
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
