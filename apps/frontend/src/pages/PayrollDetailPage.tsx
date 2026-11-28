import { PAYMENT_METHODS } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Banknote, CheckCircle2, Lock, Pencil, Printer, RefreshCw, RotateCcw, Trash2, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { DataTable } from '@/components/data-table/DataTable';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/features/dashboard/StatCard';
import { PayrollStatusBadge, SALARY_TYPE_LABEL, todayPK } from '@/features/hr/shared';
import { MONEY_RE } from '@/features/inventory/shared';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { PayrollDetail, PayrollLine, SalaryPaymentRow } from '@/types';
import { cn } from '@/utils/cn';
import { formatDate, formatDateTime, formatPKR } from '@/utils/format';
import { newId } from '@/utils/id';

const METHOD = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.key, m.label]));
const num = (v: string) => (Number(v) ? String(Number(v)) : '');
const deductions = (i: PayrollLine) => Number(i.absenceDeduction) + Number(i.advanceDeduction) + Number(i.otherDeductions);

function EditLineDialog({ payroll, line, onOpenChange }: { payroll: PayrollDetail; line: PayrollLine | null; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ incentives: '', bonus: '', otherDeductions: '', advanceDeduction: '', notes: '' });
  useEffect(() => { if (line) setF({ incentives: num(line.incentives), bonus: num(line.bonus), otherDeductions: num(line.otherDeductions), advanceDeduction: num(line.advanceDeduction), notes: line.notes ?? '' }); }, [line]);
  const bad = (['incentives', 'bonus', 'otherDeductions', 'advanceDeduction'] as const).find((k) => f[k].trim() && !MONEY_RE.test(f[k].trim()));
  const save = useMutation({
    mutationFn: () => api.patch<PayrollDetail>(`/payroll/${payroll.id}/items/${line!.id}`, {
      incentives: f.incentives.trim() || '0', bonus: f.bonus.trim() || '0', otherDeductions: f.otherDeductions.trim() || '0', advanceDeduction: f.advanceDeduction.trim() || '0', notes: f.notes,
    }),
    onSuccess: (p) => { qc.setQueryData(['payroll', 'detail', payroll.id], p); void qc.invalidateQueries({ queryKey: ['payroll', 'list'] }); toast.success('Salary line updated'); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={!!line} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle><Pencil className="h-5 w-5 text-primary" /> Adjust salary</DialogTitle>
          <DialogDescription>{line?.employee.name} · {payroll.periodLabel}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); if (!bad) save.mutate(); }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="ln-bonus">Bonus (Rs)</Label><Input id="ln-bonus" inputMode="decimal" placeholder="0" value={f.bonus} onChange={set('bonus')} /></div>
            <div className="space-y-1.5"><Label htmlFor="ln-inc">Incentive (Rs)</Label><Input id="ln-inc" inputMode="decimal" placeholder="0" value={f.incentives} onChange={set('incentives')} /></div>
            <div className="space-y-1.5"><Label htmlFor="ln-adv">Advance cut (Rs)</Label><Input id="ln-adv" inputMode="decimal" placeholder="0" value={f.advanceDeduction} onChange={set('advanceDeduction')} /></div>
            <div className="space-y-1.5"><Label htmlFor="ln-other">Other deduction (Rs)</Label><Input id="ln-other" inputMode="decimal" placeholder="0" value={f.otherDeductions} onChange={set('otherDeductions')} /></div>
          </div>
          <FieldError message={bad ? 'Enter amounts like 500 or 500.50' : undefined} />
          <div className="space-y-1.5"><Label htmlFor="ln-notes">Note on payslip</Label><Textarea id="ln-notes" rows={2} maxLength={500} placeholder="e.g. Eid bonus" value={f.notes} onChange={set('notes')} /></div>
          <p className="text-xs text-muted-foreground">Basic salary, absent days, piece wages and overtime come from records and cannot be typed here. Change the records and press Recalculate.</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({ payroll, line, all, onOpenChange }: { payroll: PayrollDetail; line: PayrollLine | null; all: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const open = all || !!line;
  const due = all ? payroll.totals.balance : line?.balance ?? '0';
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [date, setDate] = useState(todayPK());
  const [reference, setReference] = useState('');
  const [key, setKey] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setAmount(num(due)); setMethod('CASH'); setDate(todayPK()); setReference(''); setKey(newId()); setTouched(false); } }, [open, due]);
  const error = all ? undefined : !MONEY_RE.test(amount.trim()) || Number(amount) <= 0 ? 'Enter the amount' : Number(amount) > Number(due) ? `Only ${formatPKR(due)} is due` : undefined;
  const pay = useMutation({
    mutationFn: () => all
      ? api.post<PayrollDetail>(`/payroll/${payroll.id}/pay-all`, { method, paymentDate: date, idempotencyKey: key.slice(0, 36) })
      : api.post<PayrollDetail>(`/payroll/items/${line!.id}/payments`, { amount: amount.trim(), method, paymentDate: date, reference: reference.trim() || undefined, idempotencyKey: key }),
    onSuccess: (p) => {
      qc.setQueryData(['payroll', 'detail', payroll.id], p);
      void qc.invalidateQueries({ queryKey: ['payroll'] }); void qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success(all ? 'All salaries paid' : `Paid ${formatPKR(amount)} to ${line?.employee.name}`);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle><Banknote className="h-5 w-5 text-primary" /> {all ? 'Pay all salaries' : 'Pay salary'}</DialogTitle>
          <DialogDescription>{all ? `${payroll.items.filter((i) => Number(i.balance) > 0).length} employee(s) · ${payroll.periodLabel}` : `${line?.employee.name} · ${payroll.periodLabel}`} · due {formatPKR(due)}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!error) pay.mutate(); }}>
          <div className="grid grid-cols-2 gap-3">
            {!all && <div className="space-y-1.5"><Label htmlFor="sp-amount" required>Amount (Rs)</Label>
              <Input id="sp-amount" autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={touched && !!error} /><FieldError message={touched ? error : undefined} /></div>}
            <div className="space-y-1.5"><Label htmlFor="sp-method">Paid by</Label>
              <NativeSelect id="sp-method" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</NativeSelect></div>
            <div className="space-y-1.5"><Label htmlFor="sp-date">Date</Label><Input id="sp-date" type="date" max={todayPK()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          {!all && <div className="space-y-1.5"><Label htmlFor="sp-ref">Reference</Label><Input id="sp-ref" maxLength={100} placeholder="Cheque no. or transaction id" value={reference} onChange={(e) => setReference(e.target.value)} /></div>}
          {all && <p className="rounded-lg bg-gold-soft/60 p-2.5 text-sm">Pays the remaining salary of every employee in this payroll: <b>{formatPKR(due)}</b>.</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={pay.isPending}>{all ? 'Pay all' : 'Save payment'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentsTab({ id, title }: { id: string; title: string }) {
  const q = useQuery({ queryKey: ['payroll', 'payments', id], queryFn: () => api.get<SalaryPaymentRow[]>(`/payroll/${id}/payments`) });
  return (
    <DataTable title={`${title} - salary payments`} module="payroll" noun="payment" rows={q.data} getRowId={(p) => p.id}
      loading={q.isLoading} error={q.error} onRetry={() => q.refetch()}
      columns={[
        { id: 'date', header: 'Date', value: (p) => p.paymentDate, text: (p) => formatDate(p.paymentDate), className: 'whitespace-nowrap' },
        { id: 'payment', header: 'Payment', value: (p) => p.paymentNo, text: (p) => p.paymentNo, cell: (p) => <><span className="font-mono text-xs font-semibold">{p.paymentNo}</span>{p.reference && <span className="block text-xs text-muted-foreground">{p.reference}</span>}</> },
        { id: 'employee', header: 'Employee', value: (p) => p.employee.name },
        { id: 'method', header: 'Method', value: (p) => METHOD[p.method] ?? p.method },
        { id: 'amount', header: 'Amount', type: 'money', value: (p) => Number(p.amount), cell: (p) => <span className="font-semibold">{formatPKR(p.amount)}</span>, text: (p) => formatPKR(p.amount) },
      ]}
      footer={(rows) => ({ date: 'Total', amount: formatPKR(rows.reduce((t, p) => t + Number(p.amount), 0)) })}
      empty={<EmptyState icon={<Banknote />} title="No salary paid yet" />} />
  );
}

export function PayrollDetailPage() {
  const { id = '' } = useParams();
  const can = useCan();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState('salaries');
  const [editLine, setEditLine] = useState<PayrollLine | null>(null);
  const [payLine, setPayLine] = useState<PayrollLine | null>(null);
  const [payAll, setPayAll] = useState(false);
  const [confirm, setConfirm] = useState<'approve' | 'reopen' | 'delete' | null>(null);
  const q = useQuery({ queryKey: ['payroll', 'detail', id], queryFn: () => api.get<PayrollDetail>(`/payroll/${id}`) });
  const action = useMutation({
    mutationFn: (a: 'approve' | 'reopen' | 'delete' | 'recalculate') => (a === 'delete' ? api.delete(`/payroll/${id}`) : api.post<PayrollDetail>(`/payroll/${id}/${a}`)),
    onSuccess: (p, a) => {
      void qc.invalidateQueries({ queryKey: ['payroll'] }); void qc.invalidateQueries({ queryKey: ['employees'] }); void qc.invalidateQueries({ queryKey: ['attendance'] }); void qc.invalidateQueries({ queryKey: ['production'] });
      setConfirm(null);
      if (a === 'delete') { toast.success('Draft payroll deleted'); navigate('/payroll'); return; }
      qc.setQueryData(['payroll', 'detail', id], p);
      toast.success(a === 'approve' ? 'Payroll approved. The month is now locked.' : a === 'reopen' ? 'Payroll is a draft again' : 'Payroll recalculated');
    },
    onError: (e) => { toast.error(errorMessage(e)); setConfirm(null); },
  });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <LoadingState label="Loading payroll..." />;
  const p = q.data!;
  const draft = p.status === 'DRAFT';
  const canPay = !draft && can('payroll', 'CREATE') && Number(p.totals.balance) > 0;
  const t = p.items.reduce((a, i) => ({
    basic: a.basic + Number(i.basicAmount), pieces: a.pieces + Number(i.pieceAmount), ot: a.ot + Number(i.overtimeAmount), extra: a.extra + Number(i.bonus) + Number(i.incentives),
    absence: a.absence + Number(i.absenceDeduction), adv: a.adv + Number(i.advanceDeduction), other: a.other + Number(i.otherDeductions),
  }), { basic: 0, pieces: 0, ot: 0, extra: 0, absence: 0, adv: 0, other: 0 });

  return (
    <div className="space-y-4">
      <div>
        <Link to="/payroll" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Payroll</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">Payroll · {p.periodLabel} <PayrollStatusBadge status={p.status} /></h1>
            <p className="mt-1 text-sm text-muted-foreground"><span className="font-mono">{p.payrollNo}</span> · {formatDate(p.periodStart)} - {formatDate(p.periodEnd)}{p.approvedAt ? ` · approved by ${p.approvedBy ?? '-'} on ${formatDateTime(p.approvedAt)}` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {draft && can('payroll', 'EDIT') && <Button variant="outline" size="sm" loading={action.isPending && action.variables === 'recalculate'} onClick={() => action.mutate('recalculate')}><RefreshCw /> Recalculate</Button>}
            {draft && can('payroll', 'APPROVE') && <Button size="sm" onClick={() => setConfirm('approve')}><CheckCircle2 /> Approve</Button>}
            {canPay && <Button size="sm" onClick={() => setPayAll(true)}><Banknote /> Pay all</Button>}
            {!draft && can('payroll', 'PRINT') && <Button variant="gold" size="sm" asChild><a href={`/print/payroll/${p.id}`} target="_blank" rel="noreferrer"><Printer /> Print all payslips</a></Button>}
            {p.status === 'APPROVED' && can('payroll', 'APPROVE') && <Button variant="outline" size="sm" onClick={() => setConfirm('reopen')}><RotateCcw /> Reopen</Button>}
            {draft && can('payroll', 'DELETE') && <Button variant="ghost" size="sm" className="text-destructive" aria-label="Delete draft" onClick={() => setConfirm('delete')}><Trash2 /></Button>}
          </div>
        </div>
      </div>
      {draft ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">This is a draft. Check each salary, add bonus or deductions with the pencil, then press <b>Approve</b>. If you change attendance, work or overtime, press <b>Recalculate</b>.</p>
      ) : (
        <p className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-500/10 dark:text-blue-200"><Lock className="h-4 w-4 shrink-0" /> Approved: attendance, overtime and work for this month are locked. {p.status === 'APPROVED' ? 'Reopen to make changes (only before any payment).' : ''}</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard featured label="Net salary" value={formatPKR(p.totals.net)} icon={Wallet} hint={`${p.items.length} employee(s)`} />
        <StatCard label="Gross" value={formatPKR(p.totals.gross)} icon={Wallet} tile="blue" hint={`Basic ${formatPKR(t.basic)} · pieces ${formatPKR(t.pieces)}`} />
        <StatCard label="Deductions" value={formatPKR(p.totals.deductions)} icon={Wallet} tile="rose" hint={`Absent ${formatPKR(t.absence)} · advance ${formatPKR(t.adv)}`} />
        <StatCard label="Still to pay" value={formatPKR(p.totals.balance)} icon={Banknote} tile="gold" tone={Number(p.totals.balance) > 0 && !draft ? 'negative' : undefined} hint={`Paid ${formatPKR(p.totals.paid)}`} />
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList><TabsTrigger value="salaries">Salaries</TabsTrigger><TabsTrigger value="payments">Payments</TabsTrigger></TabsList>
        <TabsContent value="salaries" className="mt-4">
          <Card>
            <DataTable title={`Payroll ${p.periodLabel}`} module="payroll" noun="salary line" rows={p.items} getRowId={(i) => i.id} defaultPageSize={50}
              onView={(i) => navigate(`/employees/${i.employee.id}`)}
              onEdit={draft && can('payroll', 'EDIT') ? (i) => setEditLine(i) : undefined}
              rowMenu={!draft && (can('payroll', 'CREATE') || can('payroll', 'PRINT')) ? (i) => <>
                {can('payroll', 'CREATE') && Number(i.balance) > 0 && <DropdownMenuItem onSelect={() => setPayLine(i)}><Banknote /> Pay salary</DropdownMenuItem>}
                {can('payroll', 'PRINT') && <DropdownMenuItem onSelect={() => window.open(`/print/payslips/${i.id}`, '_blank')}><Printer /> Print payslip</DropdownMenuItem>}
              </> : undefined}
              mobileCard={(i) => (
                <div className="space-y-1 py-3 pr-1">
                  <div className="flex items-start justify-between gap-2">
                    <div><span className="font-semibold">{i.employee.name}</span><span className="block text-xs text-muted-foreground">{i.employee.code} · {SALARY_TYPE_LABEL[i.salaryType]}</span></div>
                    <div className="text-right"><p className="font-bold tabular-nums">{formatPKR(i.netAmount)}</p>{!draft && <p className={cn('text-xs tabular-nums', Number(i.balance) > 0 ? 'text-rose-700' : 'text-emerald-700')}>{Number(i.balance) > 0 ? `${formatPKR(i.balance)} due` : 'Paid'}</p>}</div>
                  </div>
                  <p className="text-xs text-muted-foreground">Basic {formatPKR(i.basicAmount)}{Number(i.pieceAmount) ? ` · ${i.completedPieces} pcs ${formatPKR(i.pieceAmount)}` : ''}{Number(i.overtimeAmount) ? ` · OT ${formatPKR(i.overtimeAmount)}` : ''} · present {i.presentDays}, absent {i.absentDays}{deductions(i) ? ` · deductions -${formatPKR(deductions(i))}` : ''}</p>
                </div>
              )}
              columns={[
                { id: 'employee', header: 'Employee', value: (i) => i.employee.name, text: (i) => `${i.employee.name} (${i.employee.code})`,
                  cell: (i) => <><Link to={`/employees/${i.employee.id}`} onClick={(ev) => ev.stopPropagation()} className="font-medium hover:text-primary">{i.employee.name}</Link><span className="block text-xs text-muted-foreground">{i.employee.code} · {SALARY_TYPE_LABEL[i.salaryType]}</span>{i.notes && <span className="block text-xs italic text-muted-foreground">{i.notes}</span>}</> },
                { id: 'days', header: 'Days P / A', type: 'number', value: (i) => Number(i.presentDays), text: (i) => `${Number(i.presentDays)} / ${Number(i.absentDays)}`, className: 'whitespace-nowrap' },
                { id: 'basic', header: 'Basic', type: 'money', value: (i) => Number(i.basicAmount), cell: (i) => formatPKR(i.basicAmount) },
                { id: 'pieces', header: 'Pieces', type: 'money', value: (i) => Number(i.pieceAmount), text: (i) => (Number(i.pieceAmount) ? formatPKR(i.pieceAmount) : '-'), className: 'hidden lg:table-cell whitespace-nowrap',
                  cell: (i) => (Number(i.pieceAmount) ? <>{formatPKR(i.pieceAmount)}<span className="block text-xs text-muted-foreground">{i.completedPieces} pcs</span></> : '-') },
                { id: 'ot', header: 'Overtime', type: 'money', value: (i) => Number(i.overtimeAmount), text: (i) => (Number(i.overtimeAmount) ? formatPKR(i.overtimeAmount) : '-'), className: 'hidden lg:table-cell' },
                { id: 'bonus', header: 'Bonus', type: 'money', value: (i) => Number(i.bonus) + Number(i.incentives), text: (i) => (Number(i.bonus) + Number(i.incentives) ? formatPKR(Number(i.bonus) + Number(i.incentives)) : '-'), className: 'hidden xl:table-cell' },
                { id: 'deductions', header: 'Deductions', type: 'money', value: (i) => deductions(i), text: (i) => (deductions(i) ? `-${formatPKR(deductions(i))}` : '-'),
                  cell: (i) => <>
                    {deductions(i) ? <span className="font-medium text-rose-700 dark:text-rose-400">-{formatPKR(deductions(i))}</span> : '-'}
                    {Number(i.absenceDeduction) > 0 && <span className="block text-[11px] text-muted-foreground">Absent {formatPKR(i.absenceDeduction)}</span>}
                    {Number(i.advanceDeduction) > 0 && <span className="block text-[11px] text-muted-foreground">Advance {formatPKR(i.advanceDeduction)}</span>}
                    {Number(i.otherDeductions) > 0 && <span className="block text-[11px] text-muted-foreground">Other {formatPKR(i.otherDeductions)}</span>}
                  </> },
                { id: 'net', header: 'Net', type: 'money', value: (i) => Number(i.netAmount), cell: (i) => <span className="font-bold">{formatPKR(i.netAmount)}</span>, text: (i) => formatPKR(i.netAmount) },
                ...(!draft ? [{ id: 'due', header: 'Due', type: 'money' as const, value: (i: PayrollLine) => Number(i.balance), text: (i: PayrollLine) => (Number(i.balance) > 0 ? formatPKR(i.balance) : 'Paid'),
                  cell: (i: PayrollLine) => <span className={cn(Number(i.balance) > 0 ? 'font-semibold text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400')}>{Number(i.balance) > 0 ? formatPKR(i.balance) : 'Paid'}</span> }] : []),
              ]}
              footer={() => ({ employee: 'Total', basic: formatPKR(t.basic), pieces: formatPKR(t.pieces), ot: formatPKR(t.ot), bonus: formatPKR(t.extra), deductions: `-${formatPKR(t.absence + t.adv + t.other)}`, net: formatPKR(p.totals.net), due: formatPKR(p.totals.balance) })} />
          </Card>
        </TabsContent>
        <TabsContent value="payments" className="mt-4"><Card><PaymentsTab id={p.id} title={`Payroll ${p.periodLabel}`} /></Card></TabsContent>
      </Tabs>
      <EditLineDialog payroll={p} line={editLine} onOpenChange={(o) => !o && setEditLine(null)} />
      <PayDialog payroll={p} line={payLine} all={payAll} onOpenChange={(o) => { if (!o) { setPayLine(null); setPayAll(false); } }} />
      <ConfirmDialog open={confirm === 'approve'} onOpenChange={(o) => !o && setConfirm(null)} title={`Approve payroll for ${p.periodLabel}?`} confirmLabel="Approve" loading={action.isPending}
        description={`Net salary ${formatPKR(p.totals.net)} for ${p.items.length} employee(s). Attendance, overtime and work of this month will be locked and advances will be recovered.`} onConfirm={() => action.mutate('approve')} />
      <ConfirmDialog open={confirm === 'reopen'} onOpenChange={(o) => !o && setConfirm(null)} title="Reopen payroll?" confirmLabel="Reopen" loading={action.isPending}
        description="The payroll goes back to draft and the month is unlocked. Advance recoveries are undone." onConfirm={() => action.mutate('reopen')} />
      <ConfirmDialog open={confirm === 'delete'} onOpenChange={(o) => !o && setConfirm(null)} destructive title="Delete draft payroll?" confirmLabel="Delete" loading={action.isPending}
        description="Nothing is lost: you can run the payroll for this month again." onConfirm={() => action.mutate('delete')} />
    </div>
  );
}
