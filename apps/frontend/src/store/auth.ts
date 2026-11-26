import { create } from 'zustand';
import { api, setCsrfToken } from '@/services/api';
import type { AuthUser } from '@/types';

type Status = 'unknown' | 'authenticated' | 'anonymous';

interface AuthState {
  status: Status;
  user: AuthUser | null;
  bootstrap: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  status: 'unknown',
  user: null,
  bootstrap: async () => {
    try {
      const res = await api.get<{ user: AuthUser; csrfToken: string }>('/auth/me');
      setCsrfToken(res.csrfToken);
      set({ status: 'authenticated', user: res.user });
    } catch {
      set({ status: 'anonymous', user: null });
    }
  },
  login: async (identifier, password) => {
    const res = await api.post<{ user: AuthUser; csrfToken: string }>('/auth/login', { identifier, password });
    setCsrfToken(res.csrfToken);
    set({ status: 'authenticated', user: res.user });
  },
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setCsrfToken(null);
      set({ status: 'anonymous', user: null });
    }
  },
  clear: () => {
    setCsrfToken(null);
    set({ status: 'anonymous', user: null });
  },
}));
