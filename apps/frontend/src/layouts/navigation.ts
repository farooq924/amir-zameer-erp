import { MODULES, type ModuleDefinition } from '@az/shared';
import {
  Banknote, BarChart3, BookOpen, CalendarCheck, ClipboardList, DatabaseBackup, IdCard, Layers, LayoutDashboard,
  MessageCircle, Receipt, RefreshCw, Ruler, Scissors, Settings, ShieldCheck, Shirt, ShoppingCart, Truck, UserCog, Users, Wallet,
  type LucideIcon,
} from 'lucide-react';
import { hasPermission } from '@/hooks/use-permission';
import type { AuthUser } from '@/types';

export const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Users, Ruler, ClipboardList, Shirt, Layers, ShoppingCart, Truck, IdCard, CalendarCheck, Wallet, Scissors,
  Receipt, Banknote, BookOpen, BarChart3, MessageCircle, DatabaseBackup, ShieldCheck, Settings, UserCog, RefreshCw,
};

/** Navigation items the user is allowed to see, in the order defined by the shared module list. */
export function visibleNavItems(user: AuthUser | null): ModuleDefinition[] {
  return MODULES.filter((m) => !m.hidden && hasPermission(user, m.key, 'VIEW'));
}

/** Items shown in the mobile bottom bar. */
export const MOBILE_PRIMARY = ['dashboard', 'customers', 'orders', 'payments'];
