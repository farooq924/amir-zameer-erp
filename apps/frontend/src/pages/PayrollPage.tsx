import { PAYMENT_METHODS, monthLabel } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, HandCoins, Plus, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/features/dashboard/StatCard';
import { AdvanceStatusBadge, PayrollStatusBadge, shiftMonth, thisMonthPK } from '@/features/hr/shared';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { Advance, PayrollDetail, PayrollRun } from '@/types';
import { formatDate, formatPKR } from '@/utils/format';

const METHOD = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.key, m.label]));

function RunPayrollDialog({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (o: boolean) => void; existing: string[] }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const suggest = () => { let m = thisMonthPK(); const prev = shiftMonth(m, -1); if (!existing.includes(prev)) m = prev; return m; };
  const [month, setMonth] = useState(suggest);
  const [notes, setNotes] = useState('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setMonth(suggest()); setNotes(''); } }, [open]);
  const run = useMutation({
    mutationFn: () => api.post<PayrollDetail>('/payroll', { periodKey: month, notes: notes.trim() || undefined }),
    onSuccess: (p) => { toast.success(`Payroll for ${p.periodLabel} calculated`); void qc.invalidateQueries({ queryKey: ['payroll'] }); onOpenChange(false); navigate(`/payroll/${p.id}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const taken = existing.includes(month);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle><Calculator className="h-5 w-5 text-primary" /> Run payroll</DialogTitle>
          <DialogDescription>Calculates every employee's salary for the month from salary, attendance, production, overtime and advances.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!taken) run.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="pay-month" required>Month</Label>
            <Input id="pay-month" type="month" max={thisMonthPK()} value={month} onChange={(e) => setMonth(e.target.value)} />
            {taken && <p className="text-xs text-destructive">Payroll for {monthLabel(month)} already exists.</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="pay-notes">Notes</Label><Textarea id="pay-notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <ul className="space-y-1 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            <li>Mark attendance for the whole month first (absent days are deducted from monthly salary).</li>
            <li>Approve pending overtime, and record all completed pieces in Production.</li>
            <li>The payroll stays a draft: you can check, edit bonus / deductions and recalculate before approving.</li>
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={run.isPending} disabled={taken || !month}>Calculate payroll</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdvancesTab() {
  const [status, setStatus] = useState('OPEN');
  const q = useQuery({ queryKey: ['advances', status], queryFn: () => api.get<Advance[]>('/advances', { status }) });
  const total = (q.data ?? []).reduce((a, x) => a + Number(x.balanceAmount), 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <NativeSelect aria-label="Status" className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="OPEN">Open</option><option value="RECOVERED">Recovered</option><option value="WRITTEN_OFF">Written off</option><option value="ALL">All</option>
        </NativeSelect>
        <p className="text-sm text-muted-foreground">Give an advance from the employee's page.</p>
      </div>
      <Card>
        {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : !q.data!.length ? (
          <EmptyState icon={<HandCoins />} title="No advances" />
        ) : (
          <Table>
            <THead><TR><TH>Date</TH><TH>Advance</TH><TH>Employee</TH><TH className="text-right">Amount</TH><TH className="hidden sm:table-cell text-right">Per salary</TH><TH className="text-right">Balance</TH><TH>Status</TH></TR></THead>
            <TBody>
              {q.data!.map((a) => (
                <TR key={a.id}>
                  <TD className="whitespace-nowrap">{formatDate(a.advanceDate)}</TD>
                  <TD><span className="font-mono text-xs font-semibold">{a.advanceNo}</span><span className="block text-xs text-muted-foreground">{METHOD[a.paymentMethod]}{a.reason ? ` · ${a.reason}` : ''}</span></TD>
                  <TD>{a.employee && <Link to={`/employees/${a.employee.id}`} className="font-medium hover:text-primary">{a.employee.name}</Link>}</TD>
                  <TD className="text-right tabular-nums">{formatPKR(a.amount)}</TD>
                  <TD className="hidden text-right tabular-nums sm:table-cell">{Number(a.installmentAmount) ? formatPKR(a.installmentAmount) : 'Full'}</TD>
                  <TD className="text-right font-semibold tabular-nums">{formatPKR(a.balanceAmount)}</TD>
                  <TD><AdvanceStatusBadge status={a.status} /></TD>
                </TR>
              ))}
              <TR className="bg-muted/50 font-semibold"><TD colSpan={5}>Total balance</TD><TD className="text-right tabular-nums">{formatPKR(total)}</TD><TD /></TR>
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export function PayrollPage() {
  const can = useCan();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'runs';
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['payroll', 'list'], queryFn: () => api.get<PayrollRun[]>('/payroll') });
  const runs = q.data ?? [];
  const latest = runs[0];
  const unpaid = runs.reduce((a, r) => a + (r.status === 'DRAFT' ? 0 : Number(r.totalNet) - Number(r.totalPaid)), 0);
  return (
    <div>
      <PageHeader title="Payroll" description="Monthly salaries, payments, payslips and advances."
        actions={can('payroll', 'CREATE') && <Button onClick={() => setOpen(true)}><Plus /> Run payroll</Button>} />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard featured label={latest ? `Net salary · ${monthLabel(latest.periodKey)}` : 'Net salary'} value={formatPKR(latest?.totalNet)} icon={Wallet} loading={q.isLoading} hint={latest ? `${latest.employees} employee(s)` : 'No payroll yet'} />
        <StatCard label="Salary still to pay" value={formatPKR(unpaid)} icon={HandCoins} tile="rose" tone={unpaid > 0 ? 'negative' : undefined} loading={q.isLoading} hint="Approved payrolls" />
        <StatCard label="Payroll runs" value={String(runs.length)} icon={Calculator} tile="blue" loading={q.isLoading} />
      </div>
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'runs' ? {} : { tab: v }, { replace: true })}>
        <TabsList className="mb-4">
          <TabsTrigger value="runs">Monthly payroll</TabsTrigger>
          <TabsTrigger value="advances">Advances</TabsTrigger>
        </TabsList>
        <TabsContent value="runs">
          <Card>
            {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : !runs.length ? (
              <EmptyState icon={<Wallet />} title="No payroll yet" description="At the end of each month, run payroll to calculate every employee's salary."
                action={can('payroll', 'CREATE') ? <Button onClick={() => setOpen(true)}><Plus /> Run payroll</Button> : undefined} />
            ) : (
              <Table>
                <THead><TR><TH>Month</TH><TH className="hidden sm:table-cell">Payroll</TH><TH className="hidden md:table-cell text-right">Staff</TH><TH className="hidden md:table-cell text-right">Gross</TH><TH className="text-right">Net</TH><TH className="text-right">Paid</TH><TH>Status</TH></TR></THead>
                <TBody>
                  {runs.map((r) => (
                    <TR key={r.id} className="cursor-pointer" onClick={() => navigate(`/payroll/${r.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/payroll/${r.id}`)}>
                      <TD className="font-semibold">{monthLabel(r.periodKey)}</TD>
                      <TD className="hidden font-mono text-xs sm:table-cell">{r.payrollNo}</TD>
                      <TD className="hidden text-right tabular-nums md:table-cell">{r.employees}</TD>
                      <TD className="hidden text-right tabular-nums md:table-cell">{formatPKR(r.totalGross)}</TD>
                      <TD className="text-right font-semibold tabular-nums">{formatPKR(r.totalNet)}</TD>
                      <TD className="text-right tabular-nums">{formatPKR(r.totalPaid)}</TD>
                      <TD><PayrollStatusBadge status={r.status} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="advances"><AdvancesTab /></TabsContent>
      </Tabs>
      <RunPayrollDialog open={open} onOpenChange={setOpen} existing={runs.map((r) => r.periodKey)} />
    </div>
  );
}
