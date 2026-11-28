import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Receipt, Search, ShoppingCart, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState, PageHeader } from '@/components/common';
import { type DataColumn, DataTable, fetchAllPages } from '@/components/data-table/DataTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { StatCard } from '@/features/dashboard/StatCard';
import { PurchasePaymentBadge, useDebounced } from '@/features/inventory/shared';
import { useCan } from '@/hooks/use-permission';
import { api } from '@/services/api';
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
  const [pageSize, setPageSize] = useState(25);
  const q = useDebounced(search);
  const listParams = { search: q, payment, from, to };
  const list = useQuery({
    queryKey: ['purchases', 'list', { q, payment, from, to, page, pageSize }],
    queryFn: () => api.get<PurchaseList>('/purchases', { ...listParams, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const reset = () => setPage(1);
  const filtered = !!(q || payment !== 'all' || from || to);
  const d = list.data;

  const columns: DataColumn<PurchaseListRow>[] = [
    { id: 'date', header: 'Date', value: (p) => p.purchaseDate, text: (p) => formatDate(p.purchaseDate), className: 'whitespace-nowrap' },
    { id: 'purchaseNo', header: 'Purchase', value: (p) => p.purchaseNo, text: (p) => `${p.purchaseNo}${p.supplierInvoiceNo ? ` (Bill ${p.supplierInvoiceNo})` : ''}`,
      cell: (p) => <><span className="font-semibold">{p.purchaseNo}</span>{p.supplierInvoiceNo && <span className="block text-xs text-muted-foreground">Bill {p.supplierInvoiceNo}</span>}</> },
    { id: 'supplier', header: 'Supplier', value: (p) => p.supplier.name },
    { id: 'fabrics', header: 'Fabrics', value: (p) => p.fabrics, cell: (p) => <span className="block max-w-[220px] truncate" title={p.fabrics}>{p.fabrics}</span>, className: 'hidden lg:table-cell' },
    { id: 'total', header: 'Total', type: 'money', value: (p) => p.totalAmount, cell: (p) => formatPKR(p.totalAmount) },
    { id: 'due', header: 'Due', type: 'money', value: (p) => p.balanceAmount, className: 'hidden md:table-cell',
      cell: (p) => <span className={cn(Number(p.balanceAmount) > 0 && 'font-medium text-rose-700 dark:text-rose-400')}>{formatPKR(p.balanceAmount)}</span> },
    { id: 'payment', header: 'Payment', value: (p) => (Number(p.balanceAmount) > 0 ? 'To pay' : 'Paid'), cell: (p) => <PurchasePaymentBadge total={p.totalAmount} balance={p.balanceAmount} /> },
  ];
  const open = (p: PurchaseListRow) => navigate(`/purchases/${p.id}`);

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
        <DataTable
          title="Purchases"
          module="purchases"
          noun="purchase"
          rows={d?.data}
          columns={columns}
          getRowId={(p) => p.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          pagination={{ page, pageSize, total: d?.meta.total ?? 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
          fetchAll={() => fetchAllPages((pg, size) => api.get<PurchaseList>('/purchases', { ...listParams, page: pg, pageSize: size }))}
          onRowClick={open}
          onView={open}
          toolbar={
            <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
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
          }
          empty={
            <EmptyState icon={<ShoppingCart />} title={filtered ? 'No purchases match these filters' : 'No purchases yet'}
            description={filtered ? 'Try another search or clear the filters.' : 'Enter your first supplier bill to add fabric to stock.'}
            action={!filtered && can('purchases', 'CREATE') ? <Button onClick={() => navigate('/purchases/new')}><Plus /> New purchase</Button> : undefined} />
          }
          mobileCard={(p) => (
            <Link to={`/purchases/${p.id}`} className="flex items-center gap-3 px-1 py-3">
                    <span className="icon-tile h-12 w-12 shrink-0 rounded-xl bg-gold-soft text-[#8a6a1f] dark:text-gold"><Receipt className="h-6 w-6" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{p.purchaseNo}</span>
                      <span className="block truncate text-sm text-muted-foreground">{p.supplier.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{formatDate(p.purchaseDate)} · {p.fabrics}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1"><span className="font-semibold tabular-nums">{formatPKR(p.totalAmount)}</span><PurchasePaymentBadge total={p.totalAmount} balance={p.balanceAmount} /></span>
                  </Link>
          )}
        />
      </Card>
    </div>
  );
}
