import { PAYMENT_METHODS, RECURRENCE_FREQUENCIES } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CalendarClock, Check, Clock, Pencil, Plus, Printer, Receipt, Repeat, Search, Tags, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/features/dashboard/StatCard';
import { DateRange, ExpenseStatusBadge, FREQ_LABEL, METHOD_LABEL, monthStartPK, todayPK } from '@/features/finance/shared';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { Account, Expense, ExpenseCategory, ExpenseList, ExpenseSummary, RecurringExpense } from '@/types/finance';
import { formatDate, formatPKR } from '@/utils/format';
import { newId } from '@/utils/id';

const useCategories = () => useQuery({ queryKey: ['expenses', 'categories'], queryFn: () => api.get<ExpenseCategory[]>('/expenses/categories') });

function ExpenseDialog({ open, onOpenChange, expense }: { open: boolean; onOpenChange: (o: boolean) => void; expense?: Expense | null }) {
  const qc = useQueryClient();
  const can = useCan();
  const cats = useCategories();
  const [f, setF] = useState({ expenseDate: todayPK(), categoryId: '', description: '', amount: '', paymentMethod: 'CASH', paidTo: '', reference: '', notes: '' });
  const [key, setKey] = useState(newId);
  useEffect(() => {
    if (!open) return;
    setKey(newId());
    setF(expense
      ? { expenseDate: expense.expenseDate, categoryId: expense.category.id, description: expense.description, amount: String(Number(expense.amount)), paymentMethod: expense.paymentMethod, paidTo: expense.paidTo ?? '', reference: expense.reference ?? '', notes: expense.notes ?? '' }
      : { expenseDate: todayPK(), categoryId: '', description: '', amount: '', paymentMethod: 'CASH', paidTo: '', reference: '', notes: '' });
  }, [open, expense]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, paidTo: f.paidTo.trim() || undefined, reference: f.reference.trim() || undefined, notes: f.notes.trim() || undefined };
      return expense ? api.patch<Expense>(`/expenses/${expense.id}`, { ...body, version: expense.version }) : api.post<Expense>('/expenses', { ...body, idempotencyKey: key });
    },
    onSuccess: (x) => {
      toast.success(expense ? 'Expense updated' : x.status === 'APPROVED' ? `Expense ${x.expenseNo} saved and posted to the books` : `Expense ${x.expenseNo} sent for approval`);
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const active = (cats.data ?? []).filter((c) => c.isActive || c.id === f.categoryId);
  const valid = f.categoryId && f.description.trim().length >= 2 && Number(f.amount) > 0 && f.expenseDate;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle><Receipt className="h-5 w-5 text-primary" /> {expense ? `Edit ${expense.expenseNo}` : 'Add expense'}</DialogTitle>
          <DialogDescription>{can('expenses', 'APPROVE') ? 'Saved expenses are approved and posted to the books at once.' : 'Your expense will wait for approval by the owner or manager.'}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="ex-date" required>Date</Label><Input id="ex-date" type="date" max={todayPK()} value={f.expenseDate} onChange={set('expenseDate')} /></div>
            <div className="space-y-1.5"><Label htmlFor="ex-cat" required>Category</Label>
              <NativeSelect id="ex-cat" value={f.categoryId} onChange={set('categoryId')}><option value="">Choose...</option>{active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ex-desc" required>Description</Label><Input id="ex-desc" maxLength={300} placeholder="e.g. K-Electric bill for November" value={f.description} onChange={set('description')} /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="ex-amount" required>Amount (Rs)</Label><Input id="ex-amount" inputMode="decimal" value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value.replace(/[^\d.]/g, '') }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="ex-method" required>Paid by</Label>
              <NativeSelect id="ex-method" value={f.paymentMethod} onChange={set('paymentMethod')}>{PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</NativeSelect></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="ex-to">Paid to</Label><Input id="ex-to" maxLength={120} placeholder="e.g. K-Electric" value={f.paidTo} onChange={set('paidTo')} /></div>
            <div className="space-y-1.5"><Label htmlFor="ex-ref">Bill / reference no.</Label><Input id="ex-ref" maxLength={100} value={f.reference} onChange={set('reference')} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ex-notes">Notes</Label><Textarea id="ex-notes" rows={2} maxLength={1000} value={f.notes} onChange={set('notes')} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={!valid}>{expense ? 'Save changes' : 'Save expense'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialog({ title, description, action, destructive, onSubmit, open, onOpenChange, loading }: {
  title: string; description: string; action: string; destructive?: boolean; onSubmit: (reason: string) => void; open: boolean; onOpenChange: (o: boolean) => void; loading?: boolean;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{destructive ? <Ban className="h-5 w-5 text-destructive" /> : <X className="h-5 w-5 text-primary" />} {title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit(reason.trim()); }}>
          <div className="space-y-1.5"><Label htmlFor="reason" required>Reason</Label><Textarea id="reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Back</Button>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} loading={loading} disabled={reason.trim().length < 3}>{action}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExpensesTab({ onEdit }: { onEdit: (x: Expense) => void }) {
  const can = useCan();
  const qc = useQueryClient();
  const cats = useCategories();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState(monthStartPK());
  const [to, setTo] = useState(todayPK());
  const [page, setPage] = useState(1);
  const [reject, setReject] = useState<Expense | null>(null);
  const [cancel, setCancel] = useState<Expense | null>(null);
  useEffect(() => setPage(1), [search, status, categoryId, from, to]);
  const q = useQuery({
    queryKey: ['expenses', 'list', { search, status, categoryId, from, to, page }],
    queryFn: () => api.get<ExpenseList>('/expenses', { search: search.trim() || undefined, status, categoryId: categoryId || undefined, from: from || undefined, to: to || undefined, page, pageSize: 25 }),
  });
  const act = useMutation({
    mutationFn: ({ x, action, reason }: { x: Expense; action: 'approve' | 'reject' | 'cancel'; reason?: string }) => api.post<Expense>(`/expenses/${x.id}/${action}`, reason ? { reason } : {}),
    onSuccess: (x, v) => {
      toast.success(v.action === 'approve' ? `${x.expenseNo} approved and posted` : v.action === 'reject' ? `${x.expenseNo} rejected` : `${x.expenseNo} cancelled`);
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      setReject(null);
      setCancel(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search expenses" className="pl-9" placeholder="Expense no., description, paid to" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <NativeSelect aria-label="Status" className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ALL">All statuses</option><option value="PENDING_APPROVAL">Pending approval</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="CANCELLED">Cancelled</option>
        </NativeSelect>
        <NativeSelect aria-label="Category" className="w-48" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>{(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </NativeSelect>
        <DateRange idPrefix="ex" from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </Card>
      <Card>
        {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : !q.data!.data.length ? (
          <EmptyState icon={<Receipt />} title="No expenses" description="Shop rent, bills, tea, transport and other running costs recorded here go straight into Profit & Loss." />
        ) : (
          <>
            <Table>
              <THead><TR><TH>Date</TH><TH>Expense</TH><TH className="hidden md:table-cell">Category</TH><TH className="hidden sm:table-cell">Paid by</TH><TH className="text-right">Amount</TH><TH>Status</TH><TH className="w-32"><span className="sr-only">Actions</span></TH></TR></THead>
              <TBody>
                {q.data!.data.map((x) => (
                  <TR key={x.id} className={x.status === 'CANCELLED' || x.status === 'REJECTED' ? 'opacity-60' : undefined}>
                    <TD className="whitespace-nowrap">{formatDate(x.expenseDate)}</TD>
                    <TD><span className="font-mono text-xs font-semibold">{x.expenseNo}</span><span className="block font-medium">{x.description}</span>
                      <span className="block text-xs text-muted-foreground md:hidden">{x.category.name}</span>{x.paidTo && <span className="block text-xs text-muted-foreground">To {x.paidTo}</span>}</TD>
                    <TD className="hidden md:table-cell">{x.category.name}</TD>
                    <TD className="hidden sm:table-cell">{METHOD_LABEL[x.paymentMethod] ?? x.paymentMethod}</TD>
                    <TD className="text-right font-semibold tabular-nums">{formatPKR(x.amount)}</TD>
                    <TD><ExpenseStatusBadge status={x.status} /></TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        {x.status === 'PENDING_APPROVAL' && can('expenses', 'APPROVE') && <Button size="icon" variant="ghost" aria-label={`Approve ${x.expenseNo}`} onClick={() => act.mutate({ x, action: 'approve' })}><Check className="text-emerald-600" /></Button>}
                        {x.status === 'PENDING_APPROVAL' && can('expenses', 'APPROVE') && <Button size="icon" variant="ghost" aria-label={`Reject ${x.expenseNo}`} onClick={() => setReject(x)}><X className="text-rose-600" /></Button>}
                        {x.status === 'PENDING_APPROVAL' && can('expenses', 'EDIT') && <Button size="icon" variant="ghost" aria-label={`Edit ${x.expenseNo}`} onClick={() => onEdit(x)}><Pencil /></Button>}
                        {x.status === 'APPROVED' && can('expenses', 'APPROVE') && <Button size="icon" variant="ghost" aria-label={`Cancel ${x.expenseNo}`} onClick={() => setCancel(x)}><Ban /></Button>}
                        {can('expenses', 'PRINT') && <Button size="icon" variant="ghost" asChild aria-label={`Print ${x.expenseNo}`}><Link to={`/print/expenses/${x.id}`} target="_blank"><Printer /></Link></Button>}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="flex justify-end border-t bg-muted/50 px-4 py-3 text-sm font-semibold">Total (approved + pending) <span className="ml-2 tabular-nums">{formatPKR(q.data!.totalAmount)}</span></div>
            {q.data!.meta.totalPages > 1 && (
              <div className="flex items-center justify-end gap-2 border-t px-4 py-3 text-sm">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <span>Page {page} of {q.data!.meta.totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= q.data!.meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            )}
          </>
        )}
      </Card>
      <ReasonDialog open={!!reject} onOpenChange={(o) => !o && setReject(null)} title={`Reject ${reject?.expenseNo ?? ''}`} description="The expense will not be paid or posted." action="Reject"
        loading={act.isPending} onSubmit={(reason) => reject && act.mutate({ x: reject, action: 'reject', reason })} />
      <ReasonDialog open={!!cancel} onOpenChange={(o) => !o && setCancel(null)} destructive title={`Cancel ${cancel?.expenseNo ?? ''}`}
        description={`A reversal entry takes ${formatPKR(cancel?.amount)} back out of the books. Record it again if it was entered wrongly.`} action="Cancel expense"
        loading={act.isPending} onSubmit={(reason) => cancel && act.mutate({ x: cancel, action: 'cancel', reason })} />
    </div>
  );
}

function CategoryDialog({ open, onOpenChange, category }: { open: boolean; onOpenChange: (o: boolean) => void; category: ExpenseCategory | null }) {
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ['accounting', 'accounts'], queryFn: () => api.get<Account[]>('/accounting/accounts'), enabled: open, retry: false });
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState('');
  useEffect(() => { if (open) { setName(category?.name ?? ''); setAccountId(category?.account?.id ?? ''); } }, [open, category]);
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), accountId: accountId || undefined };
      return category ? api.patch(`/expenses/categories/${category.id}`, body) : api.post('/expenses/categories', body);
    },
    onSuccess: () => { toast.success('Category saved'); void qc.invalidateQueries({ queryKey: ['expenses'] }); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const expenseAccounts = (accounts.data ?? []).filter((a) => a.type === 'EXPENSE' && a.isActive);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle><Tags className="h-5 w-5 text-primary" /> {category ? 'Edit category' : 'Add category'}</DialogTitle>
          <DialogDescription>Each category posts to an expense account in the chart of accounts.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="cat-name" required>Name</Label><Input id="cat-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="cat-acc">Expense account</Label>
            <NativeSelect id="cat-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={!accounts.data}>
              <option value="">Miscellaneous Expenses (5390)</option>{expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </NativeSelect>
            {accounts.isError && <p className="text-xs text-muted-foreground">Only users with Accounting access can change the account.</p>}</div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={name.trim().length < 2}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoriesTab() {
  const can = useCan();
  const qc = useQueryClient();
  const q = useCategories();
  const [edit, setEdit] = useState<ExpenseCategory | null | 'new'>(null);
  const toggle = useMutation({
    mutationFn: (c: ExpenseCategory) => api.patch(`/expenses/categories/${c.id}`, { isActive: !c.isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['expenses', 'categories'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="space-y-4">
      {can('expenses', 'EDIT') && <div className="flex justify-end"><Button variant="gold" onClick={() => setEdit('new')}><Plus /> Add category</Button></div>}
      <Card>
        {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : (
          <Table>
            <THead><TR><TH>Category</TH><TH className="hidden sm:table-cell">Posts to account</TH><TH className="text-right">Expenses</TH><TH>Active</TH><TH className="w-12"><span className="sr-only">Edit</span></TH></TR></THead>
            <TBody>
              {q.data!.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">{c.name}<span className="block text-xs text-muted-foreground sm:hidden">{c.account ? `${c.account.code} ${c.account.name}` : '-'}</span></TD>
                  <TD className="hidden sm:table-cell">{c.account ? <span><span className="font-mono text-xs">{c.account.code}</span> {c.account.name}</span> : '-'}</TD>
                  <TD className="text-right tabular-nums">{c.expenses}</TD>
                  <TD><Switch checked={c.isActive} onCheckedChange={() => can('expenses', 'EDIT') && toggle.mutate(c)} aria-label={`${c.name} active`} /></TD>
                  <TD>{can('expenses', 'EDIT') && <Button size="icon" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => setEdit(c)}><Pencil /></Button>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <CategoryDialog open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} category={edit === 'new' ? null : edit} />
    </div>
  );
}

function RecurringDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item: RecurringExpense | null }) {
  const qc = useQueryClient();
  const cats = useCategories();
  const [f, setF] = useState({ categoryId: '', description: '', amount: '', paymentMethod: 'CASH', frequency: 'MONTHLY', nextRunDate: todayPK() });
  useEffect(() => {
    if (open) setF(item ? { categoryId: item.category.id, description: item.description, amount: String(Number(item.amount)), paymentMethod: item.paymentMethod, frequency: item.frequency, nextRunDate: item.nextRunDate }
      : { categoryId: '', description: '', amount: '', paymentMethod: 'CASH', frequency: 'MONTHLY', nextRunDate: todayPK() });
  }, [open, item]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: () => (item ? api.patch(`/expenses/recurring/${item.id}`, f) : api.post('/expenses/recurring', f)),
    onSuccess: () => { toast.success('Recurring expense saved'); void qc.invalidateQueries({ queryKey: ['expenses'] }); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const valid = f.categoryId && f.description.trim().length >= 2 && Number(f.amount) > 0 && f.nextRunDate;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle><Repeat className="h-5 w-5 text-primary" /> {item ? 'Edit recurring expense' : 'Add recurring expense'}</DialogTitle>
          <DialogDescription>For fixed costs like shop rent, internet or the guard's pay. Press "Create due expenses" when they fall due.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="rc-desc" required>Description</Label><Input id="rc-desc" maxLength={300} placeholder="e.g. Shop rent" value={f.description} onChange={set('description')} /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="rc-cat" required>Category</Label>
              <NativeSelect id="rc-cat" value={f.categoryId} onChange={set('categoryId')}><option value="">Choose...</option>{(cats.data ?? []).filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></div>
            <div className="space-y-1.5"><Label htmlFor="rc-amount" required>Amount (Rs)</Label><Input id="rc-amount" inputMode="decimal" value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value.replace(/[^\d.]/g, '') }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="rc-freq" required>Repeats</Label>
              <NativeSelect id="rc-freq" value={f.frequency} onChange={set('frequency')}>{RECURRENCE_FREQUENCIES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</NativeSelect></div>
            <div className="space-y-1.5"><Label htmlFor="rc-next" required>Next date</Label><Input id="rc-next" type="date" value={f.nextRunDate} onChange={set('nextRunDate')} /></div>
            <div className="space-y-1.5"><Label htmlFor="rc-method" required>Paid by</Label>
              <NativeSelect id="rc-method" value={f.paymentMethod} onChange={set('paymentMethod')}>{PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</NativeSelect></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={!valid}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecurringTab() {
  const can = useCan();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['expenses', 'recurring'], queryFn: () => api.get<RecurringExpense[]>('/expenses/recurring') });
  const [edit, setEdit] = useState<RecurringExpense | null | 'new'>(null);
  const generate = useMutation({
    mutationFn: () => api.post<{ created: number; approved: boolean }>('/expenses/recurring/generate'),
    onSuccess: (r) => {
      toast.success(r.created ? `${r.created} expense(s) created${r.approved ? ' and posted' : ' - waiting for approval'}` : 'Nothing is due');
      void qc.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggle = useMutation({
    mutationFn: (r: RecurringExpense) => api.patch(`/expenses/recurring/${r.id}`, { isActive: !r.isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['expenses', 'recurring'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const due = (q.data ?? []).filter((r) => r.isDue).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        {can('expenses', 'CREATE') && <Button variant="navy" loading={generate.isPending} disabled={!due} onClick={() => generate.mutate()}><CalendarClock /> Create due expenses{due ? ` (${due})` : ''}</Button>}
        {can('expenses', 'EDIT') && <Button variant="gold" onClick={() => setEdit('new')}><Plus /> Add recurring</Button>}
      </div>
      <Card>
        {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : !q.data!.length ? (
          <EmptyState icon={<Repeat />} title="No recurring expenses" description="Add rent, internet and other fixed monthly costs once; create them each month with one click." />
        ) : (
          <Table>
            <THead><TR><TH>Expense</TH><TH className="hidden sm:table-cell">Repeats</TH><TH>Next date</TH><TH className="text-right">Amount</TH><TH>Active</TH><TH className="w-12"><span className="sr-only">Edit</span></TH></TR></THead>
            <TBody>
              {q.data!.map((r) => (
                <TR key={r.id} className={!r.isActive ? 'opacity-60' : undefined}>
                  <TD><span className="font-medium">{r.description}</span><span className="block text-xs text-muted-foreground">{r.category.name} · {METHOD_LABEL[r.paymentMethod]} · {r.created} created</span></TD>
                  <TD className="hidden sm:table-cell">{FREQ_LABEL[r.frequency]}</TD>
                  <TD className="whitespace-nowrap">{formatDate(r.nextRunDate)} {r.isDue && <Badge variant="warning" className="ml-1">Due</Badge>}</TD>
                  <TD className="text-right font-semibold tabular-nums">{formatPKR(r.amount)}</TD>
                  <TD><Switch checked={r.isActive} onCheckedChange={() => can('expenses', 'EDIT') && toggle.mutate(r)} aria-label={`${r.description} active`} /></TD>
                  <TD>{can('expenses', 'EDIT') && <Button size="icon" variant="ghost" aria-label={`Edit ${r.description}`} onClick={() => setEdit(r)}><Pencil /></Button>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <RecurringDialog open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} item={edit === 'new' ? null : edit} />
    </div>
  );
}

export function ExpensesPage() {
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'expenses';
  const [dialog, setDialog] = useState<{ open: boolean; expense: Expense | null }>({ open: false, expense: null });
  const s = useQuery({ queryKey: ['expenses', 'summary'], queryFn: () => api.get<ExpenseSummary>('/expenses/summary') });
  const top = s.data?.byCategory[0];
  const maxTrend = Math.max(1, ...(s.data?.trend ?? []).map((t) => Number(t.amount)));
  return (
    <div>
      <PageHeader title="Expenses" description="Shop running costs with approval, categories and repeating bills."
        actions={can('expenses', 'CREATE') && <Button onClick={() => setDialog({ open: true, expense: null })}><Plus /> Add expense</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard featured label={`Expenses · ${s.data?.monthLabel ?? 'this month'}`} value={formatPKR(s.data?.total)} icon={Receipt} loading={s.isLoading} hint={`${s.data?.count ?? 0} approved`} />
        <StatCard label="Waiting for approval" value={String(s.data?.pendingCount ?? 0)} icon={Clock} tile="gold" loading={s.isLoading} hint={formatPKR(s.data?.pendingAmount)} />
        <StatCard label="Biggest category" value={top?.name ?? '-'} icon={Tags} tile="purple" loading={s.isLoading} hint={top ? formatPKR(top.amount) : 'No expenses yet'} />
        <StatCard label="Recurring due" value={String(s.data?.recurringDue ?? 0)} icon={Repeat} tile="blue" loading={s.isLoading} hint="Create them from the Recurring tab" />
      </div>
      {!!s.data?.byCategory.length && (
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">This month by category</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {s.data.byCategory.slice(0, 6).map((c) => (
                <div key={c.categoryId} className="text-sm">
                  <div className="flex justify-between"><span>{c.name}</span><span className="font-semibold tabular-nums">{formatPKR(c.amount)}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(Number(c.amount) / Math.max(1, Number(s.data!.total))) * 100}%` }} /></div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Last 6 months</CardTitle></CardHeader>
            <CardContent>
              <div className="flex h-36 items-end gap-2" role="img" aria-label="Expenses by month">
                {s.data.trend.map((t) => (
                  <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] tabular-nums text-muted-foreground">{Math.round(Number(t.amount) / 1000)}k</span>
                    <div className="w-full rounded-t-md bg-navy dark:bg-gold" style={{ height: `${(Number(t.amount) / maxTrend) * 100}px` }} title={`${t.label}: ${formatPKR(t.amount)}`} />
                    <span className="text-[10px] text-muted-foreground">{t.label.slice(0, 3)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'expenses' ? {} : { tab: v }, { replace: true })}>
        <TabsList className="mb-4">
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="recurring">Recurring{s.data?.recurringDue ? ` (${s.data.recurringDue})` : ''}</TabsTrigger>
        </TabsList>
        <TabsContent value="expenses"><ExpensesTab onEdit={(x) => setDialog({ open: true, expense: x })} /></TabsContent>
        <TabsContent value="categories"><CategoriesTab /></TabsContent>
        <TabsContent value="recurring"><RecurringTab /></TabsContent>
      </Tabs>
      <ExpenseDialog open={dialog.open} expense={dialog.expense} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} />
    </div>
  );
}
