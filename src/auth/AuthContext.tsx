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

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
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

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,
};

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  bootstrapAuth: () => Promise<void>;
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
    await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY]);
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

  const bootstrapAuth = useCallback(async () => {
    try {
      const [storedAccess, storedRefresh, storedUser] = await AsyncStorage.multiGet([
        ACCESS_TOKEN_KEY,
        REFRESH_TOKEN_KEY,
        USER_KEY,
      ]);
      const accessToken = storedAccess[1];
      const refreshToken = storedRefresh[1];
      const user = parseUser(storedUser[1]);

      if (accessToken && refreshToken && user) {
        setState({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
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

  const value = useMemo(
    () => ({
      state,
      login,
      register,
      logout,
      refreshAccessToken,
      bootstrapAuth,
    }),
    [bootstrapAuth, login, logout, refreshAccessToken, register, state],
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
