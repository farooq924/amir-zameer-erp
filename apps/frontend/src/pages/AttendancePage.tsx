import { ATTENDANCE_STATUSES, monthLabel } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CalendarClock, CalendarOff, Check, ChevronLeft, ChevronRight, Clock, Lock, Plus, Save, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { DataTable } from '@/components/data-table/DataTable';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/features/dashboard/StatCard';
import { LeaveDialog, OvertimeDialog } from '@/features/hr/AttendanceDialogs';
import { ATTENDANCE_STYLE, ApprovalBadge, EMPLOYEE_TYPE_LABEL, LEAVE_LABEL, SHORT_STYLE, shiftMonth, thisMonthPK, todayPK } from '@/features/hr/shared';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { DailyAttendance, LeaveRow, MonthlyAttendance, OvertimeRow } from '@/types';
import { cn } from '@/utils/cn';
import { formatDate, formatPKR } from '@/utils/format';

type Entry = { status: string; checkIn: string; checkOut: string; notes: string };
const shiftDay = (d: string, by: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + by); return x.toISOString().slice(0, 10); };

function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}><ChevronLeft /></Button>
      <Input type="month" aria-label="Month" className="w-40" value={month} max={thisMonthPK()} onChange={(e) => e.target.value && onChange(e.target.value)} />
      <Button variant="outline" size="icon" aria-label="Next month" disabled={month >= thisMonthPK()} onClick={() => onChange(shiftMonth(month, 1))}><ChevronRight /></Button>
    </div>
  );
}

