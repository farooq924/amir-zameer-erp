import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, ClipboardList, Home, KeyRound, LogOut, Menu, Moon, MoreHorizontal, Plus, Ruler, UserPlus, Users, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BrandLogo, SewingMachineMark, TailorArt } from '@/components/brand';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { ChangePasswordDialog } from '@/features/auth/ChangePasswordDialog';
import { useCan } from '@/hooks/use-permission';
import { api } from '@/services/api';
import { useAuth } from '@/store/auth';
import { useUi } from '@/store/ui';
import type { SettingsMap } from '@/types';
import { cn } from '@/utils/cn';
import { initials } from '@/utils/format';
import { GlobalSearch } from './GlobalSearch';
import { ICONS, visibleNavItems } from './navigation';


function Avatar({ name, className }: { name: string; className?: string }) {
  return <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white', className)}>{initials(name || '?')}</span>;
}

export function AppLayout() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNav, theme, setTheme } = useUi();
  const can = useCan();
  const [pwOpen, setPwOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const items = visibleNavItems(user);
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingsMap>('/settings'), staleTime: 5 * 60_000 });
  const businessName = String(settings.data?.business?.businessName ?? 'AMIR ZAMEER');
  const roleName = user?.roles.map((r) => r.name).join(', ') ?? '';

  const isActive = (path: string) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path));
  const doLogout = async () => { setMobileNav(false); await logout(); navigate('/login', { replace: true }); };

  const navList = (collapsed: boolean, onNavigate?: () => void) => (
    <nav className="relative z-10 flex-1 space-y-0.5 overflow-y-auto px-3 py-1 [scrollbar-width:thin]" aria-label="Main navigation">
      {items.map((m) => {
        const Icon = ICONS[m.icon] ?? MoreHorizontal;
        return (
          <NavLink
            key={m.key}
            to={m.path}
            end={m.path === '/'}
            onClick={onNavigate}
            title={collapsed ? m.label : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-white/10 hover:text-white',
              isActive(m.path) && 'bg-primary font-semibold text-[#101f3d] shadow-sm hover:bg-primary hover:text-[#101f3d]',
              collapsed && 'justify-center px-0',
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{m.label}</span>}
          </NavLink>
        );
      })}
    </nav>
  );

  const quickActions = [
    can('customers', 'CREATE') && { label: 'Add Customer', icon: UserPlus, to: '/customers?new=1' },
    can('customers', 'VIEW') && { label: 'Find Customer', icon: Users, to: '/customers' },
    can('measurements', 'VIEW') && { label: 'Measurements', icon: Ruler, to: '/measurements' },
    can('orders', 'CREATE') && { label: 'New Order', icon: ClipboardList, to: '/orders/new' },
  ].filter(Boolean) as { label: string; icon: typeof Plus; to: string }[];

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className={cn('relative hidden shrink-0 flex-col overflow-hidden bg-sidebar text-white transition-[width] duration-200 lg:flex no-print', sidebarCollapsed ? 'w-[72px]' : 'w-64')}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_60%_at_0%_100%,rgba(255,255,255,0.06),transparent_60%)]" />
        <Link to="/" className={cn('relative z-10 flex h-[88px] items-center justify-center px-4', sidebarCollapsed && 'h-16')}>
          {sidebarCollapsed ? <SewingMachineMark className="h-7 w-9 text-gold" /> : <BrandLogo name={businessName} stacked />}
        </Link>
        {navList(sidebarCollapsed)}
        <div className={cn('relative z-10 shrink-0', !sidebarCollapsed && 'h-28')}>
          {!sidebarCollapsed && <TailorArt className="pointer-events-none absolute -left-6 bottom-0 w-64 opacity-90" />}
          <div className="absolute inset-x-0 bottom-0 p-3">
            <button onClick={toggleSidebar} aria-label="Toggle sidebar"
              className={cn('flex w-full items-center justify-center gap-2 rounded-lg bg-black/30 px-3 py-2 text-xs font-medium text-sidebar-foreground backdrop-blur hover:bg-black/45 hover:text-white', sidebarCollapsed && 'static')}>
              {sidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : (<><ChevronsLeft className="h-4 w-4" /><span className="flex-1 text-left">Collapse</span></>)}
            </button>
          </div>
          {sidebarCollapsed && <div className="h-14" />}
        </div>
      </aside>

      {/* Mobile slide menu */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNav(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col overflow-hidden bg-sidebar text-white shadow-2xl animate-in slide-in-from-left">
            <div className="flex items-center justify-between px-4 pb-3 pt-5">
              <BrandLogo name={businessName} size="md" />
              <button className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setMobileNav(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            </div>
            <button onClick={() => { setMobileNav(false); setPwOpen(true); }} className="mx-3 mb-3 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 text-left hover:bg-white/10">
              <Avatar name={user?.fullName ?? ''} className="bg-white/15" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{user?.fullName}</span><span className="block truncate text-xs text-sidebar-foreground">{roleName}</span></span>
              <ChevronRight className="h-4 w-4 text-white/60" />
            </button>
            {navList(false, () => setMobileNav(false))}
            <div className="border-t border-white/10 p-3">
              <button onClick={doLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-rose-400 hover:bg-white/10"><LogOut className="h-[18px] w-[18px]" /> Logout</button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-navy px-3 text-white lg:hidden no-print">
          <button className="rounded-md p-1.5 hover:bg-white/10" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <Link to="/" className="flex flex-1 justify-center"><BrandLogo name={businessName} size="sm" /></Link>
          <ProfileMenu name={user?.fullName ?? ''} role={roleName} theme={theme} setTheme={setTheme} onPassword={() => setPwOpen(true)} onLogout={doLogout} compact />
        </header>

        {/* Desktop header */}
        <header className="sticky top-0 z-30 hidden h-16 items-center gap-4 border-b bg-card px-6 lg:flex no-print">
          <button className="rounded-md p-1.5 text-foreground hover:bg-muted" onClick={toggleSidebar} aria-label="Toggle sidebar"><Menu className="h-5 w-5" /></button>
          <GlobalSearch />
          <div className="flex-1" />
          <ProfileMenu name={user?.fullName ?? ''} role={roleName} theme={theme} setTheme={setTheme} onPassword={() => setPwOpen(true)} onLogout={doLogout} />
        </header>

        <main className="flex-1 overflow-y-auto px-4 pb-28 pt-5 lg:px-6 lg:pb-8 lg:pt-6">
          <div className="mx-auto max-w-7xl"><Outlet /></div>
        </main>

        {/* Mobile bottom navigation */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-end rounded-t-2xl border-t bg-card px-1 pb-[max(env(safe-area-inset-bottom),0.4rem)] pt-1.5 shadow-[0_-4px_16px_rgba(16,31,61,0.08)] lg:hidden no-print" aria-label="Quick navigation">
          <BottomLink to="/" label="Home" icon={Home} active={isActive('/')} />
          {can('orders', 'VIEW') ? <BottomLink to="/orders" label="Orders" icon={ClipboardList} active={isActive('/orders')} />
            : can('customers', 'VIEW') ? <BottomLink to="/customers" label="Customers" icon={Users} active={isActive('/customers')} /> : <span />}
          <div className="flex justify-center">
            <button onClick={() => setQuickOpen(true)} aria-label="Quick add" disabled={!quickActions.length}
              className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg ring-4 ring-card disabled:opacity-50">
              <Plus className="h-7 w-7" />
            </button>
          </div>
          {can('orders', 'VIEW') && can('customers', 'VIEW') ? <BottomLink to="/customers" label="Customers" icon={Users} active={isActive('/customers')} />
            : can('measurements', 'VIEW') ? <BottomLink to="/measurements" label="Measure" icon={Ruler} active={isActive('/measurements')} /> : <span />}
          <button onClick={() => setMobileNav(true)} className="flex flex-col items-center gap-0.5 py-1 text-[11px] text-muted-foreground">
            <MoreHorizontal className="h-5 w-5" />More
          </button>
        </nav>
      </div>

      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle><Plus className="h-5 w-5 text-primary" /> Quick add</DialogTitle><DialogDescription>Start a common task.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map((a) => (
              <button key={a.label} onClick={() => { setQuickOpen(false); navigate(a.to); }}
                className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-sm font-medium hover:border-primary hover:bg-accent">
                <a.icon className="h-6 w-6 text-primary" />{a.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  );
}

function BottomLink({ to, label, icon: Icon, active }: { to: string; label: string; icon: typeof Home; active: boolean }) {
  return (
    <NavLink to={to} end={to === '/'} className={cn('flex flex-col items-center gap-0.5 py-1 text-[11px] text-muted-foreground', active && 'font-semibold text-primary')}>
      <Icon className="h-5 w-5" />{label}
    </NavLink>
  );
}

function ProfileMenu({ name, role, theme, setTheme, onPassword, onLogout, compact }: {
  name: string; role: string; theme: 'light' | 'dark'; setTheme: (t: 'light' | 'dark') => void; onPassword: () => void; onLogout: () => void; compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={cn('flex items-center gap-2.5 rounded-lg p-1 pr-2', compact ? 'hover:bg-white/10' : 'hover:bg-muted')} aria-label="Account menu">
          <Avatar name={name} className={compact ? 'h-8 w-8 bg-white/15' : ''} />
          {!compact && (
            <>
              <span className="text-left">
                <span className="block text-sm font-semibold leading-tight">{name}</span>
                <span className="block text-xs leading-tight text-muted-foreground">{role}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="mb-1 flex items-center gap-3 rounded-lg bg-muted/60 p-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">{initials(name || '?')}</span>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold">{name}</span><span className="block truncate text-xs text-muted-foreground">{role}</span></span>
        </div>
        <DropdownMenuItem onSelect={onPassword}><KeyRound /> Change Password</DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setTheme(theme === 'dark' ? 'light' : 'dark'); }}>
          <Moon /> <span className="flex-1">Dark Mode</span>
          <Switch checked={theme === "dark"} onCheckedChange={() => undefined} className="pointer-events-none" aria-label="Dark mode" />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-rose-600 focus:text-rose-600" onSelect={onLogout}><LogOut /> Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
