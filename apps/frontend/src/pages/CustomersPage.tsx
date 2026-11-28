import { formatPhone } from '@az/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyState, PageHeader } from '@/components/common';
import { type DataColumn, DataTable, type SortState, fetchAllPages } from '@/components/data-table/DataTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { CustomerStatusBadge, CustomerTypeBadge } from '@/features/customers/badges';
import { CustomerFormDialog } from '@/features/customers/CustomerFormDialog';
import { useCan } from '@/hooks/use-permission';
import { api } from '@/services/api';
import type { Customer, Paginated } from '@/types';
import { cn } from '@/utils/cn';
import { formatDate, formatPKR, initials } from '@/utils/format';

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function CustomersPage() {
  const can = useCan();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(() => params.get('search') ?? '');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [copyFrom, setCopyFrom] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(() => params.get('new') === '1' && can('customers', 'CREATE'));
  // Links such as the header search and "Add Customer" quick action pass ?search= / ?new=1.
  useEffect(() => {
    const s = params.get('search');
    if (s !== null) setSearch(s);
    if (params.get('new') === '1' && can('customers', 'CREATE')) setFormOpen(true);
    if (s !== null || params.has('new')) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  const q = useDebounced(search);
  const sortBy = sort?.id ?? 'createdAt';
  const sortOrder = sort ? (sort.desc ? 'desc' : 'asc') : 'desc';
  const filters = { search: q, status, customerType: type, sortBy, sortOrder };

  const customers = useQuery({
    queryKey: ['customers', { q, status, type, sortBy, sortOrder, page, pageSize }],
    queryFn: () => api.get<Paginated<Customer>>('/customers', { ...filters, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['customers'] });
  const openNew = () => { setEditing(null); setCopyFrom(null); setFormOpen(true); };

  const columns: DataColumn<Customer>[] = [
    { id: 'code', header: 'Code', sortKey: 'code', value: (c) => c.code, cell: (c) => <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">{c.code}</span> },
    { id: 'name', header: 'Name', sortKey: 'name', value: (c) => c.name, cell: (c) => <span className="font-medium">{c.name}</span> },
    { id: 'mobile', header: 'Mobile', value: (c) => formatPhone(c.mobile), className: 'whitespace-nowrap' },
    { id: 'city', header: 'City', value: (c) => c.city, className: 'hidden md:table-cell' },
    { id: 'type', header: 'Type', value: (c) => c.customerType, text: (c) => c.customerType.replace('_', '-'), cell: (c) => <CustomerTypeBadge type={c.customerType} />, className: 'hidden md:table-cell' },
    { id: 'status', header: 'Status', value: (c) => c.status, cell: (c) => <CustomerStatusBadge status={c.status} /> },
    { id: 'registrationDate', header: 'Registered', sortKey: 'registrationDate', value: (c) => c.registrationDate, text: (c) => formatDate(c.registrationDate), className: 'hidden whitespace-nowrap lg:table-cell' },
    { id: 'outstanding', header: 'Outstanding', type: 'money', value: (c) => c.outstanding ?? '0',
      cell: (c) => <span className={cn(Number(c.outstanding) > 0 && 'font-medium text-red-700')}>{formatPKR(c.outstanding)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Search by name, customer code or mobile number."
        actions={can('customers', 'CREATE') && <Button onClick={openNew}><Plus /> Add customer</Button>}
      />
      <Card>
        <DataTable
          title="Customers"
          module="customers"
          noun="customer"
          rows={customers.data?.data}
          columns={columns}
          getRowId={(c) => c.id}
          loading={customers.isLoading}
          error={customers.error}
          onRetry={() => customers.refetch()}
          pagination={{ page, pageSize, total: customers.data?.meta.total ?? 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
          sort={sort}
          onSortChange={(s) => { setSort(s); setPage(1); }}
          fetchAll={() => fetchAllPages((p, size) => api.get<Paginated<Customer>>('/customers', { ...filters, page: p, pageSize: size }))}
          onRowClick={(c) => navigate(`/customers/${c.id}`)}
          onView={(c) => navigate(`/customers/${c.id}`)}
          onEdit={can('customers', 'EDIT') ? (c) => { setCopyFrom(null); setEditing(c); setFormOpen(true); } : undefined}
          onDuplicate={can('customers', 'CREATE') ? (c) => { setEditing(null); setCopyFrom(c); setFormOpen(true); } : undefined}
          deleteRow={can('customers', 'DELETE') ? (c) => api.delete(`/customers/${c.id}`) : undefined}
          deleteWarning="Customers with orders, payments or ledger entries cannot be deleted; mark them Inactive instead."
          onChanged={refresh}
          importer={can('customers', 'CREATE') ? {
            fields: [
              { key: 'name', label: 'Name', required: true, example: 'Ali Raza' },
              { key: 'mobile', label: 'Mobile', required: true, example: '0300-1234567', aliases: ['phone'] },
              { key: 'whatsapp', label: 'WhatsApp', example: '0300-1234567' },
              { key: 'email', label: 'Email' },
              { key: 'city', label: 'City', example: 'Karachi' },
              { key: 'address', label: 'Address' },
              { key: 'customerType', label: 'Type', example: 'REGULAR', aliases: ['customer type'] },
              { key: 'openingBalance', label: 'Opening balance', example: '0' },
              { key: 'notes', label: 'Notes' },
            ],
            note: 'Type: Regular, Walk-in, VIP or Corporate. Rows with a mobile number that already exists are skipped.',
            createRow: (d) => {
              const t = (d.customerType || 'REGULAR').toUpperCase().replace(/[^A-Z]/g, '_').replace('WALK_IN', 'WALK_IN');
              return api.post('/customers', {
                name: d.name, mobile: d.mobile, whatsapp: d.whatsapp || undefined, email: d.email || undefined, city: d.city || undefined,
                address: d.address || undefined, notes: d.notes || undefined, openingBalance: d.openingBalance && Number(d.openingBalance) > 0 ? d.openingBalance : undefined,
                customerType: ['WALK_IN', 'REGULAR', 'VIP', 'CORPORATE'].includes(t) ? t : 'REGULAR',
              });
            },
          } : undefined}
          toolbar={
            <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
              <div className="relative col-span-2 w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Name, code or mobile" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search customers" />
              </div>
              <NativeSelect aria-label="Status" className="sm:w-36" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="BLOCKED">Blocked</option>
              </NativeSelect>
              <NativeSelect aria-label="Customer type" className="sm:w-36" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
                <option value="">All types</option><option value="REGULAR">Regular</option><option value="WALK_IN">Walk-in</option><option value="VIP">VIP</option><option value="CORPORATE">Corporate</option>
              </NativeSelect>
            </div>
          }
          empty={
            <EmptyState icon={<Users className="h-5 w-5" />} title={q || status || type ? 'No customers match your search' : 'No customers yet'}
              description={q ? 'Check the spelling or search by mobile number.' : 'Add your first customer to start taking measurements and orders.'}
              action={can('customers', 'CREATE') && !q ? <Button size="sm" onClick={openNew}><Plus /> Add customer</Button> : undefined} />
          }
          mobileCard={(c) => (
            <button type="button" onClick={() => navigate(`/customers/${c.id}`)} className="flex w-full items-center gap-3 px-1 py-3 text-left">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-sm font-semibold text-[#8a6a1f] dark:text-gold">{initials(c.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{c.name}</span>
                <span className="block text-xs text-muted-foreground">{c.code} · {formatPhone(c.mobile)}</span>
                <span className={cn('block text-xs tabular-nums', Number(c.outstanding) > 0 ? 'font-medium text-rose-700 dark:text-rose-400' : 'text-muted-foreground')}>Balance {formatPKR(c.outstanding)}</span>
              </span>
              <CustomerStatusBadge status={c.status} />
            </button>
          )}
        />
      </Card>
      <CustomerFormDialog open={formOpen} onOpenChange={setFormOpen} customer={editing} copyFrom={copyFrom}
        onSaved={(c) => { if (!editing) navigate(`/customers/${c.id}`); }} />
    </div>
  );
}
