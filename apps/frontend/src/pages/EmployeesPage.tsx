import { EMPLOYEE_TYPES, formatPhone } from '@az/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, HandCoins, IdCard, Plus, Search, Users, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState, PageHeader } from '@/components/common';
import { type DataColumn, DataTable, fetchAllPages } from '@/components/data-table/DataTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { StatCard } from '@/features/dashboard/StatCard';
import { EmployeeFormDialog } from '@/features/hr/EmployeeDialogs';
import { AttendanceBadge, EMPLOYEE_TYPE_LABEL, EmployeeStatusBadge, salaryText } from '@/features/hr/shared';
import { useDebounced } from '@/features/inventory/shared';
import { useCan } from '@/hooks/use-permission';
import { api } from '@/services/api';
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
  const [pageSize, setPageSize] = useState(25);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const qc = useQueryClient();
  const q = useDebounced(search);
  const summary = useQuery({ queryKey: ['employees', 'summary'], queryFn: () => api.get<EmployeeSummary>('/employees/summary') });
  const listParams = { search: q, status, type };
  const list = useQuery({
    queryKey: ['employees', 'list', { q, status, type, page, pageSize }],
    queryFn: () => api.get<Paginated<Employee>>('/employees', { ...listParams, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const reset = () => setPage(1);
  const filtered = !!(q || status !== 'CURRENT' || type);
  const s = summary.data;

  const columns: DataColumn<Employee>[] = [
    { id: 'code', header: 'Code', value: (x) => x.code, cell: (x) => <span className="font-mono text-xs font-semibold">{x.code}</span> },
    { id: 'name', header: 'Employee', value: (x) => x.name, text: (x) => `${x.name} - ${x.designation || EMPLOYEE_TYPE_LABEL[x.employeeType]}`,
      cell: (x) => <><span className="font-medium">{x.name}</span><span className="block text-xs text-muted-foreground">{x.designation || EMPLOYEE_TYPE_LABEL[x.employeeType]}</span></> },
    { id: 'mobile', header: 'Mobile', value: (x) => (x.contactNumber ? formatPhone(x.contactNumber) : ''), className: 'hidden md:table-cell whitespace-nowrap' },
    { id: 'salary', header: 'Salary', value: (x) => salaryText(x.salary), className: 'whitespace-nowrap text-sm' },
    { id: 'advance', header: 'Advance due', type: 'money', value: (x) => x.advanceBalance, className: 'hidden lg:table-cell',
      cell: (x) => <span className={cn(Number(x.advanceBalance) > 0 && 'font-semibold text-rose-700 dark:text-rose-400')}>{Number(x.advanceBalance) > 0 ? formatPKR(x.advanceBalance) : '-'}</span> },
    { id: 'today', header: 'Today', value: (x) => x.todayAttendance ?? '', cell: (x) => <AttendanceBadge status={x.todayAttendance} />, className: 'hidden md:table-cell' },
    { id: 'status', header: 'Status', value: (x) => x.status, cell: (x) => <EmployeeStatusBadge status={x.status} /> },
  ];
  const open = (x: Employee) => navigate(`/employees/${x.id}`);

  return (
    <div>
      <PageHeader title="Employees" description="Staff records, salaries and advances."
        actions={<>
          {can('attendance') && <Button variant="outline" asChild><Link to="/attendance"><CalendarCheck /> Mark attendance</Link></Button>}
          {can('employees', 'CREATE') && <Button onClick={() => { setEditing(null); setAddOpen(true); }}><Plus /> Add employee</Button>}
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard featured label="Current staff" value={String((s?.active ?? 0) + (s?.onLeave ?? 0))} icon={Users} loading={summary.isLoading} hint={s?.onLeave ? `${s.onLeave} on leave` : 'Active employees'} />
        <StatCard label="Present today" value={s ? `${s.today.present} / ${s.active + s.onLeave}` : '0'} icon={CalendarCheck} tile="green" loading={summary.isLoading}
          hint={s ? (s.today.marked ? `${s.today.absent} absent · ${s.today.leave} on leave` : 'Not marked yet') : undefined} />
        <StatCard label="Monthly salaries" value={formatPKR(s?.monthlySalaries)} icon={Wallet} tile="blue" loading={summary.isLoading} hint="Fixed salaries per month" className="col-span-2 sm:col-span-1" />
        <StatCard label="Advances to recover" value={formatPKR(s?.openAdvances.balance)} icon={HandCoins} tile="rose" loading={summary.isLoading} hint={`${s?.openAdvances.count ?? 0} open advance(s)`} className="col-span-2 sm:col-span-1" />
      </div>
      <Card>
        <DataTable
          title="Employees"
          module="employees"
          noun="employee"
          rows={list.data?.data}
          columns={columns}
          getRowId={(x) => x.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          pagination={{ page, pageSize, total: list.data?.meta.total ?? 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
          fetchAll={() => fetchAllPages((pg, size) => api.get<Paginated<Employee>>('/employees', { ...listParams, page: pg, pageSize: size }))}
          onRowClick={open}
          onView={open}
          onEdit={can('employees', 'EDIT') ? (x) => { setEditing(x); setAddOpen(true); } : undefined}
          deleteRow={can('employees', 'DELETE') ? (x) => api.delete(`/employees/${x.id}`) : undefined}
          deleteWarning="Employees with attendance, advances, payroll or work records cannot be deleted; mark them Inactive or Left the job instead."
          onChanged={() => qc.invalidateQueries({ queryKey: ['employees'] })}
          toolbar={
            <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
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
          }
          empty={
            <EmptyState icon={<IdCard />} title={filtered ? 'No employees match these filters' : 'No employees yet'}
            description={filtered ? 'Try another search or clear the filters.' : 'Add your tailors, cutters and staff to mark attendance and run payroll.'}
            action={!filtered && can('employees', 'CREATE') ? <Button onClick={() => { setEditing(null); setAddOpen(true); }}><Plus /> Add employee</Button> : undefined} />
          }
          mobileCard={(x) => (
            <Link to={`/employees/${x.id}`} className="flex items-center gap-3 px-1 py-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-gold">{initials(x.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{x.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{x.code} · {x.designation || EMPLOYEE_TYPE_LABEL[x.employeeType]}</span>
                      <span className="block truncate text-xs text-muted-foreground">{salaryText(x.salary)}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1"><EmployeeStatusBadge status={x.status} /><AttendanceBadge status={x.todayAttendance} /></span>
                  </Link>
          )}
        />
      </Card>
      <EmployeeFormDialog open={addOpen} onOpenChange={setAddOpen} employee={editing} onSaved={(x) => { if (!editing) navigate(`/employees/${x.id}`); }} />
    </div>
  );
}