function DailyTab() {
  const can = useCan();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayPK());
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [showTimes, setShowTimes] = useState(false);
  const q = useQuery({ queryKey: ['attendance', 'daily', date], queryFn: () => api.get<DailyAttendance>('/attendance/daily', { date }) });
  const original = useMemo(() => {
    const o: Record<string, Entry> = {};
    for (const r of q.data?.rows ?? []) o[r.employee.id] = { status: r.attendance?.status ?? '', checkIn: r.attendance?.checkIn ?? '', checkOut: r.attendance?.checkOut ?? '', notes: r.attendance?.notes ?? '' };
    return o;
  }, [q.data]);
  useEffect(() => { setEntries(original); }, [original]);
  const changed = Object.keys(entries).filter((id) => JSON.stringify(entries[id]) !== JSON.stringify(original[id]));
  const editable = can('attendance', 'EDIT') && !!q.data && !q.data.locked && !q.data.isFuture;
  const set = (id: string, patch: Partial<Entry>) => setEntries((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  const save = useMutation({
    mutationFn: () => api.put<DailyAttendance>('/attendance/daily', {
      date, entries: changed.map((id) => ({ employeeId: id, status: entries[id].status || 'NONE', checkIn: entries[id].checkIn || undefined, checkOut: entries[id].checkOut || undefined, notes: entries[id].notes || undefined })),
    }),
    onSuccess: (d) => { qc.setQueryData(['attendance', 'daily', date], d); void qc.invalidateQueries({ queryKey: ['attendance', 'monthly'] }); void qc.invalidateQueries({ queryKey: ['employees'] }); toast.success(`Attendance saved for ${formatDate(date)}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const markAll = (status: string) => setEntries((e) => Object.fromEntries(Object.entries(e).map(([id, v]) => [id, v.status ? v : { ...v, status }])));
  const t = q.data?.totals;
  const counts = Object.values(entries).reduce<Record<string, number>>((a, v) => { if (v.status) a[v.status] = (a[v.status] ?? 0) + 1; return a; }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}><ChevronLeft /></Button>
          <Input type="date" aria-label="Date" className="w-44" max={todayPK()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <Button variant="outline" size="icon" aria-label="Next day" disabled={date >= todayPK()} onClick={() => setDate(shiftDay(date, 1))}><ChevronRight /></Button>
          {date !== todayPK() && <Button variant="ghost" size="sm" onClick={() => setDate(todayPK())}>Today</Button>}
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowTimes((v) => !v)}><Clock /> {showTimes ? 'Hide times' : 'Show in / out times'}</Button>
            <Button variant="outline" size="sm" onClick={() => markAll('PRESENT')}><Check /> Mark rest present</Button>
            <Button variant="outline" size="sm" onClick={() => markAll('HOLIDAY')}>Mark rest holiday</Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard compact label="Present" value={String((counts.PRESENT ?? 0) + (counts.HALF_DAY ?? 0))} icon={CalendarCheck} tile="green" hint={counts.HALF_DAY ? `${counts.HALF_DAY} half day` : undefined} />
        <StatCard compact label="Absent" value={String(counts.ABSENT ?? 0)} icon={X} tile="rose" />
        <StatCard compact label="On leave / off" value={String((counts.LEAVE ?? 0) + (counts.HOLIDAY ?? 0))} icon={CalendarOff} tile="blue" />
        <StatCard compact label="Not marked" value={String((t?.employees ?? 0) - Object.values(entries).filter((v) => v.status).length)} icon={Clock} tile="slate" />
      </div>
      {q.data?.locked && <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"><Lock className="h-4 w-4" /> Payroll for this month is approved, so attendance is locked. Reopen the payroll to change it.</p>}
      <Card>
        {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : !q.data!.rows.length ? (
          <EmptyState icon={<CalendarCheck />} title="No employees on this date" description="Add employees first. Only people working on this date are listed." action={can('employees', 'CREATE') ? <Button asChild><Link to="/employees"><Plus /> Add employee</Link></Button> : undefined} />
        ) : (
          <ul className="divide-y">
            {q.data!.rows.map(({ employee: emp }) => {
              const v = entries[emp.id] ?? { status: '', checkIn: '', checkOut: '', notes: '' };
              return (
                <li key={emp.id} className={cn('flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-4', changed.includes(emp.id) && 'bg-gold-soft/30')}>
                  <div className="min-w-0 flex-1">
                    <Link to={`/employees/${emp.id}`} className="block truncate font-semibold hover:text-primary">{emp.name}</Link>
                    <span className="block truncate text-xs text-muted-foreground">{emp.code} · {emp.designation || EMPLOYEE_TYPE_LABEL[emp.employeeType]}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={`Attendance for ${emp.name}`}>
                    {ATTENDANCE_STATUSES.map((s) => (
                      <button key={s.key} type="button" role="radio" aria-checked={v.status === s.key} disabled={!editable} title={s.label}
                        onClick={() => set(emp.id, { status: v.status === s.key ? '' : s.key })}
                        className={cn('h-9 min-w-9 rounded-lg border px-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70', v.status === s.key ? ATTENDANCE_STYLE[s.key] : 'bg-card hover:border-primary')}>
                        <span className="sm:hidden">{s.short}</span><span className="hidden sm:inline">{s.label}</span>
                      </button>
                    ))}
                  </div>
                  {showTimes && editable && (
                    <div className="flex items-center gap-1.5">
                      <Input type="time" aria-label={`Check-in for ${emp.name}`} className="h-9 w-28" value={v.checkIn} onChange={(e) => set(emp.id, { checkIn: e.target.value })} />
                      <Input type="time" aria-label={`Check-out for ${emp.name}`} className="h-9 w-28" value={v.checkOut} onChange={(e) => set(emp.id, { checkOut: e.target.value })} />
                    </div>
                  )}
                  {!showTimes && (v.checkIn || v.checkOut) && <span className="text-xs text-muted-foreground">{v.checkIn || '--'} - {v.checkOut || '--'}</span>}
                  {v.notes && !showTimes && <span className="text-xs text-muted-foreground">{v.notes}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {editable && changed.length > 0 && (
        <div className="sticky bottom-20 z-10 flex items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-lg lg:bottom-4">
          <span className="text-sm">{changed.length} change(s) not saved</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEntries(original)}>Undo</Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}><Save /> Save attendance</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RegisterTab() {
  const [month, setMonth] = useState(thisMonthPK());
  const q = useQuery({ queryKey: ['attendance', 'monthly', month], queryFn: () => api.get<MonthlyAttendance>('/attendance/monthly', { month }) });
  const days = q.data ? Array.from({ length: q.data.days }, (_, i) => String(i + 1).padStart(2, '0')) : [];
  const dow = (d: string) => new Date(`${month}-${d}T00:00:00Z`).getUTCDay();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthSwitcher month={month} onChange={setMonth} />
        <div className="flex flex-wrap gap-1.5 text-xs">
          {ATTENDANCE_STATUSES.map((s) => <span key={s.key} className={cn('rounded px-1.5 py-0.5 font-semibold', SHORT_STYLE[s.short])}>{s.short} = {s.label}</span>)}
          <Button variant="outline" size="sm" className="no-print" onClick={() => window.print()}>Print</Button>
        </div>
      </div>
      <Card>
        {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingState /> : !q.data!.rows.length ? (
          <EmptyState icon={<CalendarCheck />} title="No employees in this month" />
        ) : (
          <div className="overflow-x-auto">
            <h2 className="print-only px-3 pt-3 text-lg font-bold">Attendance register · {monthLabel(month)}</h2>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="sticky left-0 z-10 min-w-40 bg-muted px-3 py-2 text-left font-semibold">Employee</th>
                  {days.map((d) => <th key={d} className={cn('w-7 px-0.5 py-2 text-center font-medium', dow(d) === 0 && 'text-rose-600')}>{Number(d)}</th>)}
                  <th className="px-2 py-2 text-center font-semibold text-emerald-700">P</th>
                  <th className="px-2 py-2 text-center font-semibold text-amber-700">H</th>
                  <th className="px-2 py-2 text-center font-semibold text-rose-700">A</th>
                  <th className="px-2 py-2 text-center font-semibold text-blue-700">L</th>
                </tr>
              </thead>
              <tbody>
                {q.data!.rows.map((r) => (
                  <tr key={r.employee.id} className="border-b last:border-0">
                    <td className="sticky left-0 z-10 bg-card px-3 py-1.5"><Link to={`/employees/${r.employee.id}`} className="font-medium hover:text-primary">{r.employee.name}</Link><span className="block text-[10px] text-muted-foreground">{r.employee.code}</span></td>
                    {days.map((d) => {
                      const date = `${month}-${d}`;
                      const out = date < r.joiningDate || (r.leavingDate && date > r.leavingDate);
                      const v = r.marks[d];
                      return <td key={d} className="px-0.5 py-1 text-center">{out ? <span className="text-muted-foreground/40">·</span> : v ? <span className={cn('inline-block w-6 rounded py-0.5 font-semibold', SHORT_STYLE[v])}>{v}</span> : <span className="text-muted-foreground/50">-</span>}</td>;
                    })}
                    <td className="px-2 text-center font-semibold tabular-nums">{r.totals.present}</td>
                    <td className="px-2 text-center tabular-nums">{r.totals.halfDay}</td>
                    <td className="px-2 text-center tabular-nums">{r.totals.absent}</td>
                    <td className="px-2 text-center tabular-nums">{r.totals.leave}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function LeaveTab() {
  const can = useCan();
  const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['attendance', 'leaves', status], queryFn: () => api.get<LeaveRow[]>('/attendance/leaves', { status }) });
  const decide = useMutation({
    mutationFn: ({ id, ok }: { id: string; ok: boolean }) => api.post(`/attendance/leaves/${id}/${ok ? 'approve' : 'reject'}`),
    onSuccess: (_, v) => { toast.success(v.ok ? 'Leave approved and marked in attendance' : 'Leave rejected'); void qc.invalidateQueries({ queryKey: ['attendance'] }); void qc.invalidateQueries({ queryKey: ['employees'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <NativeSelect aria-label="Status" className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="ALL">All</option>
        </NativeSelect>
        {can('attendance', 'CREATE') && <Button variant="gold" onClick={() => setOpen(true)}><Plus /> Add leave</Button>}
      </div>
      <Card>
        <DataTable title="Leave" module="attendance" noun="leave" rows={q.data} getRowId={(l) => l.id}
          loading={q.isLoading} error={q.error} onRetry={() => q.refetch()}
          rowMenu={can('attendance', 'APPROVE') ? (l) => (l.status === 'PENDING' ? <>
            <DropdownMenuItem onSelect={() => decide.mutate({ id: l.id, ok: true })}><Check /> Approve</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => decide.mutate({ id: l.id, ok: false })}><X /> Reject</DropdownMenuItem>
          </> : null) : undefined}
          columns={[
            { id: 'employee', header: 'Employee', value: (l) => l.employee.name, text: (l) => `${l.employee.name} (${l.employee.code})`,
              cell: (l) => <><Link to={`/employees/${l.employee.id}`} className="font-medium hover:text-primary">{l.employee.name}</Link><span className="block text-xs text-muted-foreground">{l.employee.code}</span></> },
            { id: 'leave', header: 'Leave', value: (l) => LEAVE_LABEL[l.leaveType], text: (l) => `${LEAVE_LABEL[l.leaveType]}${l.reason ? ` - ${l.reason}` : ''}`,
              cell: (l) => <>{LEAVE_LABEL[l.leaveType]}{l.reason && <span className="block text-xs text-muted-foreground">{l.reason}</span>}</> },
            { id: 'dates', header: 'Dates', value: (l) => l.fromDate, text: (l) => `${formatDate(l.fromDate)}${l.toDate !== l.fromDate ? ` - ${formatDate(l.toDate)}` : ''}`, className: 'whitespace-nowrap' },
            { id: 'days', header: 'Days', type: 'number', value: (l) => Number(l.days) },
            { id: 'status', header: 'Status', value: (l) => l.status, cell: (l) => <ApprovalBadge status={l.status} /> },
          ]}
          empty={<EmptyState icon={<CalendarOff />} title={status === 'PENDING' ? 'No leave waiting for approval' : 'No leave found'} />} />
      </Card>
      <LeaveDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function OvertimeTab() {
  const can = useCan();
  const qc = useQueryClient();
  const [month, setMonth] = useState(thisMonthPK());
  const [status, setStatus] = useState('ALL');
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['attendance', 'overtime', month, status], queryFn: () => api.get<OvertimeRow[]>('/attendance/overtime', { month, status }) });
  const decide = useMutation({
    mutationFn: ({ id, ok }: { id: string; ok: boolean }) => api.post(`/attendance/overtime/${id}/${ok ? 'approve' : 'reject'}`),
    onSuccess: (_, v) => { toast.success(v.ok ? 'Overtime approved' : 'Overtime rejected'); void qc.invalidateQueries({ queryKey: ['attendance'] }); void qc.invalidateQueries({ queryKey: ['employees'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const total = (q.data ?? []).filter((o) => o.status === 'APPROVED').reduce((a, o) => a + Number(o.amount), 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <MonthSwitcher month={month} onChange={setMonth} />
          <NativeSelect aria-label="Status" className="w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ALL">All</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option>
          </NativeSelect>
        </div>
        {can('attendance', 'CREATE') && <Button variant="gold" onClick={() => setOpen(true)}><Plus /> Add overtime</Button>}
      </div>
      <Card>
        <DataTable title={`Overtime ${monthLabel(month)}`} module="attendance" noun="overtime entry" rows={q.data} getRowId={(o) => o.id}
          loading={q.isLoading} error={q.error} onRetry={() => q.refetch()}
          rowMenu={can('attendance', 'APPROVE') ? (o) => (o.status === 'PENDING' ? <>
            <DropdownMenuItem onSelect={() => decide.mutate({ id: o.id, ok: true })}><Check /> Approve</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => decide.mutate({ id: o.id, ok: false })}><X /> Reject</DropdownMenuItem>
          </> : null) : undefined}
          columns={[
            { id: 'date', header: 'Date', value: (o) => o.date, text: (o) => formatDate(o.date), className: 'whitespace-nowrap' },
            { id: 'employee', header: 'Employee', value: (o) => o.employee?.name ?? '', cell: (o) => <><span className="font-medium">{o.employee?.name}</span>{o.notes && <span className="block text-xs text-muted-foreground">{o.notes}</span>}</> },
            { id: 'hours', header: 'Hours', type: 'number', value: (o) => Number(o.hours) },
            { id: 'rate', header: 'Rate', type: 'money', value: (o) => Number(o.ratePerHour), cell: (o) => formatPKR(o.ratePerHour), className: 'hidden sm:table-cell' },
            { id: 'amount', header: 'Amount', type: 'money', value: (o) => Number(o.amount), cell: (o) => <span className="font-medium">{formatPKR(o.amount)}</span>, text: (o) => formatPKR(o.amount) },
            { id: 'status', header: 'Status', value: (o) => `${o.status}${o.paid ? ' (paid)' : ''}`, cell: (o) => <><ApprovalBadge status={o.status} />{o.paid && <span className="ml-1 text-xs text-emerald-700">Paid</span>}</> },
          ]}
          footer={() => ({ date: 'Approved total', amount: formatPKR(total) })}
          empty={<EmptyState icon={<CalendarClock />} title="No overtime in this month" />} />
      </Card>
      <OvertimeDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

export function AttendancePage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'daily';
  return (
    <div>
      <PageHeader title="Attendance" description="Mark daily attendance, see the monthly register, and manage leave and overtime." />
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'daily' ? {} : { tab: v }, { replace: true })}>
        <TabsList className="mb-4">
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="register">Monthly register</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="overtime">Overtime</TabsTrigger>
        </TabsList>
        <TabsContent value="daily"><DailyTab /></TabsContent>
        <TabsContent value="register"><RegisterTab /></TabsContent>
        <TabsContent value="leave"><LeaveTab /></TabsContent>
        <TabsContent value="overtime"><OvertimeTab /></TabsContent>
      </Tabs>
    </div>
  );
}
