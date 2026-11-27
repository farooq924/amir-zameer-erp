import { create } from 'zustand';
import { ApiError, api, setCsrfToken } from '@/services/api';
import type { AuthUser } from '@/types';

type Status = 'unknown' | 'authenticated' | 'anonymous';

/**
 * The signed-in profile is remembered on this device so the ERP can open without internet
 * (Phase 9 offline mode). It holds no password or session secret; the server still checks
 * the session cookie and permissions when the device syncs.
 */
const CACHE_KEY = 'az.offline.user';

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}
function cacheUser(user: AuthUser | null): void {
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(CACHE_KEY);
  } catch { /* storage blocked: offline start is simply not available */ }
}

interface AuthState {
  status: Status;
  user: AuthUser | null;
  /** Opened from the device copy because the server could not be reached. */
  offlineSession: boolean;
  bootstrap: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clear: () => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'unknown',
  user: null,
  offlineSession: false,
  bootstrap: async () => {
    try {
      const res = await api.get<{ user: AuthUser; csrfToken: string }>('/auth/me');
      setCsrfToken(res.csrfToken);
      cacheUser(res.user);
      set({ status: 'authenticated', user: res.user, offlineSession: false });
    } catch (e) {
      const cached = readCachedUser();
      if (e instanceof ApiError && e.status === 0 && cached) {
        set({ status: 'authenticated', user: cached, offlineSession: true });
        return;
      }
      if (e instanceof ApiError && e.status === 401) cacheUser(null);
      // A failed re-check while already working offline keeps the user in.
      if (get().offlineSession && !(e instanceof ApiError && e.status === 401)) return;
      set({ status: 'anonymous', user: null, offlineSession: false });
    }
  },
  login: async (identifier, password) => {
    const res = await api.post<{ user: AuthUser; csrfToken: string }>('/auth/login', { identifier, password });
    setCsrfToken(res.csrfToken);
    cacheUser(res.user);
    set({ status: 'authenticated', user: res.user, offlineSession: false });
  },
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch { /* offline logout still signs out on this device */ } finally {
      setCsrfToken(null);
      cacheUser(null);
      set({ status: 'anonymous', user: null, offlineSession: false });
    }
  },
  clear: () => {
    setCsrfToken(null);
    cacheUser(null);
    set({ status: 'anonymous', user: null, offlineSession: false });
  },
}));
