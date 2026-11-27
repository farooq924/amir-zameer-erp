import { EMPLOYEE_STATUSES, EMPLOYEE_TYPES, EMPLOYMENT_TYPES, PAYMENT_METHODS, SALARY_TYPES, formatPhone } from '@az/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { HandCoins, IdCard, UserCheck, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { FieldError, Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MONEY_RE } from '@/features/inventory/shared';
import { api, errorMessage } from '@/services/api';
import type { Employee, EmployeeDetail } from '@/types';
import { formatPKR } from '@/utils/format';
import { newId } from '@/utils/id';
import { todayPK } from './shared';

const PHONE_RE = /^[+\d][\d\s-]{6,19}$/;
const CNIC_RE = /^\d{5}-\d{7}-\d$/;
const money = (v: string) => !v.trim() || MONEY_RE.test(v.trim());

type SalaryForm = { salaryType: string; monthlySalary: string; dailyWage: string; perPieceRate: string; overtimeRatePerHour: string };
const EMPTY_SALARY: SalaryForm = { salaryType: 'MONTHLY', monthlySalary: '', dailyWage: '', perPieceRate: '', overtimeRatePerHour: '' };

function salaryErrors(s: SalaryForm) {
  const needsMonthly = s.salaryType === 'MONTHLY' || s.salaryType === 'FIXED_PLUS_INCENTIVE';
  return {
    monthlySalary: needsMonthly && (!MONEY_RE.test(s.monthlySalary.trim()) || Number(s.monthlySalary) <= 0) ? 'Enter the monthly salary' : !money(s.monthlySalary) ? 'Enter an amount' : undefined,
    dailyWage: s.salaryType === 'DAILY' && (!MONEY_RE.test(s.dailyWage.trim()) || Number(s.dailyWage) <= 0) ? 'Enter the daily wage' : !money(s.dailyWage) ? 'Enter an amount' : undefined,
    perPieceRate: !money(s.perPieceRate) ? 'Enter an amount' : undefined,
    overtimeRatePerHour: !money(s.overtimeRatePerHour) ? 'Enter an amount' : undefined,
  };
}

const salaryBody = (s: SalaryForm) => ({
  salaryType: s.salaryType, monthlySalary: s.monthlySalary.trim() || undefined, dailyWage: s.dailyWage.trim() || undefined,
  perPieceRate: s.perPieceRate.trim() || undefined, overtimeRatePerHour: s.overtimeRatePerHour.trim() || undefined,
});

