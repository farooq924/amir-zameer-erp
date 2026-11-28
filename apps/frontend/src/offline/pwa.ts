import { toast } from 'sonner';
import { registerSW } from 'virtual:pwa-register';
import { create } from 'zustand';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** The browser offered to install the app (Chrome / Edge / Android). */
  canInstall: boolean;
  installed: boolean;
  offlineReady: boolean;
  install: () => Promise<void>;
}

let deferred: InstallPromptEvent | null = null;

export const usePwa = create<PwaState>((set) => ({
  canInstall: false,
  installed: typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches,
  offlineReady: typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller,
  install: async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    deferred = null;
    set({ canInstall: false, installed: choice.outcome === 'accepted' });
  },
}));

/** Registers the service worker (production build only) and listens for the install prompt. */
export function setupPwa(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    usePwa.setState({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ canInstall: false, installed: true }));
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    onNeedRefresh() {
      toast.info('A new version of the ERP is ready.', {
        duration: Infinity,
        action: { label: 'Update now', onClick: () => { void updateSW(true); } },
      });
    },
    onOfflineReady() {
      usePwa.setState({ offlineReady: true });
      toast.success('The ERP is ready to work offline on this device.');
    },
    onRegisteredSW(_url, reg) {
      usePwa.setState({ offlineReady: true });
      // Look for a new version every 30 minutes while the app stays open.
      if (reg) setInterval(() => { void reg.update(); }, 30 * 60_000);
    },
  });
}
