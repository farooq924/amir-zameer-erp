import { MODULES, type ModuleDefinition } from '@az/shared';
import {
  Banknote, BarChart3, Building2, CreditCard, Crown, History, Package, Lock, BookOpen, CalendarCheck, ClipboardList, DatabaseBackup, FileText, IdCard, Layers, LayoutDashboard,
  MessageCircle, Receipt, RefreshCw, WifiOff, Ruler, Scissors, Settings, ShieldCheck, Shirt, ShoppingCart, Truck, UserCog, Users, Wallet,
  type LucideIcon,
} from 'lucide-react';
import { hasPermission } from '@/hooks/use-permission';
import type { AuthUser } from '@/types';

export const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Users, Ruler, ClipboardList, Shirt, Layers, ShoppingCart, Truck, IdCard, CalendarCheck, Wallet, Scissors,
  Building2, CreditCard, Crown, History, Package,
  Receipt, Banknote, BookOpen, BarChart3, MessageCircle, DatabaseBackup, ShieldCheck, Settings, UserCog, RefreshCw, WifiOff, Lock, FileText,
};

const nav = (key: string, label: string, path: string, icon: string): ModuleDefinition => ({ key, label, path, phase: 12, icon, actions: ['VIEW'] } as ModuleDefinition);

/** TailoringERP Super Admin menu (platform area, no company open). */
export const PLATFORM_NAV: ModuleDefinition[] = [
  nav('platform', 'Overview', '/platform', 'Crown'),
  nav('platform_companies', 'Companies', '/platform/companies', 'Building2'),
  nav('platform_payments', 'Subscription Payments', '/platform/payments', 'CreditCard'),
  nav('platform_plans', 'Plans', '/platform/plans', 'Package'),
  nav('backup', 'Backup', '/backup', 'DatabaseBackup'),
  nav('platform_activity', 'Platform Activity', '/platform/activity', 'History'),
  nav('documents', 'Documents', '/documents', 'FileText'),
];

/** Navigation items the user is allowed to see, in the order defined by the shared module list. */
export function visibleNavItems(user: AuthUser | null): ModuleDefinition[] {
  if (user?.isSuperAdmin && !user.company) return PLATFORM_NAV;
  const items = MODULES.filter((m) => !m.hidden && hasPermission(user, m.key, 'VIEW'));
  // Phase 9: Offline Desk for anyone who books work, Sync Center for every signed-in user.
  const offlineWork = ['customers', 'measurements', 'orders', 'payments'].some((k) => hasPermission(user, k, 'CREATE'));
  const extra: ModuleDefinition[] = [
    ...(offlineWork ? [{ key: 'offline', label: 'Offline Desk', path: '/offline', phase: 9, icon: 'WifiOff', actions: ['VIEW'] } as ModuleDefinition] : []),
    ...(user ? [{ key: 'sync', label: 'Sync Center', path: '/sync', phase: 9, icon: 'RefreshCw', actions: ['VIEW'] } as ModuleDefinition] : []),
  ];
  // v1.11: Documents (built-in user guide) for every signed-in user, last in the menu.
  const guide: ModuleDefinition[] = user ? [{ key: 'documents', label: 'Documents', path: '/documents', phase: 11, icon: 'FileText', actions: ['VIEW'] } as ModuleDefinition] : [];
  const at = items.findIndex((m) => m.key === 'security' || m.key === 'backup' || m.key === 'audit_logs' || m.key === 'settings');
  if (at === -1) return [...items, ...extra, ...guide];
  return [...items.slice(0, at), ...extra, ...items.slice(at), ...guide];
}

