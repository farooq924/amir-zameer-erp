import { ChevronsLeft, ChevronsRight, KeyRound, LogOut, Menu, MoreHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChangePasswordDialog } from '@/features/auth/ChangePasswordDialog';
import { api } from '@/services/api';
import { useAuth } from '@/store/auth';
import { useUi } from '@/store/ui';
import type { SettingsMap } from '@/types';
import { cn } from '@/utils/cn';
import { ICONS, MOBILE_PRIMARY, visibleNavItems } from './navigation';

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

export function AppLayout() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNav } = useUi();
  const [pwOpen, setPwOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const items = visibleNavItems(user);
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingsMap>('/settings'), staleTime: 5 * 60_000 });
  const businessName = String(settings.data?.business?.businessName ?? 'AMIR ZAMEER');

  const isActive = (path: string) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path));

  const navList = (collapsed: boolean, onNavigate?: () => void) => (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3" aria-label="Main navigation">
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
              'flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              isActive(m.path) && 'bg-background text-foreground shadow-sm ring-1 ring-border',
              collapsed && 'justify-center px-0',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{m.label}</span>}
          </NavLink>
        );
      })}
    </nav>
  );

  const brand = (collapsed: boolean) => (
    <Link to="/" className="flex h-14 items-center gap-2.5 border-b px-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">AZ</span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight">{businessName}</span>
          <span className="block text-[11px] leading-tight text-muted-foreground">Tailoring ERP</span>
        </span>
      )}
    </Link>
  );

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className={cn('hidden shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 lg:flex', sidebarCollapsed ? 'w-16' : 'w-60')}>
        {brand(sidebarCollapsed)}
        {navList(sidebarCollapsed)}
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full justify-center" onClick={toggleSidebar} aria-label="Toggle sidebar">
            {sidebarCollapsed ? <ChevronsRight /> : (<><ChevronsLeft /> <span className="flex-1 text-left">Collapse</span></>)}
          </Button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNav(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-sidebar shadow-xl">
            <div className="relative">
              {brand(false)}
              <Button variant="ghost" size="icon" className="absolute right-2 top-2.5" onClick={() => setMobileNav(false)} aria-label="Close menu"><X /></Button>
            </div>
            {navList(false, () => setMobileNav(false))}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur no-print">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu /></Button>
          <div className="min-w-0 flex-1 truncate text-sm font-medium lg:hidden">{businessName}</div>
          <div className="hidden flex-1 lg:block" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-md p-1 pr-2 hover:bg-accent" aria-label="Account menu">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold">{initials(user?.fullName ?? '?')}</span>
                <span className="hidden text-left sm:block">
                  <span className="block text-sm font-medium leading-tight">{user?.fullName}</span>
                  <span className="block text-[11px] leading-tight text-muted-foreground">{user?.roles.map((r) => r.name).join(', ')}</span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setPwOpen(true)}><KeyRound /> Change password</DropdownMenuItem>
              <DropdownMenuItem onSelect={async () => { await logout(); navigate('/login', { replace: true }); }}><LogOut /> Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-5 lg:px-6 lg:pb-8">
          <div className="mx-auto max-w-7xl"><Outlet /></div>
        </main>

        {/* Mobile bottom navigation */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden no-print" aria-label="Quick navigation">
          {items.filter((m) => MOBILE_PRIMARY.includes(m.key)).slice(0, 4).map((m) => {
            const Icon = ICONS[m.icon] ?? MoreHorizontal;
            return (
              <NavLink key={m.key} to={m.path} end={m.path === '/'}
                className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground', isActive(m.path) && 'text-foreground font-medium')}>
                <Icon className="h-5 w-5" />{m.label.split(' ')[0]}
              </NavLink>
            );
          })}
          <button onClick={() => setMobileNav(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground">
            <MoreHorizontal className="h-5 w-5" />More
          </button>
        </nav>
      </div>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  );
}
