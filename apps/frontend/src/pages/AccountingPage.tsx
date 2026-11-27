import { ACCOUNT_SUBTYPES, JOURNAL_SOURCES } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, BookOpen, CheckCircle2, Landmark, Lock, LockOpen, Pencil, Plus, Printer, RefreshCw, Scale, Search, Trash2,
  TrendingUp, Truck, Undo2, Users, Wallet,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/features/dashboard/StatCard';
import { DateRange, PeriodBadge, monthStartPK, todayPK } from '@/features/finance/shared';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { Paginated } from '@/types';
import type { Account, AccountingOverview, BalanceSheet, CashFlow, JournalDetail, JournalRow, Period, ProfitLoss, ReportGroup, TrialBalance } from '@/types/finance';
import { cn } from '@/utils/cn';
import { formatDate, formatDateTime, formatPKR } from '@/utils/format';
import { newId } from '@/utils/id';

const TYPE_LABEL: Record<string, string> = { ASSET: 'Assets', LIABILITY: 'Liabilities', EQUITY: 'Equity', INCOME: 'Income', EXPENSE: 'Expenses' };

function PrintButton() {
  return <Button variant="outline" className="no-print" onClick={() => window.print()}><Printer /> Print</Button>;
}

function ReportCard({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card className="print:border-0 print:shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div><CardTitle className="text-lg">{title}</CardTitle><p className="text-sm text-muted-foreground">{subtitle}</p></div>
        <div className="no-print flex flex-wrap items-end gap-2">{actions}<PrintButton /></div>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

function Line({ label, amount, bold, indent, negative, to }: { label: ReactNode; amount: string | number; bold?: boolean; indent?: boolean; negative?: boolean; to?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1.5 text-sm', bold && 'border-t font-semibold', indent && 'pl-4')}>
      <span>{to ? <Link to={to} className="hover:text-primary">{label}</Link> : label}</span>
      <span className={cn('tabular-nums', negative && Number(amount) < 0 && 'text-rose-700 dark:text-rose-400')}>{formatPKR(amount)}</span>
    </div>
  );
}

function Group({ title, g, minus }: { title: string; g: ReportGroup; minus?: boolean }) {
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {!g.rows.length ? <p className="py-1.5 pl-4 text-sm text-muted-foreground">None</p> : g.rows.map((r) => (
        <Line key={r.id} indent label={<><span className="mr-2 font-mono text-xs text-muted-foreground">{r.code}</span>{r.name}</>} amount={minus ? -Number(r.amount) : r.amount} negative to={`/accounting/accounts/${r.id}`} />
      ))}
      <Line bold label={`Total ${title.toLowerCase()}`} amount={minus ? -Number(g.total) : g.total} negative />
    </div>
  );
}

// ======================================================================= overview

function OverviewTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['accounting', 'overview'], queryFn: () => api.get<AccountingOverview>('/accounting/overview') });
  const sync = useMutation({
    mutationFn: () => api.post<{ posted: number; failedCount: number }>('/accounting/sync'),
    onSuccess: (r) => { toast.success(r.posted ? `${r.posted} document(s) posted` : 'The books are up to date'); void qc.invalidateQueries({ queryKey: ['accounting'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard featured label="Cash, bank & wallet" value={formatPKR(d?.totalCash)} icon={Wallet} loading={q.isLoading} hint="Balance today" />
        <StatCard label={`Profit · ${d?.monthLabel ?? 'this month'}`} value={formatPKR(d?.month.profit)} icon={TrendingUp} tile="green" tone={d && Number(d.month.profit) < 0 ? 'negative' : undefined} loading={q.isLoading}
          hint={d ? `Income ${formatPKR(d.month.income)} · Costs ${formatPKR(d.month.expenses)}` : undefined} />
        <StatCard label="Customers owe" value={formatPKR(d?.receivables)} icon={Users} tile="rose" loading={q.isLoading} hint="Receivables" />
        <StatCard label="We owe suppliers" value={formatPKR(d?.payables)} icon={Truck} tile="blue" loading={q.isLoading} hint="Payables" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Cash & bank accounts</CardTitle></CardHeader>
          <CardContent>
            {q.isLoading ? <LoadingState /> : d!.cash.map((c) => <Line key={c.id} label={<><span className="mr-2 font-mono text-xs text-muted-foreground">{c.code}</span>{c.name}</>} amount={c.balance} negative to={`/accounting/accounts/${c.id}`} />)}
            {d && <Line bold label="Fabric stock value (at cost)" amount={d.inventory} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Automatic posting</CardTitle>
            <Button size="sm" variant="outline" loading={sync.isPending} onClick={() => sync.mutate()}><RefreshCw /> Post now</Button>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">Every order, receipt, refund, purchase, supplier payment, stock movement, payroll, salary, advance and expense is posted to the books automatically as a balanced double entry (checked every minute).</p>
            {d?.sync && (d.sync.failedCount ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> {d.sync.failedCount} document(s) could not be posted</p>
                <ul className="mt-1 list-disc pl-5 text-xs">{d.sync.failed.map((f) => <li key={f.key}>{f.reason}</li>)}</ul>
              </div>
            ) : <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> All documents are posted · last check {formatDateTime(d.sync.at)}</p>)}
            <p className="text-muted-foreground">{d?.journalCount ?? 0} journal entries in the books.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ======================================================================= reports

function ProfitLossTab() {
  const [from, setFrom] = useState(monthStartPK());
  const [to, setTo] = useState(todayPK());
  const q = useQuery({ queryKey: ['accounting', 'pl', from, to], queryFn: () => api.get<ProfitLoss>('/accounting/reports/profit-loss', { from, to }), enabled: !!from && !!to });
  return (
    <ReportCard title="Profit & Loss" subtitle={q.data ? `${formatDate(q.data.from)} to ${formatDate(q.data.to)}` : ''} actions={<DateRange idPrefix="pl" from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />}>
      {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : (() => {
        const d = q.data!;
        return (
          <div className="mx-auto max-w-2xl">
            <Group title="Sales" g={d.sales} />
            <Group title="Cost of sales" g={d.costOfSales} />
            <Line bold label="Gross profit" amount={d.grossProfit} negative />
            <div className="h-3" />
            <Group title="Salaries & wages" g={d.salaries} />
            <Group title="Shop expenses" g={d.expenses} />
            {!!d.otherIncome.rows.length && <Group title="Other income" g={d.otherIncome} />}
            <div className={cn('mt-2 flex items-center justify-between rounded-lg px-4 py-3 text-base font-bold', Number(d.netProfit) >= 0 ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300')}>
              <span>{Number(d.netProfit) >= 0 ? 'Net profit' : 'Net loss'}{d.margin ? ` (${d.margin}% of sales)` : ''}</span><span className="tabular-nums">{formatPKR(d.netProfit)}</span>
            </div>
          </div>
        );
      })()}
    </ReportCard>
  );
}

function BalanceSheetTab() {
  const [asOf, setAsOf] = useState(todayPK());
  const q = useQuery({ queryKey: ['accounting', 'bs', asOf], queryFn: () => api.get<BalanceSheet>('/accounting/reports/balance-sheet', { asOf }), enabled: !!asOf });
  return (
    <ReportCard title="Balance Sheet" subtitle={q.data ? `As on ${formatDate(q.data.asOf)}` : ''}
      actions={<div className="space-y-1"><Label htmlFor="bs-date" className="text-xs">As on</Label><Input id="bs-date" type="date" className="w-40" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>}>
      {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : (() => {
        const d = q.data!;
        return (
          <div className="grid gap-6 lg:grid-cols-2">
            <div><Group title="Assets" g={d.assets} /></div>
            <div>
              <Group title="Liabilities" g={d.liabilities} />
              <Group title="Equity" g={{ rows: d.equity.rows, total: String(Number(d.equity.total) - Number(d.equity.profitToDate)) }} />
              <Line label="Profit to date (not yet moved to capital)" amount={d.equity.profitToDate} negative indent />
              <Line bold label="Total liabilities & equity" amount={d.totalLiabilitiesAndEquity} />
            </div>
            <p className={cn('flex items-center gap-2 text-sm lg:col-span-2', d.balanced ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive')}>
              {d.balanced ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {d.balanced ? 'Balanced: assets equal liabilities plus equity.' : 'Not balanced - please contact support.'}
            </p>
          </div>
        );
      })()}
    </ReportCard>
  );
}

function CashFlowTab() {
  const [from, setFrom] = useState(monthStartPK());
  const [to, setTo] = useState(todayPK());
  const q = useQuery({ queryKey: ['accounting', 'cf', from, to], queryFn: () => api.get<CashFlow>('/accounting/reports/cash-flow', { from, to }), enabled: !!from && !!to });
  return (
    <ReportCard title="Cash Flow" subtitle={q.data ? `${formatDate(q.data.from)} to ${formatDate(q.data.to)} · cash, bank and wallet` : ''} actions={<DateRange idPrefix="cf" from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />}>
      {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : (() => {
        const d = q.data!;
        return (
          <div className="mx-auto max-w-2xl">
            <Line bold label="Opening balance" amount={d.opening} negative />
            <p className="mt-3 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300"><ArrowDownLeft className="h-3.5 w-3.5" /> Money in</p>
            {!d.inflow.length ? <p className="py-1.5 pl-4 text-sm text-muted-foreground">None</p> : d.inflow.map((l) => <Line key={l.key} indent label={l.label} amount={l.amount} />)}
            <Line bold label="Total money in" amount={d.totalIn} />
            <p className="mt-3 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400"><ArrowUpRight className="h-3.5 w-3.5" /> Money out</p>
            {!d.outflow.length ? <p className="py-1.5 pl-4 text-sm text-muted-foreground">None</p> : d.outflow.map((l) => <Line key={l.key} indent label={l.label} amount={l.amount} />)}
            <Line bold label="Total money out" amount={d.totalOut} />
            <Line bold label="Net change" amount={d.net} negative />
            <div className="mt-2 flex items-center justify-between rounded-lg bg-navy px-4 py-3 font-bold text-white dark:bg-navy-soft"><span>Closing balance</span><span className="tabular-nums text-gold">{formatPKR(d.closing)}</span></div>
            <Table className="mt-4">
              <THead><TR><TH>Account</TH><TH className="text-right">Opening</TH><TH className="text-right">Closing</TH></TR></THead>
              <TBody>{d.accounts.map((a) => <TR key={a.id}><TD><Link to={`/accounting/accounts/${a.id}`} className="hover:text-primary">{a.name}</Link></TD><TD className="text-right tabular-nums">{formatPKR(a.opening)}</TD><TD className="text-right font-medium tabular-nums">{formatPKR(a.closing)}</TD></TR>)}</TBody>
            </Table>
          </div>
        );
      })()}
    </ReportCard>
  );
}

function TrialBalanceTab() {
  const [asOf, setAsOf] = useState(todayPK());
  const q = useQuery({ queryKey: ['accounting', 'tb', asOf], queryFn: () => api.get<TrialBalance>('/accounting/reports/trial-balance', { asOf }), enabled: !!asOf });
  return (
    <ReportCard title="Trial Balance" subtitle={q.data ? `As on ${formatDate(q.data.asOf)}` : ''}
      actions={<div className="space-y-1"><Label htmlFor="tb-date" className="text-xs">As on</Label><Input id="tb-date" type="date" className="w-40" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>}>
      {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : !q.data!.rows.length ? <EmptyState icon={<Scale />} title="No entries yet" /> : (
        <Table>
          <THead><TR><TH>Code</TH><TH>Account</TH><TH className="hidden sm:table-cell">Type</TH><TH className="text-right">Debit</TH><TH className="text-right">Credit</TH></TR></THead>
          <TBody>
            {q.data!.rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs">{r.code}</TD><TD><Link to={`/accounting/accounts/${r.id}`} className="hover:text-primary">{r.name}</Link></TD>
                <TD className="hidden sm:table-cell">{TYPE_LABEL[r.type]}</TD>
                <TD className="text-right tabular-nums">{Number(r.debit) ? formatPKR(r.debit) : '-'}</TD><TD className="text-right tabular-nums">{Number(r.credit) ? formatPKR(r.credit) : '-'}</TD>
              </TR>
            ))}
            <TR className="bg-muted/50 font-semibold"><TD colSpan={2}>Total {q.data!.totals.balanced ? <Badge variant="success" className="ml-2">Balanced</Badge> : <Badge variant="danger" className="ml-2">Not balanced</Badge>}</TD>
              <TD className="hidden sm:table-cell" /><TD className="text-right tabular-nums">{formatPKR(q.data!.totals.debit)}</TD><TD className="text-right tabular-nums">{formatPKR(q.data!.totals.credit)}</TD></TR>
          </TBody>
        </Table>
      )}
    </ReportCard>
  );
}

// ======================================================================= journal

export function JournalDialog({ id, onOpenChange }: { id: string | null; onOpenChange: (o: boolean) => void }) {
  const can = useCan();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['accounting', 'journal', id], queryFn: () => api.get<JournalDetail>(`/accounting/journals/${id}`), enabled: !!id });
  const [reason, setReason] = useState('');
  const [reversing, setReversing] = useState(false);
  useEffect(() => { setReason(''); setReversing(false); }, [id]);
  const reverse = useMutation({
    mutationFn: () => api.post<JournalDetail>(`/accounting/journals/${id}/reverse`, { reason: reason.trim() }),
    onSuccess: (j) => { toast.success(`${j.entryNo} reversed by ${j.reversedBy?.entryNo ?? ''}`); void qc.invalidateQueries({ queryKey: ['accounting'] }); setReversing(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const j = q.data;
  return (
    <Dialog open={!!id} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle><BookOpen className="h-5 w-5 text-primary" /> Journal entry {j?.entryNo ?? ''}</DialogTitle>
          <DialogDescription>{j ? `${formatDate(j.date)} · ${j.source}` : 'Loading...'}</DialogDescription>
        </DialogHeader>
        {q.isError ? <ErrorState message={errorMessage(q.error)} /> : !j ? <LoadingState /> : (
          <div className="space-y-3">
            <p className="text-sm">{j.description}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant={j.status === 'POSTED' ? 'success' : 'secondary'}>{j.status === 'POSTED' ? 'Posted' : 'Reversed'}</Badge>
              {j.reversalOf && <Badge variant="outline">Reverses {j.reversalOf.entryNo}</Badge>}
              {j.reversedBy && <Badge variant="outline">Reversed by {j.reversedBy.entryNo}</Badge>}
              {j.createdBy && <Badge variant="outline">By {j.createdBy.fullName}</Badge>}
            </div>
            <div className="max-h-80 overflow-auto rounded-lg border">
              <Table>
                <THead><TR><TH>Account</TH><TH className="text-right">Debit</TH><TH className="text-right">Credit</TH></TR></THead>
                <TBody>
                  {j.lines.map((l) => (
                    <TR key={l.id}>
                      <TD><span className="mr-2 font-mono text-xs text-muted-foreground">{l.account.code}</span>{l.account.name}
                        {(l.party || l.description) && <span className="block text-xs text-muted-foreground">{[l.party?.name, l.description].filter(Boolean).join(' · ')}</span>}</TD>
                      <TD className="text-right tabular-nums">{Number(l.debit) ? formatPKR(l.debit) : ''}</TD><TD className="text-right tabular-nums">{Number(l.credit) ? formatPKR(l.credit) : ''}</TD>
                    </TR>
                  ))}
                  <TR className="bg-muted/50 font-semibold"><TD>Total</TD><TD className="text-right tabular-nums">{formatPKR(j.totalDebit)}</TD><TD className="text-right tabular-nums">{formatPKR(j.totalCredit)}</TD></TR>
                </TBody>
              </Table>
            </div>
            {reversing && (
              <div className="space-y-1.5"><Label htmlFor="jr-reason" required>Why reverse?</Label><Textarea id="jr-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {j?.canReverse && can('accounting', 'APPROVE') && (reversing
            ? <Button variant="destructive" loading={reverse.isPending} disabled={reason.trim().length < 3} onClick={() => reverse.mutate()}><Undo2 /> Post reversal</Button>
            : <Button variant="outline" onClick={() => setReversing(true)}><Undo2 /> Reverse</Button>)}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DraftLine { key: string; accountId: string; debit: string; credit: string; description: string }
const blankLine = (): DraftLine => ({ key: newId(), accountId: '', debit: '', credit: '', description: '' });

function ManualJournalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ['accounting', 'accounts'], queryFn: () => api.get<Account[]>('/accounting/accounts'), enabled: open });
  const [date, setDate] = useState(todayPK());
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine(), blankLine()]);
  const [key, setKey] = useState(newId);
  useEffect(() => { if (open) { setDate(todayPK()); setDescription(''); setLines([blankLine(), blankLine()]); setKey(newId()); } }, [open]);
  const upd = (k: string, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const debit = lines.reduce((t, l) => t + (Number(l.debit) || 0), 0);
  const credit = lines.reduce((t, l) => t + (Number(l.credit) || 0), 0);
  const filled = lines.filter((l) => l.accountId && (Number(l.debit) > 0 || Number(l.credit) > 0));
  const balanced = Math.abs(debit - credit) < 0.005 && debit > 0;
  const save = useMutation({
    mutationFn: () => api.post<JournalDetail>('/accounting/journals', {
      entryDate: date, description: description.trim(), idempotencyKey: key,
      lines: filled.map((l) => ({ accountId: l.accountId, debit: l.debit || undefined, credit: l.credit || undefined, description: l.description.trim() || undefined })),
    }),
    onSuccess: (j) => { toast.success(`Journal ${j.entryNo} posted`); void qc.invalidateQueries({ queryKey: ['accounting'] }); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const active = (accounts.data ?? []).filter((a) => a.isActive);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle><BookOpen className="h-5 w-5 text-primary" /> New journal entry</DialogTitle>
          <DialogDescription>For entries that no other screen records: owner puts in or takes out money, cash deposited in the bank, loans, machine purchases, opening balances.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (balanced && filled.length >= 2) save.mutate(); }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
            <div className="space-y-1.5"><Label htmlFor="mj-date" required>Date</Label><Input id="mj-date" type="date" max={todayPK()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="mj-desc" required>Description</Label><Input id="mj-desc" maxLength={300} placeholder="e.g. Cash deposited in Meezan Bank" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={l.key} className="grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_7rem_7rem_2.25rem] sm:border-0 sm:p-0">
                <NativeSelect aria-label={`Account line ${i + 1}`} className="col-span-2 sm:col-span-1" value={l.accountId} onChange={(e) => upd(l.key, { accountId: e.target.value })}>
                  <option value="">Choose account...</option>
                  {(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as const).map((t) => (
                    <optgroup key={t} label={TYPE_LABEL[t]}>{active.filter((a) => a.type === t).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</optgroup>
                  ))}
                </NativeSelect>
                <Input aria-label={`Debit line ${i + 1}`} inputMode="decimal" placeholder="Debit" value={l.debit} onChange={(e) => upd(l.key, { debit: e.target.value.replace(/[^\d.]/g, ''), credit: e.target.value ? '' : l.credit })} />
                <Input aria-label={`Credit line ${i + 1}`} inputMode="decimal" placeholder="Credit" value={l.credit} onChange={(e) => upd(l.key, { credit: e.target.value.replace(/[^\d.]/g, ''), debit: e.target.value ? '' : l.debit })} />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 /></Button>
              </div>
            ))}
            <Button type="button" variant="gold" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus /> Add line</Button>
          </div>
          <div className={cn('flex flex-wrap items-center justify-between gap-2 rounded-lg p-3 text-sm', balanced ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-muted/60')}>
            <span>Debit <b className="tabular-nums">{formatPKR(debit)}</b> · Credit <b className="tabular-nums">{formatPKR(credit)}</b></span>
            <span>{balanced ? 'Balanced' : `Difference ${formatPKR(Math.abs(debit - credit))}`}</span>
          </div>
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            <li>Debit = money comes into an asset (cash, bank) or an expense goes up. Credit = the source (owner's capital, income, loan).</li>
            <li>Example: owner brings Rs 50,000 cash → Debit 1000 Cash in Hand, Credit 3000 Owner's Capital.</li>
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={!balanced || filled.length < 2 || description.trim().length < 3}>Post entry</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function JournalTab() {
  const can = useCan();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState(monthStartPK());
  const [to, setTo] = useState(todayPK());
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  useEffect(() => setPage(1), [search, source, from, to]);
  const q = useQuery({
    queryKey: ['accounting', 'journals', { search, source, from, to, page }],
    queryFn: () => api.get<Paginated<JournalRow>>('/accounting/journals', { search: search.trim() || undefined, sourceType: source || undefined, from: from || undefined, to: to || undefined, page, pageSize: 30 }),
  });
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search journal" className="pl-9" placeholder="Entry no. or description" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <NativeSelect aria-label="Source" className="w-48" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>{JOURNAL_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </NativeSelect>
        <DateRange idPrefix="jr" from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        {can('accounting', 'CREATE') && <Button onClick={() => setManual(true)}><Plus /> New entry</Button>}
      </Card>
      <Card>
        {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : !q.data!.data.length ? (
          <EmptyState icon={<BookOpen />} title="No journal entries" description="Entries appear here automatically as the shop works." />
        ) : (
          <>
            <Table>
              <THead><TR><TH>Date</TH><TH>Entry</TH><TH className="hidden md:table-cell">Source</TH><TH className="text-right">Amount</TH><TH className="hidden sm:table-cell">Status</TH></TR></THead>
              <TBody>
                {q.data!.data.map((j) => (
                  <TR key={j.id} className="cursor-pointer" tabIndex={0} onClick={() => setOpen(j.id)} onKeyDown={(e) => e.key === 'Enter' && setOpen(j.id)}>
                    <TD className="whitespace-nowrap">{formatDate(j.date)}</TD>
                    <TD><span className="font-mono text-xs font-semibold">{j.entryNo}</span><span className="block line-clamp-2 text-sm">{j.description}</span></TD>
                    <TD className="hidden md:table-cell">{j.source}</TD>
                    <TD className="text-right font-semibold tabular-nums">{formatPKR(j.amount)}</TD>
                    <TD className="hidden sm:table-cell">{j.status === 'REVERSED' ? <Badge variant="secondary">Reversed</Badge> : j.isReversal ? <Badge variant="info">Reversal</Badge> : <Badge variant="success">Posted</Badge>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
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
      <JournalDialog id={open} onOpenChange={(o) => !o && setOpen(null)} />
      <ManualJournalDialog open={manual} onOpenChange={setManual} />
    </div>
  );
}

// ======================================================================= chart of accounts

function AccountDialog({ open, onOpenChange, account }: { open: boolean; onOpenChange: (o: boolean) => void; account: Account | null }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ code: '', name: '', subType: 'OPERATING_EXPENSE', description: '' });
  useEffect(() => { if (open) setF(account ? { code: account.code, name: account.name, subType: account.subType ?? '', description: account.description ?? '' } : { code: '', name: '', subType: 'OPERATING_EXPENSE', description: '' }); }, [open, account]);
  const save = useMutation({
    mutationFn: () => (account
      ? api.patch(`/accounting/accounts/${account.id}`, { name: f.name.trim(), description: f.description.trim() })
      : api.post('/accounting/accounts', { code: f.code.trim(), name: f.name.trim(), subType: f.subType, description: f.description.trim() || undefined })),
    onSuccess: () => { toast.success('Account saved'); void qc.invalidateQueries({ queryKey: ['accounting'] }); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle><Landmark className="h-5 w-5 text-primary" /> {account ? `Edit ${account.code}` : 'Add account'}</DialogTitle>
          <DialogDescription>Codes: 1xxx assets, 2xxx liabilities, 3xxx equity, 4xxx income, 5xxx expenses.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <div className="space-y-1.5"><Label htmlFor="ac-code" required>Code</Label><Input id="ac-code" inputMode="numeric" maxLength={6} disabled={!!account} value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value.replace(/\D/g, '') }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="ac-name" required>Name</Label><Input id="ac-name" maxLength={120} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ac-group" required>Group</Label>
            <NativeSelect id="ac-group" disabled={!!account} value={f.subType} onChange={(e) => setF((x) => ({ ...x, subType: e.target.value }))}>
              {ACCOUNT_SUBTYPES.map((s) => <option key={s.key} value={s.key}>{TYPE_LABEL[s.type]} · {s.label}</option>)}
            </NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="ac-desc">Description</Label><Input id="ac-desc" maxLength={300} value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={f.name.trim().length < 2 || (!account && f.code.length < 3)}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccountsTab() {
  const can = useCan();
  const q = useQuery({ queryKey: ['accounting', 'accounts'], queryFn: () => api.get<Account[]>('/accounting/accounts') });
  const [edit, setEdit] = useState<Account | null | 'new'>(null);
  return (
    <div className="space-y-4">
      {can('accounting', 'MANAGE_SETTINGS') && <div className="flex justify-end"><Button variant="gold" onClick={() => setEdit('new')}><Plus /> Add account</Button></div>}
      {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : (
        <div className="grid gap-4 xl:grid-cols-2">
          {(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as const).map((t) => {
            const rows = q.data!.filter((a) => a.type === t);
            return (
              <Card key={t}>
                <CardHeader className="pb-2"><CardTitle className="text-base">{TYPE_LABEL[t]}</CardTitle></CardHeader>
                <Table>
                  <TBody>
                    {rows.map((a) => (
                      <TR key={a.id} className={!a.isActive ? 'opacity-50' : undefined}>
                        <TD className="w-16 font-mono text-xs">{a.code}</TD>
                        <TD><Link to={`/accounting/accounts/${a.id}`} className="font-medium hover:text-primary">{a.name}</Link>
                          <span className="block text-xs text-muted-foreground">{a.subTypeLabel}{a.isSystem ? ' · used by automatic posting' : ''}</span></TD>
                        <TD className={cn('text-right font-semibold tabular-nums', Number(a.balance) < 0 && 'text-rose-700 dark:text-rose-400')}>{formatPKR(a.balance)}</TD>
                        <TD className="w-12">{can('accounting', 'MANAGE_SETTINGS') && <Button size="icon" variant="ghost" aria-label={`Edit ${a.name}`} onClick={() => setEdit(a)}><Pencil /></Button>}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
            );
          })}
        </div>
      )}
      <AccountDialog open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} account={edit === 'new' ? null : edit} />
    </div>
  );
}

// ======================================================================= periods

function PeriodsTab() {
  const can = useCan();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['accounting', 'periods'], queryFn: () => api.get<Period[]>('/accounting/periods') });
  const [confirm, setConfirm] = useState<{ p: Period; action: 'close' | 'reopen' | 'lock' } | null>(null);
  const set = useMutation({
    mutationFn: (v: { month: string; action: string }) => api.post<Period[]>('/accounting/periods', v),
    onSuccess: (_r, v) => { toast.success(v.action === 'close' ? 'Month closed' : v.action === 'lock' ? 'Month locked' : 'Month reopened'); void qc.invalidateQueries({ queryKey: ['accounting'] }); setConfirm(null); },
    onError: (e) => { toast.error(errorMessage(e)); setConfirm(null); },
  });
  const text = confirm && {
    close: { title: `Close ${confirm.p.label}?`, description: 'Nobody can post anything dated in this month until it is reopened. New documents for that month will be posted on today\'s date.', label: 'Close month' },
    reopen: { title: `Reopen ${confirm.p.label}?`, description: 'Entries can be posted into this month again.', label: 'Reopen' },
    lock: { title: `Lock ${confirm.p.label} for ever?`, description: 'A locked month can never be reopened. Do this after the accounts are final (for example after tax filing).', label: 'Lock for ever' },
  }[confirm.action];
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Month closing</CardTitle>
        <p className="text-sm text-muted-foreground">Close a month after checking it, so nobody can change last month's figures by mistake.</p></CardHeader>
      {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : (
        <Table>
          <THead><TR><TH>Month</TH><TH className="text-right">Entries</TH><TH className="hidden sm:table-cell text-right">Amount</TH><TH>Status</TH><TH className="w-48"><span className="sr-only">Actions</span></TH></TR></THead>
          <TBody>
            {q.data!.map((p) => (
              <TR key={p.month}>
                <TD className="font-medium">{p.label}{p.closedBy && <span className="block text-xs text-muted-foreground">{p.status === 'OPEN' ? '' : `${p.closedBy} · ${formatDate(p.closedAt)}`}</span>}</TD>
                <TD className="text-right tabular-nums">{p.entries}</TD>
                <TD className="hidden text-right tabular-nums sm:table-cell">{formatPKR(p.amount)}</TD>
                <TD><PeriodBadge status={p.status} /></TD>
                <TD>
                  {can('accounting', 'APPROVE') && (
                    <div className="flex justify-end gap-1">
                      {p.status === 'OPEN' && <Button size="sm" variant="outline" onClick={() => setConfirm({ p, action: 'close' })}><Lock /> Close</Button>}
                      {p.status === 'CLOSED' && <Button size="sm" variant="outline" onClick={() => setConfirm({ p, action: 'reopen' })}><LockOpen /> Reopen</Button>}
                      {p.status === 'CLOSED' && <Button size="sm" variant="destructive" onClick={() => setConfirm({ p, action: 'lock' })}><Lock /> Lock</Button>}
                    </div>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} title={text?.title ?? ''} description={text?.description ?? ''} confirmLabel={text?.label}
        destructive={confirm?.action === 'lock'} loading={set.isPending} onConfirm={() => confirm && set.mutate({ month: confirm.p.month, action: confirm.action })} />
    </Card>
  );
}

const TABS = [
  { key: 'overview', label: 'Overview', el: <OverviewTab /> },
  { key: 'pl', label: 'Profit & Loss', el: <ProfitLossTab /> },
  { key: 'bs', label: 'Balance Sheet', el: <BalanceSheetTab /> },
  { key: 'cf', label: 'Cash Flow', el: <CashFlowTab /> },
  { key: 'tb', label: 'Trial Balance', el: <TrialBalanceTab /> },
  { key: 'journal', label: 'Journal', el: <JournalTab /> },
  { key: 'accounts', label: 'Chart of Accounts', el: <AccountsTab /> },
  { key: 'periods', label: 'Month Closing', el: <PeriodsTab /> },
];

export function AccountingPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'overview';
  return (
    <div>
      <PageHeader title="Accounting" description="Double-entry books kept automatically: profit & loss, balance sheet, cash flow and ledgers." />
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'overview' ? {} : { tab: v }, { replace: true })}>
        <div className="no-print -mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList className="w-max">{TABS.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}</TabsList>
        </div>
        {TABS.map((t) => <TabsContent key={t.key} value={t.key}>{t.el}</TabsContent>)}
      </Tabs>
    </div>
  );
}

