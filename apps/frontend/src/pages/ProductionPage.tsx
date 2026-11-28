import { TASK_TYPES } from '@az/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, Plus, Scissors, Search, Shirt } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, PageHeader } from '@/components/common';
import { type DataColumn, DataTable, fetchAllPages } from '@/components/data-table/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { StatCard } from '@/features/dashboard/StatCard';
import { EmployeeSelect, useEmployeeOptions } from '@/features/hr/AttendanceDialogs';
import { TASK_LABEL, thisMonthPK, todayPK } from '@/features/hr/shared';
import { MONEY_RE, useDebounced } from '@/features/inventory/shared';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { OrderItemLookup, Paginated, ProductionRow } from '@/types';
import { cn } from '@/utils/cn';
import { formatDate, formatPKR } from '@/utils/format';

function RecordWorkDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const employees = useEmployeeOptions(open, '/production/employees');
  const [employeeId, setEmployeeId] = useState('');
  const [search, setSearch] = useState('');
  const [itemId, setItemId] = useState('');
  const [taskType, setTaskType] = useState('STITCHING');
  const [quantity, setQuantity] = useState('1');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(todayPK());
  const [touched, setTouched] = useState(false);
  const q = useDebounced(search.trim());
  useEffect(() => { if (open) { setEmployeeId(''); setSearch(''); setItemId(''); setTaskType('STITCHING'); setQuantity('1'); setRate(''); setDate(todayPK()); setTouched(false); } }, [open]);
  const lookup = useQuery({ queryKey: ['production', 'lookup', q], queryFn: () => api.get<OrderItemLookup[]>('/production/order-items', { search: q }), enabled: open && q.length >= 2 });
  const item = lookup.data?.flatMap((o) => o.items.map((i) => ({ ...i, order: o }))).find((i) => i.id === itemId);
  const emp = employees.data?.find((e) => e.id === employeeId);
  const defaultRate = item && Number(item.pieceRate) > 0 ? Number(item.pieceRate) : Number(emp?.perPieceRate ?? 0);
  const left = item ? item.quantity - (item.done[taskType] ?? 0) : 0;
  const qty = Number(quantity);
  const effRate = rate.trim() ? Number(rate) : defaultRate;
  const errors = {
    employeeId: !employeeId ? 'Select the employee' : undefined,
    itemId: !itemId ? 'Search an order and pick the garment' : undefined,
    quantity: !/^\d+$/.test(quantity) || qty < 1 ? 'Enter pieces' : item && qty > left ? `Only ${left} piece(s) left for ${TASK_LABEL[taskType].toLowerCase()}` : undefined,
    rate: rate.trim() && !MONEY_RE.test(rate.trim()) ? 'Enter an amount' : undefined,
    date: !date || date > todayPK() ? 'Select a date (not in the future)' : undefined,
  };
  const save = useMutation({
    mutationFn: () => api.post('/production', { employeeId, orderItemId: itemId, taskType, quantity: qty, pieceRate: rate.trim() || undefined, workDate: date }),
    onSuccess: () => { toast.success(`${qty} piece(s) recorded for ${emp?.name}`); void qc.invalidateQueries({ queryKey: ['production'] }); void qc.invalidateQueries({ queryKey: ['employees'] }); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const err = (k: keyof typeof errors) => (touched ? errors[k] : undefined);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle><Scissors className="h-5 w-5 text-primary" /> Record completed work</DialogTitle>
          <DialogDescription>Pieces finished by an employee. Per-piece wages are paid in payroll.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!Object.values(errors).some(Boolean)) save.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="pr-emp" required>Employee</Label>
            <EmployeeSelect id="pr-emp" value={employeeId} onChange={setEmployeeId} invalid={!!err('employeeId')} options={employees.data ?? []} /><FieldError message={err('employeeId')} /></div>
          <div className="space-y-1.5"><Label htmlFor="pr-search" required>Order</Label>
            <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input id="pr-search" className="pl-8" placeholder="Order number or customer name" value={search} onChange={(e) => { setSearch(e.target.value); setItemId(''); }} /></div>
            {q.length >= 2 && (
              <div className="max-h-52 overflow-y-auto rounded-lg border">
                {lookup.isLoading ? <p className="p-3 text-sm text-muted-foreground">Searching...</p> : !lookup.data?.length ? <p className="p-3 text-sm text-muted-foreground">No open orders found</p> : lookup.data.map((o) => (
                  <div key={o.id} className="border-b last:border-0">
                    <p className="bg-muted/50 px-3 py-1.5 text-xs font-semibold">{o.orderNumber} · {o.customerName}</p>
                    {o.items.map((i) => (
                      <button key={i.id} type="button" onClick={() => setItemId(i.id)}
                        className={cn('flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent/50', itemId === i.id && 'bg-gold-soft/60')}>
                        <span className="flex items-center gap-2"><Shirt className="h-4 w-4 text-primary" />{i.garmentName} x {i.quantity}</span>
                        <span className="text-xs text-muted-foreground">{Object.entries(i.done).map(([t, n]) => `${TASK_LABEL[t]} ${n}`).join(' · ') || 'No work yet'}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <FieldError message={err('itemId')} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2 space-y-1.5"><Label htmlFor="pr-task">Work</Label>
              <NativeSelect id="pr-task" value={taskType} onChange={(e) => setTaskType(e.target.value)}>{TASK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</NativeSelect></div>
            <div className="space-y-1.5"><Label htmlFor="pr-qty" required>Pieces</Label><Input id="pr-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-invalid={!!err('quantity')} /></div>
            <div className="space-y-1.5"><Label htmlFor="pr-rate">Rs / piece</Label><Input id="pr-rate" inputMode="decimal" placeholder={defaultRate ? String(defaultRate) : '0'} value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={!!err('rate')} /></div>
          </div>
          <FieldError message={err('quantity') ?? err('rate')} />
          <div className="space-y-1.5"><Label htmlFor="pr-date" required>Date</Label><Input id="pr-date" type="date" max={todayPK()} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!err('date')} /><FieldError message={err('date')} /></div>
          {item && <p className="rounded-lg bg-gold-soft/60 p-2.5 text-sm">{item.order.orderNumber} · {item.garmentName}: <b>{qty > 0 ? qty : 0} x {formatPKR(effRate)} = {formatPKR((qty > 0 ? qty : 0) * effRate)}</b>{!effRate && <span className="block text-xs text-amber-800">No rate set: enter Rs / piece, or set the piece rate on the Garments page.</span>}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>Save work</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProductionPage() {
  const can = useCan();
  const qc = useQueryClient();
  const employees = useEmployeeOptions(true, '/production/employees');
  const [month, setMonth] = useState(thisMonthPK());
  const [employeeId, setEmployeeId] = useState('');
  const [paid, setPaid] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const navigate = useNavigate();
  const s = useDebounced(search);
  const listParams = { month, employeeId, paid, search: s };
  const list = useQuery({
    queryKey: ['production', 'list', { month, employeeId, paid, s, page, pageSize }],
    queryFn: () => api.get<Paginated<ProductionRow> & { totals: { pieces: number; amount: string } }>('/production', { ...listParams, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const columns: DataColumn<ProductionRow>[] = [
    { id: 'date', header: 'Date', value: (p) => p.workDate, text: (p) => formatDate(p.workDate), className: 'whitespace-nowrap' },
    { id: 'employee', header: 'Employee', value: (p) => p.employee.name, cell: (p) => <Link to={`/employees/${p.employee.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary">{p.employee.name}</Link> },
    { id: 'order', header: 'Order', value: (p) => p.orderNumber, text: (p) => `${p.orderNumber} - ${p.garmentName} (${p.customerName})`,
      cell: (p) => <><span className="font-semibold text-primary">{p.orderNumber}</span><span className="block text-xs text-muted-foreground">{p.garmentName} · {p.customerName}</span></> },
    { id: 'work', header: 'Work', value: (p) => TASK_LABEL[p.taskType], className: 'hidden sm:table-cell' },
    { id: 'quantity', header: 'Pieces', type: 'number', value: (p) => p.quantity },
    { id: 'rate', header: 'Rate', type: 'money', value: (p) => p.pieceRate, cell: (p) => formatPKR(p.pieceRate), className: 'hidden md:table-cell' },
    { id: 'amount', header: 'Amount', type: 'money', value: (p) => p.amount, cell: (p) => <span className="font-medium">{formatPKR(p.amount)}</span> },
    { id: 'paid', header: 'Paid', value: (p) => (p.paid ? 'Paid' : 'Not yet'), cell: (p) => (p.paid ? <Badge variant="success">Paid</Badge> : <Badge variant="outline">Not yet</Badge>), className: 'hidden sm:table-cell' },
  ];
  const reset = () => setPage(1);
  return (
    <div>
      <PageHeader title="Production" description="Completed pieces per employee, for per-piece wages."
        actions={can('production', 'CREATE') && <Button onClick={() => setOpen(true)}><Plus /> Record work</Button>} />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard featured label="Pieces completed" value={String(list.data?.totals.pieces ?? 0)} icon={Scissors} loading={list.isLoading} hint="For the filters below" />
        <StatCard label="Piece wages" value={formatPKR(list.data?.totals.amount)} icon={Coins} tile="gold" loading={list.isLoading} />
      </div>
      <Card>
        <DataTable
          title="Production"
          module="production"
          noun="work record"
          rows={list.data?.data}
          columns={columns}
          getRowId={(p) => p.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          pagination={{ page, pageSize, total: list.data?.meta.total ?? 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
          fetchAll={() => fetchAllPages((pg, size) => api.get<Paginated<ProductionRow>>('/production', { ...listParams, page: pg, pageSize: size }))}
          onView={(p) => navigate(`/orders/${p.orderId}`)}
          deleteRow={can('production', 'DELETE') ? (p) => api.delete(`/production/${p.id}`) : undefined}
          canRow={(act, p) => act !== 'delete' || !p.paid}
          deleteWarning="Only work that is not yet paid in payroll can be removed."
          onChanged={() => { void qc.invalidateQueries({ queryKey: ['production'] }); void qc.invalidateQueries({ queryKey: ['employees'] }); }}
          footer={() => ({ employee: 'Total (all pages)', quantity: String(list.data?.totals.pieces ?? 0), amount: formatPKR(list.data?.totals.amount) })}
          toolbar={
            <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
          <Input type="month" aria-label="Month" className="sm:w-40" value={month} max={thisMonthPK()} onChange={(e) => { setMonth(e.target.value); reset(); }} />
          <div className="sm:w-56"><EmployeeSelect id="pr-filter-emp" value={employeeId} onChange={(v) => { setEmployeeId(v); reset(); }} options={employees.data ?? []} /></div>
          <NativeSelect aria-label="Paid" className="sm:w-36" value={paid} onChange={(e) => { setPaid(e.target.value); reset(); }}>
            <option value="ALL">Paid & unpaid</option><option value="UNPAID">Not yet paid</option><option value="PAID">Paid</option>
          </NativeSelect>
          <div className="relative col-span-2 sm:w-56"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Order no. or garment" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} aria-label="Search work" /></div>
            </div>
          }
          empty={<EmptyState icon={<Scissors />} title="No work recorded" description="Record the pieces each tailor finishes. Per-piece employees are paid from these records."
            action={can('production', 'CREATE') ? <Button onClick={() => setOpen(true)}><Plus /> Record work</Button> : undefined} />}
        />
      </Card>
      <RecordWorkDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
