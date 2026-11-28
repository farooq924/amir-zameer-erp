import { PAYMENT_METHODS, formatPhone, monthLabel } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarCheck, HandCoins, History, Pencil, Phone, Printer, Scissors, Trash2, UserCheck, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/data-table/DataTable';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/features/dashboard/StatCard';
import { AdvanceDialog, EmployeeFormDialog, SalaryDialog, StatusDialog } from '@/features/hr/EmployeeDialogs';
import {
  AdvanceStatusBadge, ApprovalBadge, EMPLOYEE_STATUS_LABEL, EMPLOYEE_TYPE_LABEL, EMPLOYMENT_TYPE_LABEL, EmployeeStatusBadge, LEAVE_LABEL,
  PayrollStatusBadge, SALARY_TYPE_LABEL, TASK_LABEL, salaryText,
} from '@/features/hr/shared';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { EmployeeDetail } from '@/types';
import { formatDate, formatPKR, humanize, initials } from '@/utils/format';

const METHOD = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.key, m.label]));

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-0.5 text-sm font-medium">{children || '-'}</dd></div>;
}

const CHANGE_LABEL: Record<string, string> = { JOINED: 'Joined', STATUS: 'Status', DESIGNATION: 'Designation', EMPLOYEE_TYPE: 'Work type', EMPLOYMENT_TYPE: 'Employment' };
const historyValue = (type: string, v: string | null) => (!v ? '-' : type === 'STATUS' ? EMPLOYEE_STATUS_LABEL[v] ?? v : type === 'EMPLOYEE_TYPE' || type === 'JOINED' ? EMPLOYEE_TYPE_LABEL[v] ?? v : type === 'EMPLOYMENT_TYPE' ? EMPLOYMENT_TYPE_LABEL[v] ?? v : v);

