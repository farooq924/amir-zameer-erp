import { formatPhone } from '@az/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Banknote, Eye, Plus, Search, Truck, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState, ErrorState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { StatCard } from '@/features/dashboard/StatCard';
import { SupplierFormDialog } from '@/features/inventory/SupplierDialogs';
import { SupplierStatusBadge, useDebounced } from '@/features/inventory/shared';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { Paginated, Supplier } from '@/types';
import { cn } from '@/utils/cn';
import { formatPKR } from '@/utils/format';

export function SuppliersPage() {
  const can = useCan();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [payable, setPayable] = useState(false);
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const q = useDebounced(search);
  const summary = useQuery({ queryKey: ['suppliers', 'summary'], queryFn: () => api.get<{ activeSuppliers: number; totalPayable: string; suppliersOwed: number }>('/suppliers/summary') });
  const list = useQuery({
    queryKey: ['suppliers', 'list', { q, status, payable, page }],
    queryFn: () => api.get<Paginated<Supplier>>('/suppliers', { search: q, status, payable: payable ? 'true' : undefined, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const reset = () => setPage(1);
  const filtered = !!(q || status !== 'ACTIVE' || payable);
  const s = summary.data;

  return (
    <div>
      <PageHeader title="Suppliers" description="Who you buy fabric from and how much you owe them."
        actions={can('suppliers', 'CREATE') && <Button onClick={() => setAddOpen(true)}><Plus /> Add supplier</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard featured label="Total payable" value={formatPKR(s?.totalPayable)} icon={Banknote} loading={summary.isLoading} hint="Amount you owe suppliers" />
        <button type="button" className="text-left" onClick={() => { setPayable(true); reset(); }}>
          <StatCard label="Suppliers to pay" value={String(s?.suppliersOwed ?? 0)} icon={Truck} tile="rose" loading={summary.isLoading} className="h-full hover:border-primary" />
        </button>
        <StatCard label="Active suppliers" value={String(s?.activeSuppliers ?? 0)} icon={Users} tile="blue" loading={summary.isLoading} className="col-span-2 lg:col-span-1" />
      </div>
      <Card>
        <div className="grid grid-cols-2 items-center gap-2 border-b p-3 sm:flex sm:flex-wrap">
          <div className="relative col-span-2 w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Name, code, city or phone" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} aria-label="Search suppliers" />
          </div>
          <NativeSelect aria-label="Status" className="sm:w-36" value={status} onChange={(e) => { setStatus(e.target.value); reset(); }}>
            <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ALL">All</option>
          </NativeSelect>
          <NativeSelect aria-label="Balance" className="sm:w-40" value={payable ? 'yes' : ''} onChange={(e) => { setPayable(e.target.value === 'yes'); reset(); }}>
            <option value="">Any balance</option><option value="yes">Money owed</option>
          </NativeSelect>
          {filtered && <Button variant="ghost" size="sm" className="col-span-2 justify-self-start" onClick={() => { setSearch(''); setStatus('ACTIVE'); setPayable(false); reset(); }}>Clear filters</Button>}
        </div>
        {list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : list.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !list.data!.data.length ? (
          <EmptyState icon={<Truck />} title={filtered ? 'No suppliers match these filters' : 'No suppliers yet'}
            description={filtered ? 'Try another search or clear the filters.' : 'Add the suppliers you buy fabric from.'}
            action={!filtered && can('suppliers', 'CREATE') ? <Button onClick={() => setAddOpen(true)}><Plus /> Add supplier</Button> : undefined} />
        ) : (
          <>
            <ul className="divide-y sm:hidden">
              {list.data!.data.map((x) => (
                <li key={x.id}>
                  <Link to={`/suppliers/${x.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-accent/50">
                    <span className="icon-tile h-12 w-12 shrink-0 rounded-xl bg-gold-soft text-[#8a6a1f] dark:text-gold"><Truck className="h-6 w-6" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{x.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{x.code}{x.city ? ` · ${x.city}` : ''}{x.contactNumber ? ` · ${formatPhone(x.contactNumber)}` : ''}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className={cn('font-semibold tabular-nums', Number(x.balance) > 0 && 'text-rose-700 dark:text-rose-400')}>{formatPKR(x.balance)}</span>
                      <SupplierStatusBadge status={x.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden sm:block">
              <Table>
                <THead><TR><TH>Code</TH><TH>Supplier</TH><TH className="hidden md:table-cell">Phone</TH><TH className="hidden lg:table-cell">City</TH><TH className="hidden lg:table-cell text-right">Fabrics</TH><TH className="text-right">You owe</TH><TH>Status</TH><TH className="w-12"><span className="sr-only">Open</span></TH></TR></THead>
                <TBody>
                  {list.data!.data.map((x) => (
                    <TR key={x.id} className="cursor-pointer" onClick={() => navigate(`/suppliers/${x.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/suppliers/${x.id}`)}>
                      <TD className="font-mono text-xs font-semibold">{x.code}</TD>
                      <TD className="font-medium">{x.name}</TD>
                      <TD className="hidden md:table-cell">{x.contactNumber ? formatPhone(x.contactNumber) : '-'}</TD>
                      <TD className="hidden lg:table-cell">{x.city ?? '-'}</TD>
                      <TD className="hidden text-right tabular-nums lg:table-cell">{x.fabrics ?? 0}</TD>
                      <TD className={cn('whitespace-nowrap text-right font-semibold tabular-nums', Number(x.balance) > 0 && 'text-rose-700 dark:text-rose-400')}>{formatPKR(x.balance)}</TD>
                      <TD><SupplierStatusBadge status={x.status} /></TD>
                      <TD><Button variant="ghost" size="icon" aria-label={`Open ${x.name}`} asChild><Link to={`/suppliers/${x.id}`} onClick={(e) => e.stopPropagation()}><Eye /></Link></Button></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </>
        )}
        {list.data && list.data.meta.total > 0 && (
          <div className="flex items-center justify-between border-t p-3 text-sm">
            <span className="text-muted-foreground">{list.data.meta.total} suppliers · page {list.data.meta.page} of {list.data.meta.totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= list.data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
      <SupplierFormDialog open={addOpen} onOpenChange={setAddOpen} supplier={null} onSaved={(x) => navigate(`/suppliers/${x.id}`)} />
    </div>
  );
}
