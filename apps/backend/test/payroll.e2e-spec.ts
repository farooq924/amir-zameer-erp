import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Agent, bootApp, login } from './helpers';

/** Karachi "today" and the month before, so the test works on any date. */
function karachi() {
  const now = new Date(Date.now() + 5 * 3_600_000);
  const today = now.toISOString().slice(0, 10);
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const twoBack = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const month = prev.toISOString().slice(0, 7);
  const days = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 0)).getUTCDate();
  return { today, month, days, joining: twoBack.toISOString().slice(0, 10), d: (n: number) => `${month}-${String(n).padStart(2, '0')}` };
}

describe('Employees, attendance, production & payroll (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let owner: Agent;
  const k = karachi();
  const post = (path: string, body: unknown, a: Agent = owner) => a.agent.post(path).set('X-CSRF-Token', a.csrf).send(body as object);
  const put = (path: string, body: unknown, a: Agent = owner) => a.agent.put(path).set('X-CSRF-Token', a.csrf).send(body as object);
  const patch = (path: string, body: unknown, a: Agent = owner) => a.agent.patch(path).set('X-CSRF-Token', a.csrf).send(body as object);
  const del = (path: string, a: Agent = owner) => a.agent.delete(path).set('X-CSRF-Token', a.csrf);
  const get = (path: string, a: Agent = owner) => a.agent.get(path);

  let monthlyId: string; // 30,000 monthly
  let pieceId: string; // per piece 500
  let dailyId: string; // 1,500 daily
  let orderItemId: string;
  let payrollId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    owner = await login(app, 'owner', 'OwnerPass123');
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('creates employees with codes, salary and history', async () => {
    const m = await post('/api/employees', {
      name: 'Muhammad Aslam', employeeType: 'MASTER_TAILOR', designation: 'Master', joiningDate: k.joining, contactNumber: '0300-5550001', cnic: '35202-1234567-1',
      salary: { salaryType: 'MONTHLY', monthlySalary: '30000', overtimeRatePerHour: '200' },
    }).expect(201);
    monthlyId = m.body.id;
    expect(m.body.code).toMatch(/^AZE-\d{4}$/);
    expect(m.body.salary).toMatchObject({ salaryType: 'MONTHLY', monthlySalary: '30000.00', isCurrent: true });
    expect(m.body.history[0].changeType).toBe('JOINED');
    await post('/api/employees', { name: 'Dup', employeeType: 'TAILOR', joiningDate: k.joining, cnic: '35202-1234567-1', salary: { salaryType: 'DAILY', dailyWage: '1000' } }).expect(409);
    await post('/api/employees', { name: 'Bad', employeeType: 'TAILOR', joiningDate: k.joining, salary: { salaryType: 'MONTHLY' } }).expect(400);
    await post('/api/employees', { name: 'Bad', employeeType: 'TAILOR', joiningDate: '2099-01-01', salary: { salaryType: 'DAILY', dailyWage: '1000' } }).expect(400);
    await post('/api/employees', { name: 'Bad', employeeType: 'TAILOR', joiningDate: k.joining, cnic: '123', salary: { salaryType: 'DAILY', dailyWage: '1000' } }).expect(400);

    pieceId = (await post('/api/employees', { name: 'Bilal Tailor', employeeType: 'TAILOR', joiningDate: k.joining, salary: { salaryType: 'PER_PIECE', perPieceRate: '500' } }).expect(201)).body.id;
    dailyId = (await post('/api/employees', { name: 'Danish Helper', employeeType: 'HELPER', joiningDate: k.joining, salary: { salaryType: 'DAILY', dailyWage: '1500' } }).expect(201)).body.id;

    const list = await get('/api/employees?search=aslam').expect(200);
    expect(list.body.data).toHaveLength(1);
    const opts = await get('/api/employees/options').expect(200);
    expect(opts.body.length).toBeGreaterThanOrEqual(3);
  });

  it('edits with optimistic locking and records designation changes', async () => {
    const e = (await get(`/api/employees/${monthlyId}`).expect(200)).body;
    await patch(`/api/employees/${monthlyId}`, { designation: 'Head master', version: e.version }).expect(200);
    await patch(`/api/employees/${monthlyId}`, { designation: 'Stale', version: e.version }).expect(409);
    const after = (await get(`/api/employees/${monthlyId}`).expect(200)).body;
    expect(after.history.some((h: { changeType: string; toValue: string }) => h.changeType === 'DESIGNATION' && h.toValue === 'Head master')).toBe(true);
  });

  it('keeps salary history when the salary changes', async () => {
    await post(`/api/employees/${dailyId}/salary`, { salaryType: 'DAILY', dailyWage: '1600', effectiveFrom: k.joining }).expect(400); // must be after current start
    await post(`/api/employees/${dailyId}/salary`, { salaryType: 'DAILY', dailyWage: '1800', effectiveFrom: k.today, reason: 'Raise' }).expect(201);
    const e = (await get(`/api/employees/${dailyId}`).expect(200)).body;
    expect(e.salary.dailyWage).toBe('1800.00');
    expect(e.salaryHistory).toHaveLength(2);
    expect(e.salaryHistory[1].isCurrent).toBe(false);
    expect(e.salaryHistory[1].effectiveTo).not.toBeNull();
  });

  it('marks daily attendance and shows the monthly register', async () => {
    const sheet = await get(`/api/attendance/daily?date=${k.d(1)}`).expect(200);
    expect(sheet.body.rows.length).toBeGreaterThanOrEqual(3);
    await put('/api/attendance/daily', { date: '2099-01-01', entries: [{ employeeId: monthlyId, status: 'PRESENT' }] }).expect(400);
    for (const day of [1, 2, 3]) {
      await put('/api/attendance/daily', {
        date: k.d(day),
        entries: [
          { employeeId: monthlyId, status: day === 3 ? 'ABSENT' : 'PRESENT', checkIn: '09:00', checkOut: '19:00' },
          { employeeId: dailyId, status: day === 2 ? 'HALF_DAY' : 'PRESENT' },
        ],
      }).expect(200);
    }
    // half day for the monthly employee on day 4, then clear and re-mark (NONE removes)
    await put('/api/attendance/daily', { date: k.d(4), entries: [{ employeeId: monthlyId, status: 'PRESENT' }] }).expect(200);
    await put('/api/attendance/daily', { date: k.d(4), entries: [{ employeeId: monthlyId, status: 'NONE' }] }).expect(200);
    await put('/api/attendance/daily', { date: k.d(4), entries: [{ employeeId: monthlyId, status: 'HALF_DAY' }] }).expect(200);
    const day1 = await get(`/api/attendance/daily?date=${k.d(1)}`).expect(200);
    const row = day1.body.rows.find((r: { employee: { id: string } }) => r.employee.id === monthlyId);
    expect(row.attendance).toMatchObject({ status: 'PRESENT', checkIn: '09:00', checkOut: '19:00' });
    const reg = await get(`/api/attendance/monthly?month=${k.month}`).expect(200);
    const m = reg.body.rows.find((r: { employee: { id: string } }) => r.employee.id === monthlyId);
    expect(m.marks['03']).toBe('A');
    expect(m.totals).toMatchObject({ present: 2, absent: 1, halfDay: 1 });
  });

  it('approves leave into attendance (unpaid leave counts as absent)', async () => {
    const paid = await post('/api/attendance/leaves', { employeeId: monthlyId, leaveType: 'SICK', fromDate: k.d(5), toDate: k.d(6) }).expect(201);
    await post('/api/attendance/leaves', { employeeId: monthlyId, leaveType: 'CASUAL', fromDate: k.d(6), toDate: k.d(7) }).expect(400); // overlap
    const unpaid = await post('/api/attendance/leaves', { employeeId: monthlyId, leaveType: 'UNPAID', fromDate: k.d(8), toDate: k.d(8) }).expect(201);
    await post(`/api/attendance/leaves/${paid.body.id}/approve`, {}).expect(201);
    await post(`/api/attendance/leaves/${paid.body.id}/approve`, {}).expect(400);
    await post(`/api/attendance/leaves/${unpaid.body.id}/approve`, {}).expect(201);
    const reg = await get(`/api/attendance/monthly?month=${k.month}`).expect(200);
    const m = reg.body.rows.find((r: { employee: { id: string } }) => r.employee.id === monthlyId);
    expect(m.marks['05']).toBe('L');
    expect(m.marks['08']).toBe('A');
  });

  it('records overtime that needs approval', async () => {
    const o = await post('/api/attendance/overtime', { employeeId: monthlyId, date: k.d(2), hours: '3' }).expect(201);
    expect(o.body.amount).toBe('600.00'); // 3 h x 200 default rate
    await post('/api/attendance/overtime', { employeeId: pieceId, date: k.d(2), hours: '2' }).expect(400); // no rate set
    const pending = await post('/api/attendance/overtime', { employeeId: monthlyId, date: k.d(3), hours: '1' }).expect(201);
    await post(`/api/attendance/overtime/${o.body.id}/approve`, {}).expect(201);
    await post(`/api/attendance/overtime/${pending.body.id}/reject`, {}).expect(201);
  });

  it('records per-piece production against order garments', async () => {
    const c = await post('/api/customers', { name: 'Payroll Customer', mobile: '0345-6660001' }).expect(201);
    const order = await post('/api/orders', { customerId: c.body.id, items: [{ garmentName: 'Shalwar Kameez', quantity: 3, stitchingPrice: '2500' }] }).expect(201);
    orderItemId = order.body.items[0].id;
    const found = await get(`/api/production/order-items?search=${order.body.orderNumber}`).expect(200);
    expect(found.body[0].items[0].id).toBe(orderItemId);
    const r = await post('/api/production', { employeeId: pieceId, orderItemId, taskType: 'STITCHING', quantity: 2, workDate: k.d(10) }).expect(201);
    await post('/api/production', { employeeId: pieceId, orderItemId, taskType: 'STITCHING', quantity: 2, workDate: k.d(11) }).expect(400); // only 3 pieces
    await post('/api/production', { employeeId: pieceId, orderItemId, taskType: 'STITCHING', quantity: 1, workDate: k.d(11), pieceRate: '600' }).expect(201);
    const extra = await post('/api/production', { employeeId: pieceId, orderItemId, taskType: 'PRESSING', quantity: 1, workDate: k.d(11) }).expect(201);
    await del(`/api/production/${extra.body.id}`).expect(200);
    const list = await get(`/api/production?employeeId=${pieceId}&month=${k.month}`).expect(200);
    expect(list.body.totals).toEqual({ pieces: 3, amount: '1600.00' }); // 2 x 500 + 1 x 600
    expect(r.body.id).toBeDefined();
  });

  it('gives advances with idempotency and instalments', async () => {
    const key = randomUUID();
    await post(`/api/employees/${monthlyId}/advances`, { amount: '5000', installmentAmount: '2000', advanceDate: k.d(12), idempotencyKey: key }).expect(201);
    await post(`/api/employees/${monthlyId}/advances`, { amount: '5000', installmentAmount: '2000', advanceDate: k.d(12), idempotencyKey: key }).expect(201);
    expect(await prisma.employeeAdvance.count({ where: { employeeId: monthlyId } })).toBe(1);
    await post(`/api/employees/${monthlyId}/advances`, { amount: '500', installmentAmount: '900', idempotencyKey: randomUUID() }).expect(400);
    const e = (await get(`/api/employees/${monthlyId}`).expect(200)).body;
    expect(e.advanceBalance).toBe('5000.00');
    expect(e.advances[0].advanceNo).toMatch(/^ADV-\d{4}-\d{5}$/);
  });

  it('calculates the monthly payroll', async () => {
    await post('/api/payroll', { periodKey: '2099-01' }).expect(400);
    const p = await post('/api/payroll', { periodKey: k.month }).expect(201);
    payrollId = p.body.id;
    expect(p.body.status).toBe('DRAFT');
    await post('/api/payroll', { periodKey: k.month }).expect(409);
    const item = (id: string) => p.body.items.find((i: { employee: { id: string } }) => i.employee.id === id);
    // Monthly: 30000, absent 1 (day 3) + unpaid leave 1 (day 8) + half day 0.5 = 2.5 days -> 30000 / days x 2.5
    const perDay = 30000 / k.days;
    const m = item(monthlyId);
    expect(m.basicAmount).toBe('30000.00');
    expect(m.absentDays).toBe('2.5');
    expect(Number(m.absenceDeduction)).toBeCloseTo(Math.round(perDay * 2.5 * 100) / 100, 2);
    expect(m.overtimeAmount).toBe('600.00');
    expect(m.advanceDeduction).toBe('2000.00');
    // Daily wage at the month's rate (1500; the 1800 raise starts today): 2 present + 1 half day = 2.5 days
    expect(item(dailyId).basicAmount).toBe('3750.00');
    // Per piece: 1600
    expect(item(pieceId)).toMatchObject({ pieceAmount: '1600.00', completedPieces: 3, grossAmount: '1600.00', netAmount: '1600.00' });
  });

  it('edits a draft line and blocks deductions bigger than the salary', async () => {
    const p = (await get(`/api/payroll/${payrollId}`).expect(200)).body;
    const line = p.items.find((i: { employee: { id: string } }) => i.employee.id === pieceId);
    const r = await patch(`/api/payroll/${payrollId}/items/${line.id}`, { bonus: '400', notes: 'Eid bonus' }).expect(200);
    expect(r.body.items.find((i: { id: string }) => i.id === line.id)).toMatchObject({ bonus: '400.00', netAmount: '2000.00', notes: 'Eid bonus' });
    await patch(`/api/payroll/${payrollId}/items/${line.id}`, { otherDeductions: '99999' }).expect(400);
    const m = p.items.find((i: { employee: { id: string } }) => i.employee.id === monthlyId);
    await patch(`/api/payroll/${payrollId}/items/${m.id}`, { advanceDeduction: '6000' }).expect(400);
    await patch(`/api/payroll/${payrollId}/items/${m.id}`, { advanceDeduction: '3000' }).expect(200);
    // Recalculate keeps the bonus
    const re = await post(`/api/payroll/${payrollId}/recalculate`, {}).expect(201);
    expect(re.body.items.find((i: { employee: { id: string } }) => i.employee.id === pieceId).bonus).toBe('400.00');
  });

  it('asks to recalculate when data changed, then approves and locks the month', async () => {
    await put('/api/attendance/daily', { date: k.d(15), entries: [{ employeeId: monthlyId, status: 'ABSENT' }] }).expect(200);
    await post(`/api/payroll/${payrollId}/approve`, {}).expect(409);
    await post(`/api/payroll/${payrollId}/recalculate`, {}).expect(201);
    const a = await post(`/api/payroll/${payrollId}/approve`, {}).expect(201);
    expect(a.body.status).toBe('APPROVED');
    // month locked
    await put('/api/attendance/daily', { date: k.d(16), entries: [{ employeeId: monthlyId, status: 'ABSENT' }] }).expect(400);
    await post('/api/production', { employeeId: pieceId, orderItemId, taskType: 'PRESSING', quantity: 1, workDate: k.d(16) }).expect(400);
    await patch(`/api/payroll/${payrollId}/items/${a.body.items[0].id}`, { bonus: '1' }).expect(400);
    // production is linked, advance recovered
    expect(await prisma.productionRecord.count({ where: { employeeId: pieceId, payrollItemId: null } })).toBe(0);
    const adv = await prisma.employeeAdvance.findFirstOrThrow({ where: { employeeId: monthlyId } });
    expect(adv.balanceAmount.toFixed(2)).toBe('3000.00');
    expect(adv.recoveredAmount.toFixed(2)).toBe('2000.00');
  });

  it('reopens (undoing approval) and approves again', async () => {
    await post(`/api/payroll/${payrollId}/reopen`, {}).expect(201);
    const adv = await prisma.employeeAdvance.findFirstOrThrow({ where: { employeeId: monthlyId } });
    expect(adv.balanceAmount.toFixed(2)).toBe('5000.00');
    expect(await prisma.productionRecord.count({ where: { employeeId: pieceId, payrollItemId: null } })).toBe(2);
    await post(`/api/payroll/${payrollId}/approve`, {}).expect(201);
  });

  it('pays salaries (part, full, pay-all) without double payments', async () => {
    const p = (await get(`/api/payroll/${payrollId}`).expect(200)).body;
    const m = p.items.find((i: { employee: { id: string } }) => i.employee.id === monthlyId);
    const key = randomUUID();
    await post(`/api/payroll/items/${m.id}/payments`, { amount: '10000', method: 'CASH', idempotencyKey: key }).expect(201);
    const again = await post(`/api/payroll/items/${m.id}/payments`, { amount: '10000', method: 'CASH', idempotencyKey: key }).expect(201);
    expect(again.body.status).toBe('PARTIALLY_PAID');
    await post(`/api/payroll/items/${m.id}/payments`, { amount: '999999', method: 'CASH', idempotencyKey: randomUUID() }).expect(400);
    await post(`/api/payroll/${payrollId}/reopen`, {}).expect(400);
    const all = await post(`/api/payroll/${payrollId}/pay-all`, { method: 'BANK_TRANSFER', idempotencyKey: randomUUID() }).expect(201);
    expect(all.body.status).toBe('PAID');
    expect(all.body.totals.balance).toBe('0.00');
    const payments = await get(`/api/payroll/${payrollId}/payments`).expect(200);
    expect(payments.body[0].paymentNo).toMatch(/^SAL-\d{4}-\d{5}$/);
    // salary payments are permanent (database trigger)
    await expect(prisma.salaryPayment.deleteMany({ where: { payrollItem: { payrollId } } })).rejects.toThrow();
    const slip = await get(`/api/payroll/items/${m.id}/payslip`).expect(200);
    expect(slip.body).toMatchObject({ paidAmount: m.netAmount, balance: '0.00' });
    expect(slip.body.recoveries[0].amount).toBe('2000.00');
    expect(slip.body.overtime).toHaveLength(1);
  });

  it('deletes only unused employees and limits roles', async () => {
    const e = await post('/api/employees', { name: 'Temp Person', employeeType: 'OTHER', joiningDate: k.today, salary: { salaryType: 'DAILY', dailyWage: '1000' } }).expect(201);
    await del(`/api/employees/${e.body.id}`).expect(200);
    await del(`/api/employees/${monthlyId}`).expect(400);
    await post(`/api/employees/${pieceId}/status`, { status: 'TERMINATED', date: k.today }).expect(201);
    const left = (await get(`/api/employees/${pieceId}`).expect(200)).body;
    expect(left).toMatchObject({ status: 'TERMINATED', leavingDate: k.today });
    const summary = await get('/api/employees/summary').expect(200);
    expect(summary.body.active).toBeGreaterThanOrEqual(2);

    // receptionist has no HR access; tailor can view production only
    const roles = await get('/api/roles').expect(200);
    const roleId = (code: string) => roles.body.find((r: { code: string }) => r.code === code).id;
    await post('/api/users', { fullName: 'Rec HR', email: 'rec.hr@test.local', username: 'rechr', password: 'RecHrPass123', roleIds: [roleId('RECEPTIONIST')] }).expect(201);
    const rec = await login(app, 'rechr', 'RecHrPass123');
    await get('/api/employees', rec).expect(403);
    await get('/api/payroll', rec).expect(403);
    await post('/api/users', { fullName: 'Tailor HR', email: 'tailor.hr@test.local', username: 'tailorhr', password: 'TailorHrPass123', roleIds: [roleId('TAILOR')] }).expect(201);
    const tailor = await login(app, 'tailorhr', 'TailorHrPass123');
    await get('/api/production', tailor).expect(200);
    await post('/api/production', { employeeId: dailyId, orderItemId, taskType: 'CUTTING', quantity: 1 }, tailor).expect(403);
  });
});
