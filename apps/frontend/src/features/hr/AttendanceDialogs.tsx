import { LEAVE_TYPES } from '@az/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CalendarOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { MONEY_RE } from '@/features/inventory/shared';
import { api, errorMessage } from '@/services/api';
import type { EmployeeOption } from '@/types';
import { formatPKR } from '@/utils/format';
import { todayPK } from './shared';

/** Current employees for pickers. Production uses its own endpoint so tailors (no Employees access) can use it. */
export function useEmployeeOptions(enabled = true, path = '/employees/options') {
  return useQuery({ queryKey: ['employees', 'options', path], queryFn: () => api.get<EmployeeOption[]>(path), enabled, staleTime: 60_000 });
}

export function EmployeeSelect({ id, value, onChange, invalid, options }: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean; options: EmployeeOption[] }) {
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid}>
      <option value="">Select employee</option>
      {options.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code}){e.designation ? ` · ${e.designation}` : ''}</option>)}
    </NativeSelect>
  );
}

const dayCount = (from: string, to: string) => (from && to && to >= from ? Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 : 0);

export function LeaveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const employees = useEmployeeOptions(open);
  const [f, setF] = useState({ employeeId: '', leaveType: 'CASUAL', fromDate: todayPK(), toDate: todayPK(), reason: '' });
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setF({ employeeId: '', leaveType: 'CASUAL', fromDate: todayPK(), toDate: todayPK(), reason: '' }); setTouched(false); } }, [open]);
  const days = dayCount(f.fromDate, f.toDate);
  const errors = {
    employeeId: !f.employeeId ? 'Select the employee' : undefined,
    toDate: !f.fromDate || !f.toDate ? 'Select the dates' : f.toDate < f.fromDate ? '"To" must be on or after "From"' : days > 90 ? 'At most 90 days' : undefined,
  };
  const save = useMutation({
    mutationFn: () => api.post('/attendance/leaves', { ...f, reason: f.reason.trim() || undefined }),
    onSuccess: () => { toast.success('Leave request saved'); void qc.invalidateQueries({ queryKey: ['attendance'] }); void qc.invalidateQueries({ queryKey: ['employees'] }); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const err = (k: keyof typeof errors) => (touched ? errors[k] : undefined);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle><CalendarOff className="h-5 w-5 text-primary" /> Add leave</DialogTitle>
          <DialogDescription>When approved, the days are marked as leave in attendance. Unpaid leave is marked absent.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!Object.values(errors).some(Boolean)) save.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="lv-emp" required>Employee</Label>
            <EmployeeSelect id="lv-emp" value={f.employeeId} onChange={(v) => setF({ ...f, employeeId: v })} invalid={!!err('employeeId')} options={employees.data ?? []} /><FieldError message={err('employeeId')} /></div>
          <div className="space-y-1.5"><Label htmlFor="lv-type">Leave type</Label>
            <NativeSelect id="lv-type" value={f.leaveType} onChange={(e) => setF({ ...f, leaveType: e.target.value })}>{LEAVE_TYPES.map((l) => <option key={l.key} value={l.key}>{l.label}{l.paid ? '' : ' (salary cut)'}</option>)}</NativeSelect></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="lv-from" required>From</Label><Input id="lv-from" type="date" value={f.fromDate} onChange={(e) => setF({ ...f, fromDate: e.target.value, toDate: f.toDate < e.target.value ? e.target.value : f.toDate })} /></div>
            <div className="space-y-1.5"><Label htmlFor="lv-to" required>To</Label><Input id="lv-to" type="date" min={f.fromDate} value={f.toDate} onChange={(e) => setF({ ...f, toDate: e.target.value })} aria-invalid={!!err('toDate')} /></div>
          </div>
          <FieldError message={err('toDate')} />
          {days > 0 && <p className="text-xs text-muted-foreground">{days} day(s)</p>}
          <div className="space-y-1.5"><Label htmlFor="lv-reason">Reason</Label><Textarea id="lv-reason" rows={2} maxLength={300} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>Save leave</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OvertimeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const employees = useEmployeeOptions(open);
  const [f, setF] = useState({ employeeId: '', date: todayPK(), hours: '', ratePerHour: '', notes: '' });
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setF({ employeeId: '', date: todayPK(), hours: '', ratePerHour: '', notes: '' }); setTouched(false); } }, [open]);
  const emp = employees.data?.find((e) => e.id === f.employeeId);
  const defaultRate = Number(emp?.overtimeRatePerHour ?? 0);
  const rate = f.ratePerHour.trim() ? Number(f.ratePerHour) : defaultRate;
  const errors = {
    employeeId: !f.employeeId ? 'Select the employee' : undefined,
    date: !f.date || f.date > todayPK() ? 'Select a date (not in the future)' : undefined,
    hours: !/^\d{1,2}(\.\d{1,2})?$/.test(f.hours.trim()) || Number(f.hours) <= 0 || Number(f.hours) > 16 ? 'Enter hours, e.g. 2 or 2.5' : undefined,
    ratePerHour: f.ratePerHour.trim() && !MONEY_RE.test(f.ratePerHour.trim()) ? 'Enter an amount' : !rate ? 'Enter the rate (no overtime rate in salary)' : undefined,
  };
  const save = useMutation({
    mutationFn: () => api.post('/attendance/overtime', { employeeId: f.employeeId, date: f.date, hours: f.hours.trim(), ratePerHour: f.ratePerHour.trim() || undefined, notes: f.notes.trim() || undefined }),
    onSuccess: () => { toast.success('Overtime saved. It needs approval before payroll.'); void qc.invalidateQueries({ queryKey: ['attendance'] }); void qc.invalidateQueries({ queryKey: ['employees'] }); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const err = (k: keyof typeof errors) => (touched ? errors[k] : undefined);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle><CalendarClock className="h-5 w-5 text-primary" /> Add overtime</DialogTitle>
          <DialogDescription>Approved overtime is added to the salary in payroll.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!Object.values(errors).some(Boolean)) save.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="ot-emp" required>Employee</Label>
            <EmployeeSelect id="ot-emp" value={f.employeeId} onChange={(v) => setF({ ...f, employeeId: v })} invalid={!!err('employeeId')} options={employees.data ?? []} /><FieldError message={err('employeeId')} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label htmlFor="ot-date" required>Date</Label><Input id="ot-date" type="date" max={todayPK()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-invalid={!!err('date')} /></div>
            <div className="space-y-1.5"><Label htmlFor="ot-hours" required>Hours</Label><Input id="ot-hours" inputMode="decimal" placeholder="2" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} aria-invalid={!!err('hours')} /></div>
            <div className="space-y-1.5"><Label htmlFor="ot-rate">Rs / hour</Label><Input id="ot-rate" inputMode="decimal" placeholder={defaultRate ? String(defaultRate) : 'Rate'} value={f.ratePerHour} onChange={(e) => setF({ ...f, ratePerHour: e.target.value })} aria-invalid={!!err('ratePerHour')} /></div>
          </div>
          <FieldError message={err('date') ?? err('hours') ?? err('ratePerHour')} />
          {Number(f.hours) > 0 && rate > 0 && <p className="rounded-lg bg-gold-soft/60 p-2.5 text-sm">Amount: <b>{formatPKR(Number(f.hours) * rate)}</b></p>}
          <div className="space-y-1.5"><Label htmlFor="ot-notes">Notes</Label><Input id="ot-notes" maxLength={300} placeholder="e.g. Eid rush" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>Save overtime</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
