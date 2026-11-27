import { formatPhone } from '@az/shared';
import { Banknote, ClipboardList, CloudDownload, Database, RefreshCw, Ruler, Search, UserPlus, UserRoundPen, Users, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/features/dashboard/StatCard';
import { OfflineCustomerDialog, OfflineMeasurementDialog, OfflineOrderDialog, OfflinePaymentDialog } from '@/features/offline/OfflineDialogs';
import { OutboxStatusBadge } from '@/features/offline/SyncBadges';
import { useLive } from '@/features/offline/use-live';
import { useCan } from '@/hooks/use-permission';
import { type CachedCustomer, type CachedOrder, db, getMeta } from '@/offline/db';
import { useSync } from '@/offline/sync';
import { useAuth } from '@/store/auth';
import { cn } from '@/utils/cn';
import { formatDate, formatDateTime, formatPKR } from '@/utils/format';

/** Work without internet: everything here reads and writes the device copy (IndexedDB) and syncs later. */
export function OfflineDeskPage() {
  const can = useCan();
  const user = useAuth((s) => s.user);
  const { online, syncing, syncNow, counts } = useSync();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CachedCustomer | null>(null);
  const [dialog, setDialog] = useState<null | 'customer' | 'edit' | 'measure' | 'order' | 'pay'>(null);
  const [payOrder, setPayOrder] = useState<CachedOrder | null>(null);

  const stats = useLive(async () => ({
    customers: await db.customers.count(),
    orders: await db.orders.filter((o) => Number(o.balanceAmount) > 0).count(),
    templates: await db.templates.count(),
    pulledAt: await getMeta<string>('pulledAt'),
  }), [], { customers: 0, orders: 0, templates: 0, pulledAt: undefined as string | undefined });

  const customers = useLive(async () => {
    const term = search.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    const rows = term.length < 2
      ? await db.customers.orderBy('updatedAt').reverse().limit(8).toArray()
      : await db.customers.filter((c) => c.name.toLowerCase().includes(term) || (c.code ?? '').toLowerCase().includes(term)
        || (digits.length >= 3 && (c.mobile.includes(digits) || c.mobile.includes(digits.replace(/^0/, '92'))))).limit(30).toArray();
    return rows;
  }, [search], [] as CachedCustomer[]);

  const customerOrders = useLive(async () => (selected ? db.orders.where('customerId').equals(selected.id).toArray() : []), [selected?.id], [] as CachedOrder[]);
  const recent = useLive(async () => (user ? (await db.outbox.where('userId').equals(user.id).toArray()).sort((a, b) => b.clientTimestamp.localeCompare(a.clientTimestamp)).slice(0, 6) : []), [user?.id], []);
  // Keep the selected customer fresh (code arrives after sync).
  const fresh = useLive(async () => (selected ? (await db.customers.get(selected.id)) ?? null : null), [selected?.id], null as CachedCustomer | null);
  const current = fresh ?? selected;

  const download = async () => {
    const r = await syncNow({ full: true });
    if (r && useSync.getState().lastError === null) toast.success('Latest data downloaded to this device');
    else toast.error(useSync.getState().lastError ?? 'Could not download');
  };

  const actions = [
    can('customers', 'CREATE') && { key: 'customer' as const, label: 'New Customer', icon: UserPlus, hint: 'Register a walk-in' },
    can('measurements', 'CREATE') && { key: 'measure' as const, label: 'Take Measurement', icon: Ruler, hint: 'New measurement version' },
    can('orders', 'CREATE') && { key: 'order' as const, label: 'Book Order', icon: ClipboardList, hint: 'Garments, delivery, advance' },
    can('payments', 'CREATE') && { key: 'pay' as const, label: 'Receive Payment', icon: Banknote, hint: 'Against an open order' },
  ].filter(Boolean) as { key: 'customer' | 'measure' | 'order' | 'pay'; label: string; icon: typeof UserPlus; hint: string }[];

  return (
    <div>
      <PageHeader
        title="Offline Desk"
        description="Keep booking customers when the internet is down. Work saved here stays on this device and syncs to the server automatically."
        actions={(
          <>
            <Button variant="outline" onClick={download} disabled={!online} loading={syncing}><CloudDownload /> Download latest data</Button>
            <Button variant="navy" asChild><Link to="/sync"><RefreshCw /> Sync Center</Link></Button>
          </>
        )}
      />

      <div className={cn('mb-4 flex items-start gap-3 rounded-xl border p-3 text-sm', online
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
        : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200')}>
        {online ? <Wifi className="mt-0.5 h-5 w-5 shrink-0" /> : <WifiOff className="mt-0.5 h-5 w-5 shrink-0" />}
        <div className="flex-1">
          <p className="font-semibold">{online ? 'Online: entries are sent to the server straight away.' : 'Offline: entries are saved on this device.'}</p>
          <p className="text-xs opacity-80">Device data last downloaded {stats.pulledAt ? formatDateTime(stats.pulledAt) : 'never'}.{!stats.customers && ' Go online once and press "Download latest data" so customers are available offline.'}</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard featured label="Waiting to sync" value={String(counts.pending)} hint={counts.conflict + counts.rejected ? `${counts.conflict + counts.rejected} need review` : 'Sent automatically'} icon={RefreshCw} />
        <StatCard label="Customers on device" value={String(stats.customers)} icon={Users} tile="blue" />
        <StatCard label="Open orders with balance" value={String(stats.orders)} icon={ClipboardList} tile="purple" />
        <StatCard label="Measurement templates" value={String(stats.templates)} icon={Database} tile="green" />
      </div>

      {actions.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {actions.map((a) => (
            <button key={a.key} onClick={() => { setPayOrder(null); setDialog(a.key); }}
              className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary hover:bg-accent sm:p-4">
              <span className="icon-tile h-10 w-10 bg-gold-soft text-primary [&_svg]:h-5 [&_svg]:w-5"><a.icon /></span>
              <span className="min-w-0"><span className="block text-sm font-semibold">{a.label}</span><span className="block truncate text-xs text-muted-foreground">{a.hint}</span></span>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="border-b p-4">
            <h2 className="mb-3 font-semibold">Customers on this device</h2>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search customers on this device" className="pl-9" placeholder="Name, code or mobile" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          {!customers.length ? (
            <EmptyState icon={<Users />} title={search ? 'No match on this device' : 'No customers on this device yet'} description={search ? 'Try another name or number, or add a new customer.' : 'Go online and press "Download latest data".'} />
          ) : (
            <ul className="divide-y">
              {customers.map((c) => (
                <li key={c.id}>
                  <button onClick={() => setSelected(c)} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60', current?.id === c.id && 'bg-gold-soft/60 dark:bg-gold-soft/10')}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white">{c.name.slice(0, 2).toUpperCase()}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{formatPhone(c.mobile)}{c.city ? ` · ${c.city}` : ''}</span></span>
                    {c.local ? <Badge variant="warning">Not synced</Badge> : <span className="font-mono text-xs text-muted-foreground">{c.code}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            {!current ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Select a customer to measure, book an order or receive a payment.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-lg font-semibold">{current.name}</p>
                    <p className="text-xs text-muted-foreground">{current.code ?? 'New customer (not synced yet)'} · {formatPhone(current.mobile)}</p>
                    {current.address && <p className="text-xs text-muted-foreground">{current.address}{current.city ? `, ${current.city}` : ''}</p>}</div>
                  {can('customers', 'EDIT') && !current.local && <Button size="sm" variant="outline" onClick={() => setDialog('edit')}><UserRoundPen /> Edit</Button>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {can('measurements', 'CREATE') && <Button variant="gold" size="sm" onClick={() => setDialog('measure')}><Ruler /> Measure</Button>}
                  {can('orders', 'CREATE') && <Button size="sm" onClick={() => setDialog('order')}><ClipboardList /> Book order</Button>}
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open orders</p>
                  {!customerOrders.length ? <p className="text-sm text-muted-foreground">No open orders on this device.</p> : (
                    <ul className="divide-y rounded-lg border">
                      {customerOrders.map((o) => (
                        <li key={o.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                          <span className="min-w-0"><span className="block font-mono text-xs font-semibold">{o.orderNumber ?? 'New (not synced)'}</span>
                            <span className="block text-xs text-muted-foreground">Delivery {formatDate(o.expectedDeliveryDate)}{o.stage ? ` · ${o.stage.name}` : ''}</span></span>
                          <span className="flex items-center gap-2">
                            <span className={cn('font-semibold tabular-nums', Number(o.balanceAmount) > 0 && 'text-rose-700 dark:text-rose-400')}>{formatPKR(o.balanceAmount)}</span>
                            {can('payments', 'CREATE') && Number(o.balanceAmount) > 0 && <Button size="sm" variant="outline" onClick={() => { setPayOrder(o); setDialog('pay'); }}>Receive</Button>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">Saved on this device</h2><Link to="/sync?tab=device" className="text-xs font-semibold text-primary">View all</Link></div>
            {!recent.length ? <p className="p-4 text-center text-sm text-muted-foreground">Nothing waiting. Everything is on the server.</p> : (
              <ul className="divide-y">
                {recent.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{o.title}</span><span className="block truncate text-xs text-muted-foreground">{o.subtitle}</span></span>
                    <OutboxStatusBadge status={o.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <OfflineCustomerDialog open={dialog === 'customer'} onOpenChange={(o) => !o && setDialog(null)} onSaved={setSelected} />
      <OfflineCustomerDialog open={dialog === 'edit'} editing={current} onOpenChange={(o) => !o && setDialog(null)} onSaved={setSelected} />
      <OfflineMeasurementDialog open={dialog === 'measure'} customer={current} onOpenChange={(o) => !o && setDialog(null)} />
      <OfflineOrderDialog open={dialog === 'order'} customer={current} onOpenChange={(o) => !o && setDialog(null)} />
      <OfflinePaymentDialog open={dialog === 'pay'} order={payOrder} onOpenChange={(o) => { if (!o) { setDialog(null); setPayOrder(null); } }} />
    </div>
  );
}
