import { EMPLOYEE_TYPES, formatPhone } from '@az/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarCheck, Eye, HandCoins, IdCard, Plus, Search, Users, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState, ErrorState, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { StatCard } from '@/features/dashboard/StatCard';
import { EmployeeFormDialog } from '@/features/hr/EmployeeDialogs';
import { AttendanceBadge, EMPLOYEE_TYPE_LABEL, EmployeeStatusBadge, salaryText } from '@/features/hr/shared';
import { useDebounced } from '@/features/inventory/shared';
import { useCan } from '@/hooks/use-permission';
import { api, errorMessage } from '@/services/api';
import type { Employee, EmployeeSummary, Paginated } from '@/types';
import { cn } from '@/utils/cn';
import { formatPKR, initials } from '@/utils/format';

export function EmployeesPage() {
  const can = useCan();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('CURRENT');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const q = useDebounced(search);
  const summary = useQuery({ queryKey: ['employees', 'summary'], queryFn: () => api.get<EmployeeSummary>('/employees/summary') });
  const list = useQuery({
    queryKey: ['employees', 'list', { q, status, type, page }],
    queryFn: () => api.get<Paginated<Employee>>('/employees', { search: q, status, type, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const reset = () => setPage(1);
  const filtered = !!(q || status !== 'CURRENT' || type);
  const s = summary.data;

  return (
    <div>
      <PageHeader title="Employees" description="Staff records, salaries and advances."
        actions={<>
          {can('attendance') && <Button variant="outline" asChild><Link to="/attendance"><CalendarCheck /> Mark attendance</Link></Button>}
          {can('employees', 'CREATE') && <Button onClick={() => setAddOpen(true)}><Plus /> Add employee</Button>}
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard featured label="Current staff" value={String((s?.active ?? 0) + (s?.onLeave ?? 0))} icon={Users} loading={summary.isLoading} hint={s?.onLeave ? `${s.onLeave} on leave` : 'Active employees'} />
        <StatCard label="Present today" value={s ? `${s.today.present} / ${s.active + s.onLeave}` : '0'} icon={CalendarCheck} tile="green" loading={summary.isLoading}
          hint={s ? (s.today.marked ? `${s.today.absent} absent · ${s.today.leave} on leave` : 'Not marked yet') : undefined} />
        <StatCard label="Monthly salaries" value={formatPKR(s?.monthlySalaries)} icon={Wallet} tile="blue" loading={summary.isLoading} hint="Fixed salaries per month" className="col-span-2 sm:col-span-1" />
        <StatCard label="Advances to recover" value={formatPKR(s?.openAdvances.balance)} icon={HandCoins} tile="rose" loading={summary.isLoading} hint={`${s?.openAdvances.count ?? 0} open advance(s)`} className="col-span-2 sm:col-span-1" />
      </div>
      <Card>
        <div className="grid grid-cols-2 items-center gap-2 border-b p-3 sm:flex sm:flex-wrap">
          <div className="relative col-span-2 w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Name, code, mobile or CNIC" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} aria-label="Search employees" />
          </div>
          <NativeSelect aria-label="Status" className="sm:w-40" value={status} onChange={(e) => { setStatus(e.target.value); reset(); }}>
            <option value="CURRENT">Current staff</option><option value="ACTIVE">Active</option><option value="ON_LEAVE">On leave</option>
            <option value="INACTIVE">Inactive</option><option value="TERMINATED">Left the job</option><option value="ALL">All</option>
          </NativeSelect>
          <NativeSelect aria-label="Work type" className="sm:w-44" value={type} onChange={(e) => { setType(e.target.value); reset(); }}>
            <option value="">All work types</option>{EMPLOYEE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </NativeSelect>
          {filtered && <Button variant="ghost" size="sm" className="col-span-2 justify-self-start" onClick={() => { setSearch(''); setStatus('CURRENT'); setType(''); reset(); }}>Clear filters</Button>}
        </div>
        {list.isError ? <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} /> : list.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !list.data!.data.length ? (
          <EmptyState icon={<IdCard />} title={filtered ? 'No employees match these filters' : 'No employees yet'}
            description={filtered ? 'Try another search or clear the filters.' : 'Add your tailors, cutters and staff to mark attendance and run payroll.'}
            action={!filtered && can('employees', 'CREATE') ? <Button onClick={() => setAddOpen(true)}><Plus /> Add employee</Button> : undefined} />
        ) : (
          <>
            <ul className="divide-y sm:hidden">
              {list.data!.data.map((x) => (
                <li key={x.id}>
                  <Link to={`/employees/${x.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-accent/50">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-gold">{initials(x.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{x.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{x.code} · {x.designation || EMPLOYEE_TYPE_LABEL[x.employeeType]}</span>
                      <span className="block truncate text-xs text-muted-foreground">{salaryText(x.salary)}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1"><EmployeeStatusBadge status={x.status} /><AttendanceBadge status={x.todayAttendance} /></span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden sm:block">
              <Table>
                <THead><TR><TH>Code</TH><TH>Employee</TH><TH className="hidden md:table-cell">Mobile</TH><TH>Salary</TH><TH className="hidden lg:table-cell text-right">Advance due</TH><TH className="hidden md:table-cell">Today</TH><TH>Status</TH><TH className="w-12"><span className="sr-only">Open</span></TH></TR></THead>
                <TBody>
                  {list.data!.data.map((x) => (
                    <TR key={x.id} className="cursor-pointer" onClick={() => navigate(`/employees/${x.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/employees/${x.id}`)}>
                      <TD className="font-mono text-xs font-semibold">{x.code}</TD>
                      <TD><span className="font-medium">{x.name}</span><span className="block text-xs text-muted-foreground">{x.designation || EMPLOYEE_TYPE_LABEL[x.employeeType]}</span></TD>
                      <TD className="hidden md:table-cell">{x.contactNumber ? formatPhone(x.contactNumber) : '-'}</TD>
                      <TD className="whitespace-nowrap text-sm">{salaryText(x.salary)}</TD>
                      <TD className={cn('hidden whitespace-nowrap text-right tabular-nums lg:table-cell', Number(x.advanceBalance) > 0 && 'font-semibold text-rose-700 dark:text-rose-400')}>{Number(x.advanceBalance) > 0 ? formatPKR(x.advanceBalance) : '-'}</TD>
                      <TD className="hidden md:table-cell"><AttendanceBadge status={x.todayAttendance} /></TD>
                      <TD><EmployeeStatusBadge status={x.status} /></TD>
                      <TD><Button variant="ghost" size="icon" aria-label={`Open ${x.name}`} asChild><Link to={`/employees/${x.id}`} onClick={(e) => e.stopPropagation()}><Eye /></Link></Button></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </>
        )}
        {list.data && list.data.meta.total > 0 && (
          <div className="flex items-center justify-between border-t p-3 text-sm">
            <span className="text-muted-foreground">{list.data.meta.total} employees · page {list.data.meta.page} of {list.data.meta.totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= list.data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
      <EmployeeFormDialog open={addOpen} onOpenChange={setAddOpen} employee={null} onSaved={(x) => navigate(`/employees/${x.id}`)} />
    </div>
  );
}
