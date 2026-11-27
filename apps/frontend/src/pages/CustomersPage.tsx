import { formatPhone } from '@az/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Search, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, ErrorState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { CustomerStatusBadge, CustomerTypeBadge } from '@/features/customers/badges';
import { CustomerFormDialog } from '@/features/customers/CustomerFormDialog';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { Customer, Paginated } from '@/types';
import { cn } from '@/utils/cn';
import { formatPKR } from '@/utils/format';

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function CustomersPage() {
  const can = useCan();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('createdAt:desc');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const q = useDebounced(search);
  const [sortBy, sortOrder] = sort.split(':');

  const customers = useQuery({
    queryKey: ['customers', { q, status, type, sort, page }],
    queryFn: () => api.get<Paginated<Customer>>('/customers', { search: q, status, customerType: type, sortBy, sortOrder, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Search by name, customer code or mobile number."
        actions={can('customers', 'CREATE') && <Button onClick={() => setFormOpen(true)}><Plus /> Add customer</Button>}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Name, code or mobile" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search customers" />
          </div>
          <NativeSelect aria-label="Status" className="w-36" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="BLOCKED">Blocked</option>
          </NativeSelect>
          <NativeSelect aria-label="Customer type" className="w-36" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All types</option><option value="REGULAR">Regular</option><option value="WALK_IN">Walk-in</option><option value="VIP">VIP</option><option value="CORPORATE">Corporate</option>
          </NativeSelect>
          <NativeSelect aria-label="Sort" className="w-40" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="createdAt:desc">Newest first</option><option value="createdAt:asc">Oldest first</option>
            <option value="name:asc">Name A-Z</option><option value="name:desc">Name Z-A</option><option value="code:asc">Code</option>
          </NativeSelect>
        </div>
        {customers.isError ? <ErrorState message={errorMessage(customers.error)} onRetry={() => customers.refetch()} /> : customers.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : customers.data!.data.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title={q || status || type ? 'No customers match your search' : 'No customers yet'}
            description={q ? 'Check the spelling or search by mobile number.' : 'Add your first customer to start taking measurements and orders.'}
            action={can('customers', 'CREATE') && !q ? <Button size="sm" onClick={() => setFormOpen(true)}><Plus /> Add customer</Button> : undefined} />
        ) : (
          <Table>
            <THead><TR><TH>Code</TH><TH>Name</TH><TH>Mobile</TH><TH className="hidden md:table-cell">City</TH><TH className="hidden md:table-cell">Type</TH><TH>Status</TH><TH className="text-right">Outstanding</TH></TR></THead>
            <TBody>
              {customers.data!.data.map((c) => (
                <TR key={c.id} className="cursor-pointer" onClick={() => navigate(`/customers/${c.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/customers/${c.id}`)}>
                  <TD className="whitespace-nowrap font-mono text-xs text-muted-foreground">{c.code}</TD>
                  <TD className="font-medium">{c.name}</TD>
                  <TD className="whitespace-nowrap">{formatPhone(c.mobile)}</TD>
                  <TD className="hidden md:table-cell">{c.city ?? '-'}</TD>
                  <TD className="hidden md:table-cell"><CustomerTypeBadge type={c.customerType} /></TD>
                  <TD><CustomerStatusBadge status={c.status} /></TD>
                  <TD className={cn('whitespace-nowrap text-right tabular-nums', Number(c.outstanding) > 0 && 'font-medium text-red-700')}>{formatPKR(c.outstanding)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {customers.data && customers.data.meta.total > 0 && (
          <div className="flex items-center justify-between border-t p-3 text-sm">
            <span className="text-muted-foreground">{customers.data.meta.total} customers · page {customers.data.meta.page} of {customers.data.meta.totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= customers.data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
      <CustomerFormDialog open={formOpen} onOpenChange={setFormOpen} onSaved={(c) => navigate(`/customers/${c.id}`)} />
    </div>
  );
}
