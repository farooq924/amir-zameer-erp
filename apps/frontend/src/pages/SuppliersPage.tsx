import { formatPhone } from '@az/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Plus, Search, Truck, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState, PageHeader } from '@/components/common';
import { type DataColumn, DataTable, fetchAllPages } from '@/components/data-table/DataTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { StatCard } from '@/features/dashboard/StatCard';
import { SupplierFormDialog } from '@/features/inventory/SupplierDialogs';
import { SupplierStatusBadge, useDebounced } from '@/features/inventory/shared';
import { useCan } from '@/hooks/use-permission';
import { api } from '@/services/api';
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
  const [pageSize, setPageSize] = useState(25);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const qc = useQueryClient();
  const q = useDebounced(search);
  const summary = useQuery({ queryKey: ['suppliers', 'summary'], queryFn: () => api.get<{ activeSuppliers: number; totalPayable: string; suppliersOwed: number }>('/suppliers/summary') });
  const listParams = { search: q, status, payable: payable ? 'true' : undefined };
  const list = useQuery({
    queryKey: ['suppliers', 'list', { q, status, payable, page, pageSize }],
    queryFn: () => api.get<Paginated<Supplier>>('/suppliers', { ...listParams, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const reset = () => setPage(1);
  const filtered = !!(q || status !== 'ACTIVE' || payable);
  const s = summary.data;

  const columns: DataColumn<Supplier>[] = [
    { id: 'code', header: 'Code', value: (x) => x.code, cell: (x) => <span className="font-mono text-xs font-semibold">{x.code}</span> },
    { id: 'name', header: 'Supplier', value: (x) => x.name, cell: (x) => <span className="font-medium">{x.name}</span> },
    { id: 'phone', header: 'Phone', value: (x) => (x.contactNumber ? formatPhone(x.contactNumber) : ''), className: 'hidden md:table-cell whitespace-nowrap' },
    { id: 'city', header: 'City', value: (x) => x.city, className: 'hidden lg:table-cell' },
    { id: 'fabrics', header: 'Fabrics', type: 'number', value: (x) => x.fabrics ?? 0, className: 'hidden lg:table-cell' },
    { id: 'balance', header: 'You owe', type: 'money', value: (x) => x.balance, cell: (x) => <span className={cn('font-semibold', Number(x.balance) > 0 && 'text-rose-700 dark:text-rose-400')}>{formatPKR(x.balance)}</span> },
    { id: 'status', header: 'Status', value: (x) => x.status, cell: (x) => <SupplierStatusBadge status={x.status} /> },
  ];
  const open = (x: Supplier) => navigate(`/suppliers/${x.id}`);

  return (
    <div>
      <PageHeader title="Suppliers" description="Who you buy fabric from and how much you owe them."
        actions={can('suppliers', 'CREATE') && <Button onClick={() => { setEditing(null); setAddOpen(true); }}><Plus /> Add supplier</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard featured label="Total payable" value={formatPKR(s?.totalPayable)} icon={Banknote} loading={summary.isLoading} hint="Amount you owe suppliers" />
        <button type="button" className="text-left" onClick={() => { setPayable(true); reset(); }}>
          <StatCard label="Suppliers to pay" value={String(s?.suppliersOwed ?? 0)} icon={Truck} tile="rose" loading={summary.isLoading} className="h-full hover:border-primary" />
        </button>
        <StatCard label="Active suppliers" value={String(s?.activeSuppliers ?? 0)} icon={Users} tile="blue" loading={summary.isLoading} className="col-span-2 lg:col-span-1" />
      </div>
      <Card>
        <DataTable
          title="Suppliers"
          module="suppliers"
          noun="supplier"
          rows={list.data?.data}
          columns={columns}
          getRowId={(x) => x.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          pagination={{ page, pageSize, total: list.data?.meta.total ?? 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
          fetchAll={() => fetchAllPages((pg, size) => api.get<Paginated<Supplier>>('/suppliers', { ...listParams, page: pg, pageSize: size }))}
          onRowClick={open}
          onView={open}
          onEdit={can('suppliers', 'EDIT') ? (x) => { setEditing(x); setAddOpen(true); } : undefined}
          duplicateRow={can('suppliers', 'CREATE') ? (x) => api.post('/suppliers', { name: `${x.name} (Copy)`, contactNumber: x.contactNumber ?? '', whatsapp: x.whatsapp ?? '', city: x.city ?? '', address: x.address ?? '', notes: x.notes ?? '' }) : undefined}
          deleteRow={can('suppliers', 'DELETE') ? (x) => api.delete(`/suppliers/${x.id}`) : undefined}
          deleteWarning="Suppliers with purchases, payments or a ledger cannot be deleted; mark them Inactive instead."
          onChanged={() => qc.invalidateQueries({ queryKey: ['suppliers'] })}
          importer={can('suppliers', 'CREATE') ? {
            fields: [
              { key: 'name', label: 'Name', required: true, example: 'Gul Ahmed Textiles' },
              { key: 'contactNumber', label: 'Phone', example: '0300-1234567', aliases: ['mobile', 'contact number'] },
              { key: 'whatsapp', label: 'WhatsApp' },
              { key: 'city', label: 'City', example: 'Faisalabad' },
              { key: 'address', label: 'Address' },
              { key: 'openingBalance', label: 'Opening balance', example: '0' },
              { key: 'notes', label: 'Notes' },
            ],
            note: 'Opening balance = amount you already owe this supplier.',
            createRow: (d) => api.post('/suppliers', { ...d, openingBalance: d.openingBalance && Number(d.openingBalance) > 0 ? d.openingBalance : undefined }),
          } : undefined}
          toolbar={
            <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
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
          }
          empty={
            <EmptyState icon={<Truck />} title={filtered ? 'No suppliers match these filters' : 'No suppliers yet'}
            description={filtered ? 'Try another search or clear the filters.' : 'Add the suppliers you buy fabric from.'}
            action={!filtered && can('suppliers', 'CREATE') ? <Button onClick={() => { setEditing(null); setAddOpen(true); }}><Plus /> Add supplier</Button> : undefined} />
          }
          mobileCard={(x) => (
            <Link to={`/suppliers/${x.id}`} className="flex items-center gap-3 px-1 py-3">
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
          )}
        />
      </Card>
      <SupplierFormDialog open={addOpen} onOpenChange={setAddOpen} supplier={editing} onSaved={(x) => { if (!editing) navigate(`/suppliers/${x.id}`); }} />
    </div>
  );
}
