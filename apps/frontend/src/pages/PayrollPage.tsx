import { PAYMENT_METHODS, monthLabel } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, HandCoins, Plus, Printer, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, PageHeader } from '@/components/common';
import { DataTable } from '@/components/data-table/DataTable';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const navigate = useNavigate();
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
        <DataTable
          title="Employee advances"
          module="payroll"
          noun="advance"
          rows={q.data}
          getRowId={(a) => a.id}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => q.refetch()}
          onView={(a) => a.employee && navigate(`/employees/${a.employee.id}`)}
          columns={[
            { id: 'date', header: 'Date', value: (a) => a.advanceDate, text: (a) => formatDate(a.advanceDate), className: 'whitespace-nowrap' },
            { id: 'advance', header: 'Advance', value: (a) => a.advanceNo, text: (a) => `${a.advanceNo} - ${METHOD[a.paymentMethod]}${a.reason ? ` · ${a.reason}` : ''}`,
              cell: (a) => <><span className="font-mono text-xs font-semibold">{a.advanceNo}</span><span className="block text-xs text-muted-foreground">{METHOD[a.paymentMethod]}{a.reason ? ` · ${a.reason}` : ''}</span></> },
            { id: 'employee', header: 'Employee', value: (a) => a.employee?.name, cell: (a) => (a.employee ? <Link to={`/employees/${a.employee.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary">{a.employee.name}</Link> : '-') },
            { id: 'amount', header: 'Amount', type: 'money', value: (a) => a.amount, cell: (a) => formatPKR(a.amount) },
            { id: 'installment', header: 'Per salary', type: 'money', value: (a) => a.installmentAmount, cell: (a) => (Number(a.installmentAmount) ? formatPKR(a.installmentAmount) : 'Full'), className: 'hidden sm:table-cell' },
            { id: 'balance', header: 'Balance', type: 'money', value: (a) => a.balanceAmount, cell: (a) => <span className="font-semibold">{formatPKR(a.balanceAmount)}</span> },
            { id: 'status', header: 'Status', value: (a) => a.status, cell: (a) => <AdvanceStatusBadge status={a.status} /> },
          ]}
          footer={() => ({ advance: 'Total balance', balance: formatPKR(total) })}
          empty={<EmptyState icon={<HandCoins />} title="No advances" />}
        />
      </Card>
    </div>
  );
}

export function PayrollPage() {
  const can = useCan();
  const qc = useQueryClient();
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
            <DataTable
              title="Payroll"
              module="payroll"
              noun="payroll"
              rows={q.data}
              getRowId={(r) => r.id}
              loading={q.isLoading}
              error={q.error}
              onRetry={() => q.refetch()}
              onRowClick={(r) => navigate(`/payroll/${r.id}`)}
              onView={(r) => navigate(`/payroll/${r.id}`)}
              deleteRow={can('payroll', 'DELETE') ? (r) => api.delete(`/payroll/${r.id}`) : undefined}
              canRow={(act, r) => act !== 'delete' || r.status === 'DRAFT'}
              deleteWarning="Only draft payrolls can be deleted."
              onChanged={() => qc.invalidateQueries({ queryKey: ['payroll'] })}
              rowMenu={can('payroll', 'PRINT') ? (r) => <DropdownMenuItem onSelect={() => window.open(`/print/payroll/${r.id}`, '_blank')}><Printer /> Print payroll sheet</DropdownMenuItem> : undefined}
              columns={[
                { id: 'month', header: 'Month', value: (r) => r.periodKey, text: (r) => monthLabel(r.periodKey), cell: (r) => <span className="font-semibold">{monthLabel(r.periodKey)}</span> },
                { id: 'no', header: 'Payroll', value: (r) => r.payrollNo, className: 'hidden font-mono text-xs sm:table-cell' },
                { id: 'staff', header: 'Staff', type: 'number', value: (r) => r.employees, className: 'hidden md:table-cell' },
                { id: 'gross', header: 'Gross', type: 'money', value: (r) => r.totalGross, cell: (r) => formatPKR(r.totalGross), className: 'hidden md:table-cell' },
                { id: 'net', header: 'Net', type: 'money', value: (r) => r.totalNet, cell: (r) => <span className="font-semibold">{formatPKR(r.totalNet)}</span> },
                { id: 'paid', header: 'Paid', type: 'money', value: (r) => r.totalPaid, cell: (r) => formatPKR(r.totalPaid) },
                { id: 'status', header: 'Status', value: (r) => r.status, cell: (r) => <PayrollStatusBadge status={r.status} /> },
              ]}
              empty={<EmptyState icon={<Wallet />} title="No payroll yet" description="At the end of each month, run payroll to calculate every employee's salary."
                action={can('payroll', 'CREATE') ? <Button onClick={() => setOpen(true)}><Plus /> Run payroll</Button> : undefined} />}
            />
          </Card>
        </TabsContent>
        <TabsContent value="advances"><AdvancesTab /></TabsContent>
      </Tabs>
      <RunPayrollDialog open={open} onOpenChange={setOpen} existing={runs.map((r) => r.periodKey)} />
    </div>
  );
}
