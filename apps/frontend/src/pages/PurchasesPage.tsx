import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Eye, Plus, Receipt, Search, ShoppingCart, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState, ErrorState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { StatCard } from '@/features/dashboard/StatCard';
import { PurchasePaymentBadge, useDebounced } from '@/features/inventory/shared';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { Paginated, PurchaseListRow } from '@/types';
import { cn } from '@/utils/cn';
import { formatDate, formatPKR } from '@/utils/format';

type PurchaseList = Paginated<PurchaseListRow> & { totals: { amount: string; balance: string } };

export function PurchasesPage() {
  const can = useCan();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [payment, setPayment] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const list = useQuery({
    queryKey: ['purchases', 'list', { q, payment, from, to, page }],
    queryFn: () => api.get<PurchaseList>('/purchases', { search: q, payment, from, to, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const reset = () => setPage(1);
  const filtered = !!(q || payment !== 'all' || from || to);
  const d = list.data;

  return (
    <div>
      <PageHeader title="Purchases" description="Supplier bills for fabric. Saving a bill adds the fabric to stock."
        actions={can('purchases', 'CREATE') && <Button onClick={() => navigate('/purchases/new')}><Plus /> New purchase</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard featured label={filtered ? 'Purchases (filtered)' : 'All purchases'} value={formatPKR(d?.totals.amount)} icon={ShoppingCart} loading={list.isLoading} hint={d ? `${d.meta.total} bill(s)` : undefined} />
        <button type="button" className="text-left" onClick={() => { setPayment('unpaid'); reset(); }}>
          <StatCard label="Still to pay" value={formatPKR(d?.totals.balance)} icon={Wallet} tile="rose" tone={Number(d?.totals.balance) > 0 ? 'negative' : undefined} loading={list.isLoading} className="h-full hover:border-primary" />
        </button>
        <StatCard label="Bills on this page" value={String(d?.data.length ?? 0)} icon={Receipt} tile="blue" loading={list.isLoading} className="col-span-2 lg:col-span-1" />
      </div>
      <Card>
        <div className="grid grid-cols-2 items-center gap-2 border-b p-3 sm:flex sm:flex-wrap">
          <div className="relative col-span-2 w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Purchase no., bill no. or supplier" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} aria-label="Search purchases" />
          </div>
          <NativeSelect aria-label="Payment" className="col-span-2 sm:w-36" value={payment} onChange={(e) => { setPayment(e.target.value); reset(); }}>
            <option value="all">Any payment</option><option value="unpaid">To pay</option><option value="paid">Paid</option>
          </NativeSelect>
          <Input type="date" aria-label="From date" className="sm:w-40" value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} />
          <Input type="date" aria-label="To date" className="sm:w-40" value={to} onChange={(e) => { setTo(e.target.value); reset(); }} />
          {filtered && <Button variant="ghost" size="sm" className="col-span-2 justify-self-start" onClick={() => { setSearch(''); setPayment('all'); setFrom(''); setTo(''); reset(); }}>Clear filters</Button>}
        </div>
        {list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : list.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !d!.data.length ? (
          <EmptyState icon={<ShoppingCart />} title={filtered ? 'No purchases match these filters' : 'No purchases yet'}
            description={filtered ? 'Try another search or clear the filters.' : 'Enter your first supplier bill to add fabric to stock.'}
            action={!filtered && can('purchases', 'CREATE') ? <Button onClick={() => navigate('/purchases/new')}><Plus /> New purchase</Button> : undefined} />
        ) : (
          <>
            <ul className="divide-y sm:hidden">
              {d!.data.map((p) => (
                <li key={p.id}>
                  <Link to={`/purchases/${p.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-accent/50">
                    <span className="icon-tile h-12 w-12 shrink-0 rounded-xl bg-gold-soft text-[#8a6a1f] dark:text-gold"><Receipt className="h-6 w-6" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{p.purchaseNo}</span>
                      <span className="block truncate text-sm text-muted-foreground">{p.supplier.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{formatDate(p.purchaseDate)} · {p.fabrics}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1"><span className="font-semibold tabular-nums">{formatPKR(p.totalAmount)}</span><PurchasePaymentBadge total={p.totalAmount} balance={p.balanceAmount} /></span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden sm:block">
              <Table>
                <THead><TR><TH>Date</TH><TH>Purchase</TH><TH>Supplier</TH><TH className="hidden lg:table-cell">Fabrics</TH><TH className="text-right">Total</TH><TH className="hidden md:table-cell text-right">Due</TH><TH>Payment</TH><TH className="w-12"><span className="sr-only">Open</span></TH></TR></THead>
                <TBody>
                  {d!.data.map((p) => (
                    <TR key={p.id} className="cursor-pointer" onClick={() => navigate(`/purchases/${p.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/purchases/${p.id}`)}>
                      <TD className="whitespace-nowrap">{formatDate(p.purchaseDate)}</TD>
                      <TD><span className="font-semibold">{p.purchaseNo}</span>{p.supplierInvoiceNo && <span className="block text-xs text-muted-foreground">Bill {p.supplierInvoiceNo}</span>}</TD>
                      <TD>{p.supplier.name}</TD>
                      <TD className="hidden max-w-[220px] truncate lg:table-cell" title={p.fabrics}>{p.fabrics}</TD>
                      <TD className="whitespace-nowrap text-right tabular-nums">{formatPKR(p.totalAmount)}</TD>
                      <TD className={cn('hidden whitespace-nowrap text-right tabular-nums md:table-cell', Number(p.balanceAmount) > 0 && 'font-medium text-rose-700 dark:text-rose-400')}>{formatPKR(p.balanceAmount)}</TD>
                      <TD><PurchasePaymentBadge total={p.totalAmount} balance={p.balanceAmount} /></TD>
                      <TD><Button variant="ghost" size="icon" aria-label={`Open ${p.purchaseNo}`} asChild><Link to={`/purchases/${p.id}`} onClick={(e) => e.stopPropagation()}><Eye /></Link></Button></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </>
        )}
        {d && d.meta.total > 0 && (
          <div className="flex items-center justify-between border-t p-3 text-sm">
            <span className="text-muted-foreground">{d.meta.total} purchases · page {d.meta.page} of {d.meta.totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= d.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