export function EmployeeDetailPage() {
  const { id = '' } = useParams();
  const can = useCan();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('salary');
  const [editOpen, setEditOpen] = useState(false);
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [writeOff, setWriteOff] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['employees', 'detail', id], queryFn: () => api.get<EmployeeDetail>(`/employees/${id}`) });
  const remove = useMutation({
    mutationFn: () => api.delete(`/employees/${id}`),
    onSuccess: () => { toast.success('Employee removed'); void qc.invalidateQueries({ queryKey: ['employees'] }); navigate('/employees'); },
    onError: (e) => { toast.error(errorMessage(e)); setDeleteOpen(false); },
  });
  const doWriteOff = useMutation({
    mutationFn: (advanceId: string) => api.post(`/advances/${advanceId}/write-off`),
    onSuccess: () => { toast.success('Advance written off'); void qc.invalidateQueries({ queryKey: ['employees'] }); setWriteOff(null); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <LoadingState label="Loading employee..." />;
  const e = q.data!;
  const current = e.status === 'ACTIVE' || e.status === 'ON_LEAVE';
  const m = e.thisMonth;

  return (
    <div className="space-y-4">
      <div>
        <Link to="/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Employees</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-navy text-lg font-semibold text-gold">{initials(e.name)}</span>
            <div>
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">{e.name} <EmployeeStatusBadge status={e.status} /></h1>
              <p className="mt-0.5 text-sm text-muted-foreground"><span className="font-mono">{e.code}</span> · {e.designation || EMPLOYEE_TYPE_LABEL[e.employeeType]}{e.contactNumber ? ` · ${formatPhone(e.contactNumber)}` : ''}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {e.contactNumber && <Button variant="outline" size="sm" asChild><a href={`tel:+${e.contactNumber}`}><Phone /> Call</a></Button>}
            {can('payroll', 'CREATE') && current && <Button variant="gold" size="sm" onClick={() => setAdvanceOpen(true)}><HandCoins /> Give advance</Button>}
            {can('payroll', 'EDIT') && <Button size="sm" onClick={() => setSalaryOpen(true)}><Wallet /> Change salary</Button>}
            {can('employees', 'EDIT') && <Button variant="outline" size="sm" onClick={() => setStatusOpen(true)}><UserCheck /> Status</Button>}
            {can('employees', 'EDIT') && <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil /> Edit</Button>}
            {can('employees', 'DELETE') && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteOpen(true)} aria-label="Delete employee"><Trash2 /></Button>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard compact featured label="Salary" value={salaryText(e.salary)} icon={Wallet} hint={e.salary ? SALARY_TYPE_LABEL[e.salary.salaryType] : undefined} />
        <StatCard compact label={`This month (${monthLabel(m.periodKey)})`} value={`${m.present + m.halfDay / 2} present`} icon={CalendarCheck} tile="green" hint={`${m.absent} absent · ${m.halfDay} half · ${m.leave} leave`} />
        <StatCard compact label="Advance to recover" value={formatPKR(e.advanceBalance)} icon={HandCoins} tile="rose" tone={Number(e.advanceBalance) > 0 ? 'negative' : undefined} />
        <StatCard compact label="Unpaid work" value={formatPKR(e.unpaidProduction.amount)} icon={Scissors} tile="gold" hint={`${e.unpaidProduction.pieces} piece(s) not yet in payroll`} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="salary">Salary</TabsTrigger>
          <TabsTrigger value="advances">Advances</TabsTrigger>
          <TabsTrigger value="payslips">Payslips</TabsTrigger>
          <TabsTrigger value="work">Work</TabsTrigger>
          <TabsTrigger value="leave">Leave & overtime</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="salary" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Salary history</CardTitle></CardHeader>
            <DataTable title={`${e.name} - salary history`} module="employees" noun="salary record" rows={e.salaryHistory} getRowId={(r) => r.id}
              columns={[
                { id: 'from', header: 'From', value: (r) => r.effectiveFrom, text: (r) => formatDate(r.effectiveFrom), className: 'whitespace-nowrap' },
                { id: 'to', header: 'To', value: (r) => r.effectiveTo ?? '', text: (r) => (r.isCurrent ? 'Current' : formatDate(r.effectiveTo)), cell: (r) => (r.isCurrent ? <span className="font-semibold text-primary">Current</span> : formatDate(r.effectiveTo)), className: 'whitespace-nowrap' },
                { id: 'type', header: 'Type', value: (r) => SALARY_TYPE_LABEL[r.salaryType] },
                { id: 'salary', header: 'Salary', value: (r) => salaryText(r), cell: (r) => <span className="whitespace-nowrap font-medium">{salaryText(r)}</span> },
                { id: 'ot', header: 'Overtime / hour', type: 'money', value: (r) => Number(r.overtimeRatePerHour), text: (r) => (Number(r.overtimeRatePerHour) ? formatPKR(r.overtimeRatePerHour) : '-'), className: 'hidden sm:table-cell' },
                { id: 'reason', header: 'Reason', value: (r) => r.reason ?? '-', className: 'hidden md:table-cell text-sm text-muted-foreground' },
              ]}
              empty={<EmptyState icon={<Wallet />} title="No salary set" />} />
          </Card>
        </TabsContent>

        <TabsContent value="advances" className="mt-4">
          <Card>
            <DataTable title={`${e.name} - advances`} module="payroll" noun="advance" rows={e.advances} getRowId={(a) => a.id}
              rowMenu={can('payroll', 'APPROVE') ? (a) => (a.status === 'OPEN' ? <DropdownMenuItem onSelect={() => setWriteOff(a.id)}><Trash2 /> Write off</DropdownMenuItem> : null) : undefined}
              columns={[
                { id: 'date', header: 'Date', value: (a) => a.advanceDate, text: (a) => formatDate(a.advanceDate), className: 'whitespace-nowrap' },
                { id: 'advance', header: 'Advance', value: (a) => a.advanceNo, text: (a) => a.advanceNo, cell: (a) => <><span className="font-mono text-xs font-semibold">{a.advanceNo}</span><span className="block text-xs text-muted-foreground">{METHOD[a.paymentMethod]}{a.reason ? ` · ${a.reason}` : ''}</span></> },
                { id: 'amount', header: 'Amount', type: 'money', value: (a) => Number(a.amount), cell: (a) => formatPKR(a.amount) },
                { id: 'per', header: 'Per salary', type: 'money', value: (a) => Number(a.installmentAmount), text: (a) => (Number(a.installmentAmount) ? formatPKR(a.installmentAmount) : 'Full'), className: 'hidden sm:table-cell' },
                { id: 'recovered', header: 'Recovered', type: 'money', value: (a) => Number(a.recoveredAmount), cell: (a) => formatPKR(a.recoveredAmount) },
                { id: 'balance', header: 'Balance', type: 'money', value: (a) => Number(a.balanceAmount), cell: (a) => <span className="font-semibold">{formatPKR(a.balanceAmount)}</span>, text: (a) => formatPKR(a.balanceAmount) },
                { id: 'status', header: 'Status', value: (a) => humanize(a.status), cell: (a) => <AdvanceStatusBadge status={a.status} /> },
              ]}
              footer={(rows) => ({ date: 'Total', amount: formatPKR(rows.reduce((t, a) => t + Number(a.amount), 0)), recovered: formatPKR(rows.reduce((t, a) => t + Number(a.recoveredAmount), 0)), balance: formatPKR(rows.reduce((t, a) => t + Number(a.balanceAmount), 0)) })}
              empty={<EmptyState icon={<HandCoins />} title="No advances" description="Advances you give are cut from coming salaries automatically." />} />
          </Card>
        </TabsContent>

        <TabsContent value="payslips" className="mt-4">
          <Card>
            <DataTable title={`${e.name} - payslips`} module="payroll" noun="payslip" rows={e.payslips} getRowId={(p) => p.id}
              onRowClick={(p) => navigate(`/payroll/${p.payrollId}`)} onView={(p) => navigate(`/payroll/${p.payrollId}`)}
              rowMenu={can('payroll', 'PRINT') ? (p) => (p.payrollStatus !== 'DRAFT' ? <DropdownMenuItem onSelect={() => window.open(`/print/payslips/${p.id}`, '_blank')}><Printer /> Print payslip</DropdownMenuItem> : null) : undefined}
              columns={[
                { id: 'month', header: 'Month', value: (p) => p.periodKey, text: (p) => monthLabel(p.periodKey), cell: (p) => <span className="font-medium">{monthLabel(p.periodKey)}</span> },
                { id: 'payroll', header: 'Payroll', value: (p) => p.payrollNo, cell: (p) => <span className="font-mono text-xs">{p.payrollNo}</span> },
                { id: 'gross', header: 'Gross', type: 'money', value: (p) => Number(p.grossAmount), cell: (p) => formatPKR(p.grossAmount) },
                { id: 'net', header: 'Net', type: 'money', value: (p) => Number(p.netAmount), cell: (p) => <span className="font-semibold">{formatPKR(p.netAmount)}</span>, text: (p) => formatPKR(p.netAmount) },
                { id: 'paid', header: 'Paid', type: 'money', value: (p) => Number(p.paidAmount), cell: (p) => formatPKR(p.paidAmount), className: 'hidden sm:table-cell' },
                { id: 'status', header: 'Status', value: (p) => humanize(p.payrollStatus), cell: (p) => <PayrollStatusBadge status={p.payrollStatus} /> },
              ]}
              empty={<EmptyState icon={<Wallet />} title="No payslips yet" description="Payslips appear after you run payroll for a month." />} />
          </Card>
        </TabsContent>

        <TabsContent value="work" className="mt-4">
          <Card>
            <DataTable title={`${e.name} - work`} module="production" noun="work entry" rows={e.production} getRowId={(p) => p.id}
              onView={(p) => navigate(`/orders/${p.orderId}`)}
              columns={[
                { id: 'date', header: 'Date', value: (p) => p.workDate, text: (p) => formatDate(p.workDate), className: 'whitespace-nowrap' },
                { id: 'order', header: 'Order', value: (p) => p.orderNumber, text: (p) => `${p.orderNumber} - ${p.garmentName}`, cell: (p) => <><Link to={`/orders/${p.orderId}`} className="font-semibold text-primary hover:underline">{p.orderNumber}</Link><span className="block text-xs text-muted-foreground">{p.garmentName}</span></> },
                { id: 'work', header: 'Work', value: (p) => TASK_LABEL[p.taskType] },
                { id: 'pieces', header: 'Pieces', type: 'number', value: (p) => Number(p.quantity) },
                { id: 'rate', header: 'Rate', type: 'money', value: (p) => Number(p.pieceRate), cell: (p) => formatPKR(p.pieceRate), className: 'hidden sm:table-cell' },
                { id: 'amount', header: 'Amount', type: 'money', value: (p) => Number(p.amount), cell: (p) => <span className="font-medium">{formatPKR(p.amount)}</span>, text: (p) => formatPKR(p.amount) },
                { id: 'paid', header: 'Paid', value: (p) => (p.paid ? 'Paid' : 'Not yet'), cell: (p) => (p.paid ? <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Paid</span> : <span className="text-xs text-muted-foreground">Not yet</span>) },
              ]}
              footer={(rows) => ({ date: 'Total', pieces: rows.reduce((t, p) => t + Number(p.quantity), 0), amount: formatPKR(rows.reduce((t, p) => t + Number(p.amount), 0)) })}
              empty={<EmptyState icon={<Scissors />} title="No work recorded" description="Completed pieces recorded on the Production page appear here." />} />
          </Card>
        </TabsContent>

        <TabsContent value="leave" className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Leave</CardTitle></CardHeader>
            {!e.leaves.length ? <EmptyState title="No leave" /> : (
              <ul className="divide-y">
                {e.leaves.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span><span className="font-medium">{LEAVE_LABEL[l.leaveType]}</span><span className="block text-xs text-muted-foreground">{formatDate(l.fromDate)} - {formatDate(l.toDate)} · {l.days} day(s){l.reason ? ` · ${l.reason}` : ''}</span></span>
                    <ApprovalBadge status={l.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Overtime</CardTitle></CardHeader>
            {!e.overtime.length ? <EmptyState title="No overtime" /> : (
              <ul className="divide-y">
                {e.overtime.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span><span className="font-medium">{formatDate(o.date)} · {Number(o.hours)} h</span><span className="block text-xs text-muted-foreground">{formatPKR(o.amount)}{o.paid ? ' · paid' : ''}</span></span>
                    <ApprovalBadge status={o.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Employee details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Detail label="Father's name">{e.fatherName}</Detail>
                <Detail label="CNIC">{e.cnic}</Detail>
                <Detail label="Mobile">{e.contactNumber ? formatPhone(e.contactNumber) : null}</Detail>
                <Detail label="Work type">{EMPLOYEE_TYPE_LABEL[e.employeeType]}</Detail>
                <Detail label="Employment">{EMPLOYMENT_TYPE_LABEL[e.employmentType]}</Detail>
                <Detail label="Joining date">{formatDate(e.joiningDate)}</Detail>
                {e.leavingDate && <Detail label="Leaving date">{formatDate(e.leavingDate)}</Detail>}
                <Detail label="Address">{e.address}</Detail>
                <Detail label="Bank">{e.bankName}</Detail>
                <Detail label="Account title">{e.bankAccountTitle}</Detail>
                <Detail label="Account / IBAN">{e.bankAccountNumber}</Detail>
              </dl>
              {e.notes && <p className="mt-4 rounded-md bg-muted p-3 text-sm"><span className="font-medium">Notes: </span>{e.notes}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-primary" /> Job history</CardTitle></CardHeader>
            <ul className="divide-y">
              {e.history.map((h) => (
                <li key={h.id} className="px-4 py-2.5 text-sm">
                  <span className="font-medium">{CHANGE_LABEL[h.changeType] ?? humanize(h.changeType)}</span>
                  <span className="text-muted-foreground"> · {formatDate(h.effectiveDate)}</span>
                  <span className="block text-xs text-muted-foreground">{h.fromValue ? `${historyValue(h.changeType, h.fromValue)} → ` : ''}{historyValue(h.changeType, h.toValue)}{h.notes ? ` · ${h.notes}` : ''}</span>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>
      </Tabs>

      <EmployeeFormDialog open={editOpen} onOpenChange={setEditOpen} employee={e} />
      <SalaryDialog open={salaryOpen} onOpenChange={setSalaryOpen} employee={e} />
      <StatusDialog open={statusOpen} onOpenChange={setStatusOpen} employee={e} />
      <AdvanceDialog open={advanceOpen} onOpenChange={setAdvanceOpen} employee={e} />
      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} destructive title="Delete employee?" confirmLabel="Delete" loading={remove.isPending}
        description="Only employees with no attendance, advances, payroll or work can be deleted. Others can be marked as 'Left the job'." onConfirm={() => remove.mutate()} />
      <ConfirmDialog open={!!writeOff} onOpenChange={(o) => !o && setWriteOff(null)} destructive title="Write off advance?" confirmLabel="Write off" loading={doWriteOff.isPending}
        description="The balance will no longer be cut from salary. This cannot be undone." onConfirm={() => writeOff && doWriteOff.mutate(writeOff)} />
    </div>
  );
}
