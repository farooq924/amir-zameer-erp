import { newId } from '@/utils/id';

const KEY = 'az.deviceId';
const NAME_KEY = 'az.deviceName';

/** Stable id of this browser/device, used in the sync log. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `web-${newId().replace(/-/g, '').slice(0, 16)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'web-unknown-device';
  }
}

export function deviceName(): string {
  try {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) return saved;
  } catch { /* ignore */ }
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone / iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}

export function setDeviceName(name: string): void {
  try { localStorage.setItem(NAME_KEY, name.trim().slice(0, 60)); } catch { /* ignore */ }
}