/** Salary type cards + amount fields (used when adding an employee and when changing salary). */
function SalaryFields({ s, setS, err }: { s: SalaryForm; setS: (s: SalaryForm) => void; err: (k: string) => string | undefined }) {
  const set = (k: keyof SalaryForm) => (e: { target: { value: string } }) => setS({ ...s, [k]: e.target.value });
  const showMonthly = s.salaryType === 'MONTHLY' || s.salaryType === 'FIXED_PLUS_INCENTIVE';
  const showPiece = s.salaryType === 'PER_PIECE' || s.salaryType === 'FIXED_PLUS_INCENTIVE';
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Salary type">
        {SALARY_TYPES.map((t) => (
          <button key={t.key} type="button" role="radio" aria-checked={s.salaryType === t.key} onClick={() => setS({ ...s, salaryType: t.key })}
            className={`rounded-xl border p-3 text-left transition-colors ${s.salaryType === t.key ? 'border-primary bg-gold-soft/60 ring-1 ring-primary' : 'hover:border-primary/50'}`}>
            <span className="block text-sm font-semibold">{t.label}</span>
            <span className="block text-[11px] text-muted-foreground">{t.hint}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {showMonthly && (
          <div className="space-y-1.5"><Label htmlFor="sal-m" required>Monthly salary (Rs)</Label>
            <Input id="sal-m" inputMode="decimal" placeholder="e.g. 30000" value={s.monthlySalary} onChange={set('monthlySalary')} aria-invalid={!!err('monthlySalary')} /><FieldError message={err('monthlySalary')} /></div>
        )}
        {s.salaryType === 'DAILY' && (
          <div className="space-y-1.5"><Label htmlFor="sal-d" required>Daily wage (Rs)</Label>
            <Input id="sal-d" inputMode="decimal" placeholder="e.g. 1500" value={s.dailyWage} onChange={set('dailyWage')} aria-invalid={!!err('dailyWage')} /><FieldError message={err('dailyWage')} /></div>
        )}
        {showPiece && (
          <div className="space-y-1.5"><Label htmlFor="sal-p">Rate per piece (Rs)</Label>
            <Input id="sal-p" inputMode="decimal" placeholder="Garment rate is used first" value={s.perPieceRate} onChange={set('perPieceRate')} aria-invalid={!!err('perPieceRate')} /><FieldError message={err('perPieceRate')} />
            <p className="text-[11px] text-muted-foreground">Used when the garment has no piece rate (Garments page).</p></div>
        )}
        <div className="space-y-1.5"><Label htmlFor="sal-o">Overtime rate per hour (Rs)</Label>
          <Input id="sal-o" inputMode="decimal" placeholder="0" value={s.overtimeRatePerHour} onChange={set('overtimeRatePerHour')} aria-invalid={!!err('overtimeRatePerHour')} /><FieldError message={err('overtimeRatePerHour')} /></div>
      </div>
    </div>
  );
}

const EMPTY = {
  name: '', fatherName: '', contactNumber: '', cnic: '', address: '', designation: '', employeeType: 'TAILOR', employmentType: 'PERMANENT',
  joiningDate: todayPK(), bankName: '', bankAccountTitle: '', bankAccountNumber: '', notes: '',
};

export function EmployeeFormDialog({ open, onOpenChange, employee, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; employee: Employee | null; onSaved?: (e: EmployeeDetail) => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState(EMPTY);
  const [s, setS] = useState<SalaryForm>(EMPTY_SALARY);
  const [tab, setTab] = useState('info');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTouched(false); setTab('info'); setS(EMPTY_SALARY);
    setF(employee ? {
      name: employee.name, fatherName: employee.fatherName ?? '', contactNumber: employee.contactNumber ? formatPhone(employee.contactNumber) : '', cnic: employee.cnic ?? '',
      address: employee.address ?? '', designation: employee.designation ?? '', employeeType: employee.employeeType, employmentType: employee.employmentType,
      joiningDate: employee.joiningDate, bankName: employee.bankName ?? '', bankAccountTitle: employee.bankAccountTitle ?? '', bankAccountNumber: employee.bankAccountNumber ?? '', notes: employee.notes ?? '',
    } : { ...EMPTY, joiningDate: todayPK() });
  }, [open, employee]);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const infoErrors: Record<string, string | undefined> = {
    name: f.name.trim().length < 2 ? 'Enter the employee name' : undefined,
    contactNumber: f.contactNumber.trim() && !PHONE_RE.test(f.contactNumber.trim()) ? 'Enter a number like 0300-1234567' : undefined,
    cnic: f.cnic.trim() && !CNIC_RE.test(f.cnic.trim()) ? 'CNIC must look like 35202-1234567-1' : undefined,
    joiningDate: !f.joiningDate ? 'Select the joining date' : f.joiningDate > todayPK() ? 'Joining date cannot be in the future' : undefined,
  };
  const sErrors: Record<string, string | undefined> = employee ? {} : salaryErrors(s);
  const errors = { ...infoErrors, ...sErrors };
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name.trim(), fatherName: f.fatherName, contactNumber: f.contactNumber, cnic: f.cnic, address: f.address, designation: f.designation,
        employeeType: f.employeeType, employmentType: f.employmentType, joiningDate: f.joiningDate, bankName: f.bankName, bankAccountTitle: f.bankAccountTitle,
        bankAccountNumber: f.bankAccountNumber, notes: f.notes,
      };
      if (employee) return api.patch<EmployeeDetail>(`/employees/${employee.id}`, { ...body, version: employee.version });
      return api.post<EmployeeDetail>('/employees', { ...body, salary: salaryBody(s) });
    },
    onSuccess: (e) => {
      toast.success(employee ? 'Employee updated' : `${e.name} added as ${e.code}`);
      void qc.invalidateQueries({ queryKey: ['employees'] });
      onSaved?.(e);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const err = (k: string) => (touched ? errors[k] : undefined);
  const submit = () => {
    setTouched(true);
    if (Object.values(infoErrors).some(Boolean)) { setTab('info'); return; }
    if (Object.values(sErrors).some(Boolean)) { setTab('salary'); return; }
    save.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle><IdCard className="h-5 w-5 text-primary" /> {employee ? `Edit ${employee.code}` : 'Add employee'}</DialogTitle>
          <DialogDescription>Tailors, cutters, helpers and shop staff.</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-3">
              <TabsTrigger value="info">Personal & job</TabsTrigger>
              {!employee && <TabsTrigger value="salary">Salary</TabsTrigger>}
              <TabsTrigger value="bank">Bank & notes</TabsTrigger>
            </TabsList>
            <TabsContent value="info" className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="e-name" required>Full name</Label>
                <Input id="e-name" autoFocus maxLength={120} placeholder="e.g. Muhammad Aslam" value={f.name} onChange={set('name')} aria-invalid={!!err('name')} /><FieldError message={err('name')} /></div>
              <div className="space-y-1.5"><Label htmlFor="e-father">Father's name</Label><Input id="e-father" maxLength={120} value={f.fatherName} onChange={set('fatherName')} /></div>
              <div className="space-y-1.5"><Label htmlFor="e-phone">Mobile</Label>
                <Input id="e-phone" inputMode="tel" placeholder="0300-1234567" value={f.contactNumber} onChange={set('contactNumber')} aria-invalid={!!err('contactNumber')} /><FieldError message={err('contactNumber')} /></div>
              <div className="space-y-1.5"><Label htmlFor="e-cnic">CNIC</Label>
                <Input id="e-cnic" inputMode="numeric" placeholder="35202-1234567-1" maxLength={15} value={f.cnic} onChange={set('cnic')} aria-invalid={!!err('cnic')} /><FieldError message={err('cnic')} /></div>
              <div className="space-y-1.5"><Label htmlFor="e-type" required>Work type</Label>
                <NativeSelect id="e-type" value={f.employeeType} onChange={set('employeeType')}>{EMPLOYEE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</NativeSelect></div>
              <div className="space-y-1.5"><Label htmlFor="e-desig">Designation</Label><Input id="e-desig" maxLength={80} placeholder="e.g. Senior tailor" value={f.designation} onChange={set('designation')} /></div>
              <div className="space-y-1.5"><Label htmlFor="e-emp">Employment</Label>
                <NativeSelect id="e-emp" value={f.employmentType} onChange={set('employmentType')}>{EMPLOYMENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</NativeSelect></div>
              <div className="space-y-1.5"><Label htmlFor="e-join" required>Joining date</Label>
                <Input id="e-join" type="date" max={todayPK()} value={f.joiningDate} onChange={set('joiningDate')} aria-invalid={!!err('joiningDate')} /><FieldError message={err('joiningDate')} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="e-addr">Address</Label><Input id="e-addr" maxLength={300} value={f.address} onChange={set('address')} /></div>
            </TabsContent>
            {!employee && <TabsContent value="salary"><SalaryFields s={s} setS={setS} err={err} /></TabsContent>}
            <TabsContent value="bank" className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="e-bank">Bank</Label><Input id="e-bank" maxLength={80} placeholder="e.g. Meezan Bank" value={f.bankName} onChange={set('bankName')} /></div>
              <div className="space-y-1.5"><Label htmlFor="e-title">Account title</Label><Input id="e-title" maxLength={120} value={f.bankAccountTitle} onChange={set('bankAccountTitle')} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="e-acc">Account / IBAN</Label><Input id="e-acc" maxLength={40} value={f.bankAccountNumber} onChange={set('bankAccountNumber')} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="e-notes">Notes</Label><Textarea id="e-notes" rows={3} maxLength={2000} value={f.notes} onChange={set('notes')} /></div>
            </TabsContent>
          </Tabs>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            {!employee && tab === 'info' ? (
              <Button type="button" onClick={() => { setTouched(true); if (!Object.values(infoErrors).some(Boolean)) setTab('salary'); }}>Next: Salary</Button>
            ) : (
              <Button type="submit" loading={save.isPending}>{employee ? 'Save changes' : 'Add employee'}</Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SalaryDialog({ open, onOpenChange, employee }: { open: boolean; onOpenChange: (o: boolean) => void; employee: EmployeeDetail }) {
  const qc = useQueryClient();
  const [s, setS] = useState<SalaryForm>(EMPTY_SALARY);
  const [from, setFrom] = useState(todayPK());
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    const c = employee.salary;
    setS(c ? { salaryType: c.salaryType, monthlySalary: num(c.monthlySalary), dailyWage: num(c.dailyWage), perPieceRate: num(c.perPieceRate), overtimeRatePerHour: num(c.overtimeRatePerHour) } : EMPTY_SALARY);
    setFrom(todayPK()); setReason(''); setTouched(false);
  }, [open, employee.salary]);
  const errors = { ...salaryErrors(s), from: !from ? 'Select a date' : employee.salary && from <= employee.salary.effectiveFrom ? `Must be after ${employee.salary.effectiveFrom}` : undefined };
  const save = useMutation({
    mutationFn: () => api.post<EmployeeDetail>(`/employees/${employee.id}/salary`, { ...salaryBody(s), effectiveFrom: from, reason: reason.trim() || undefined }),
    onSuccess: () => { toast.success('Salary updated'); void qc.invalidateQueries({ queryKey: ['employees'] }); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const err = (k: string) => (touched ? (errors as Record<string, string | undefined>)[k] : undefined);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle><Wallet className="h-5 w-5 text-primary" /> Change salary</DialogTitle>
          <DialogDescription>{employee.name} · the old salary is kept in history and used for earlier months.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!Object.values(errors).some(Boolean)) save.mutate(); }}>
          <SalaryFields s={s} setS={setS} err={err} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="sal-from" required>New salary from</Label>
              <Input id="sal-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-invalid={!!err('from')} /><FieldError message={err('from')} /></div>
            <div className="space-y-1.5"><Label htmlFor="sal-reason">Reason</Label><Input id="sal-reason" maxLength={300} placeholder="e.g. Yearly increment" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>Save salary</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StatusDialog({ open, onOpenChange, employee }: { open: boolean; onOpenChange: (o: boolean) => void; employee: EmployeeDetail }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(employee.status);
  const [date, setDate] = useState(todayPK());
  const [notes, setNotes] = useState('');
  useEffect(() => { if (open) { setStatus(employee.status); setDate(todayPK()); setNotes(''); } }, [open, employee.status]);
  const save = useMutation({
    mutationFn: () => api.post(`/employees/${employee.id}/status`, { status, date, notes: notes.trim() || undefined }),
    onSuccess: () => { toast.success('Status updated'); void qc.invalidateQueries({ queryKey: ['employees'] }); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle><UserCheck className="h-5 w-5 text-primary" /> Change status</DialogTitle>
          <DialogDescription>{employee.name}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="space-y-1.5"><Label htmlFor="st-status">Status</Label>
            <NativeSelect id="st-status" value={status} onChange={(e) => setStatus(e.target.value)}>{EMPLOYEE_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="st-date">{status === 'TERMINATED' ? 'Last working day' : 'From date'}</Label>
            <Input id="st-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="st-notes">Notes</Label><Textarea id="st-notes" rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {status === 'TERMINATED' && <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">The employee will be paid only up to the last working day in payroll, and will not appear in new attendance sheets after it.</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={status === employee.status}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AdvanceDialog({ open, onOpenChange, employee }: { open: boolean; onOpenChange: (o: boolean) => void; employee: { id: string; name: string; advanceBalance?: string } }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [inst, setInst] = useState('');
  const [method, setMethod] = useState('CASH');
  const [date, setDate] = useState(todayPK());
  const [reason, setReason] = useState('');
  const [key, setKey] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setAmount(''); setInst(''); setMethod('CASH'); setDate(todayPK()); setReason(''); setKey(newId()); setTouched(false); } }, [open]);
  const errors = {
    amount: !MONEY_RE.test(amount.trim()) || Number(amount) <= 0 ? 'Enter the advance amount' : undefined,
    inst: !money(inst) ? 'Enter an amount' : Number(inst) > Number(amount) ? 'Cannot be more than the advance' : undefined,
    date: !date || date > todayPK() ? 'Select a date (not in the future)' : undefined,
  };
  const save = useMutation({
    mutationFn: () => api.post(`/employees/${employee.id}/advances`, { amount: amount.trim(), installmentAmount: inst.trim() || undefined, paymentMethod: method, advanceDate: date, reason: reason.trim() || undefined, idempotencyKey: key }),
    onSuccess: () => { toast.success(`Advance of ${formatPKR(amount)} saved`); void qc.invalidateQueries({ queryKey: ['employees'] }); void qc.invalidateQueries({ queryKey: ['advances'] }); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const err = (k: keyof typeof errors) => (touched ? errors[k] : undefined);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle><HandCoins className="h-5 w-5 text-primary" /> Give advance</DialogTitle>
          <DialogDescription>{employee.name}{employee.advanceBalance && Number(employee.advanceBalance) > 0 ? ` · already owes ${formatPKR(employee.advanceBalance)}` : ''}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!Object.values(errors).some(Boolean)) save.mutate(); }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="ad-amount" required>Amount (Rs)</Label>
              <Input id="ad-amount" autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!err('amount')} /><FieldError message={err('amount')} /></div>
            <div className="space-y-1.5"><Label htmlFor="ad-inst">Cut per salary (Rs)</Label>
              <Input id="ad-inst" inputMode="decimal" placeholder="Full amount" value={inst} onChange={(e) => setInst(e.target.value)} aria-invalid={!!err('inst')} /><FieldError message={err('inst')} /></div>
            <div className="space-y-1.5"><Label htmlFor="ad-method">Paid by</Label>
              <NativeSelect id="ad-method" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</NativeSelect></div>
            <div className="space-y-1.5"><Label htmlFor="ad-date" required>Date</Label>
              <Input id="ad-date" type="date" max={todayPK()} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!err('date')} /><FieldError message={err('date')} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ad-reason">Reason</Label><Input id="ad-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">The advance is cut from coming salaries automatically. Leave "Cut per salary" empty to cut it all from the next salary.</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>Save advance</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const num = (v: string) => (Number(v) ? String(Number(v)) : '');
