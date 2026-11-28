import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Company, CompanyStatus, Plan, Prisma } from '@prisma/client';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { Tenant } from '../../common/tenant';
import { AuthUser, RequestContext } from '../../common/types/auth-user';
import { karachiToday } from '../../common/utils/date-range';
import { moneyString } from '../../common/utils/money';
import { PasswordService, passwordPolicyError } from '../auth/password.service';
import { SessionService } from '../auth/session.service';
import {
  CompanyListQueryDto, CreateCompanyDto, PaymentListQueryDto, PlanDto, RecordCompanyPaymentDto, UpdateCompanyDto, UpdatePlanDto,
} from './dto/platform.dto';
import { TRIAL_DAYS, asDb, createOwner, provisionCompany, slugify } from './provisioning';
import { enabledModules, subscriptionState } from './subscription';

const DAY = 86_400_000;
const asDate = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
/** End of a Karachi calendar day, so "paid until 30 Nov" includes all of 30 Nov. */
const endOfDay = (s: string) => new Date(`${s.slice(0, 10)}T23:59:59+05:00`);

function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  const day = x.getUTCDate();
  x.setUTCMonth(x.getUTCMonth() + months);
  if (x.getUTCDate() < day) x.setUTCDate(0); // 31 Jan + 1 month = 28/29 Feb
  return x;
}

/** TailoringERP platform (Super Admin): companies, plans, subscriptions and support access. */
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  // ------------------------------------------------------------------ overview

  async overview() {
    const companies = await this.prisma.company.findMany({ include: { plan: true } });
    const now = new Date();
    const states = companies.map((c) => ({ c, st: subscriptionState(c, now) }));
    const monthStart = asDate(`${karachiToday().slice(0, 7)}-01`);
    const [paidThisMonth, users, recent] = await Promise.all([
      this.prisma.companyPayment.aggregate({ where: { paidAt: { gte: monthStart } }, _sum: { amount: true }, _count: true }),
      this.prisma.user.count({ where: { deletedAt: null, isActive: true, isSuperAdmin: false } }),
      this.prisma.companyPayment.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { company: { select: { name: true } } } }),
    ]);
    const expiring = states.filter(({ c, st }) => c.status !== 'SUSPENDED' && st.daysLeft !== null && st.daysLeft >= 0 && st.daysLeft <= 7);
    const monthly = states
      .filter(({ c, st }) => c.status === 'ACTIVE' && st.access !== 'READ_ONLY')
      .reduce((t, { c }) => t + Number(c.plan.monthlyPrice), 0);
    return {
      companies: companies.length,
      active: companies.filter((c) => c.status === 'ACTIVE').length,
      trial: companies.filter((c) => c.status === 'TRIAL').length,
      suspended: companies.filter((c) => c.status === 'SUSPENDED').length,
      readOnly: states.filter(({ st }) => st.access === 'READ_ONLY').length,
      grace: states.filter(({ st }) => st.access === 'GRACE').length,
      expiringSoon: expiring.map(({ c, st }) => ({ id: c.id, name: c.name, status: c.status, endsAt: st.endsAt, daysLeft: st.daysLeft })),
      monthlyRecurring: moneyString(monthly),
      paidThisMonth: moneyString(paidThisMonth._sum.amount ?? 0),
      paymentsThisMonth: paidThisMonth._count,
      activeUsers: users,
      recentPayments: recent.map((p) => ({ id: p.id, company: p.company.name, amount: moneyString(p.amount), months: p.months, method: p.method, paidAt: ymd(p.paidAt) })),
    };
  }

  // ------------------------------------------------------------------ companies

  async listCompanies(q: CompanyListQueryDto) {
    const where: Prisma.CompanyWhereInput = {
      ...(q.search ? { OR: [
        { name: { contains: q.search, mode: 'insensitive' } }, { code: { contains: q.search, mode: 'insensitive' } },
        { phone: { contains: q.search } }, { ownerName: { contains: q.search, mode: 'insensitive' } }, { city: { contains: q.search, mode: 'insensitive' } },
      ] } : {}),
      ...(q.status && ['TRIAL', 'ACTIVE', 'SUSPENDED'].includes(q.status) ? { status: q.status as CompanyStatus } : {}),
    };
    let rows = await this.prisma.company.findMany({ where, include: { plan: true }, orderBy: { createdAt: q.sortOrder } });
    const now = new Date();
    if (q.status === 'EXPIRING') rows = rows.filter((c) => { const st = subscriptionState(c, now); return c.status !== 'SUSPENDED' && st.daysLeft !== null && st.daysLeft <= 7; });
    if (q.status === 'READ_ONLY') rows = rows.filter((c) => subscriptionState(c, now).access === 'READ_ONLY');
    const total = rows.length;
    const page = rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    const ids = page.map((c) => c.id);
    const userCounts = await this.prisma.user.groupBy({ by: ['companyId'], where: { companyId: { in: ids }, deletedAt: null, isActive: true }, _count: { _all: true }, _max: { lastLoginAt: true } });
    const uc = new Map(userCounts.map((u) => [u.companyId, u]));
    return paginate(page.map((c) => ({
      ...this.present(c, now),
      activeUsers: uc.get(c.id)?._count._all ?? 0,
      lastLoginAt: uc.get(c.id)?._max.lastLoginAt ?? null,
    })), total, q);
  }

  private present(c: Company & { plan: Plan }, now = new Date()) {
    const st = subscriptionState(c, now);
    return {
      id: c.id, code: c.code, name: c.name, ownerName: c.ownerName, phone: c.phone, email: c.email, address: c.address, city: c.city,
      docPrefix: c.docPrefix, status: c.status, access: st.access, endsAt: st.endsAt, graceEndsAt: st.graceEndsAt, daysLeft: st.daysLeft,
      trialEndsAt: c.trialEndsAt, paidUntil: c.paidUntil, graceDays: c.graceDays, notes: c.notes, suspendedReason: c.suspendedReason,
      createdAt: c.createdAt, updatedAt: c.updatedAt,
      plan: { id: c.plan.id, code: c.plan.code, name: c.plan.name, monthlyPrice: moneyString(c.plan.monthlyPrice), maxUsers: c.plan.maxUsers },
      modules: enabledModules(c.plan.modules),
    };
  }

  private async findCompany(id: string) {
    const c = await this.prisma.company.findUnique({ where: { id }, include: { plan: true } });
    if (!c) throw new NotFoundException('Company not found');
    return c;
  }

  async getCompany(id: string) {
    const c = await this.findCompany(id);
    const [users, payments, usage] = await Promise.all([
      this.prisma.user.findMany({
        where: { companyId: id, deletedAt: null }, orderBy: { createdAt: 'asc' },
        select: { id: true, fullName: true, username: true, email: true, isActive: true, lastLoginAt: true, roles: { select: { role: { select: { code: true, name: true } } } } },
      }),
      this.prisma.companyPayment.findMany({ where: { companyId: id }, orderBy: { paidAt: 'desc' } }),
      Tenant.run(id, async () => ({
        customers: await this.prisma.customer.count({ where: { deletedAt: null } }),
        orders: await this.prisma.order.count({ where: { deletedAt: null } }),
        employees: await this.prisma.employee.count({ where: { deletedAt: null } }),
      })),
    ]);
    return {
      ...this.present(c),
      users: users.map((u) => ({ ...u, roles: u.roles.map((r) => r.role) })),
      payments: payments.map((p) => this.presentPayment(p)),
      usage,
    };
  }

  async createCompany(dto: CreateCompanyDto, actor: AuthUser, ctx: RequestContext) {
    const policy = passwordPolicyError(dto.owner.password);
    if (policy) throw new BadRequestException(`Owner password: ${policy}`);
    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan || !plan.isActive) throw new BadRequestException('Choose an active plan');
    const code = dto.code ?? (await this.freeCode(slugify(dto.name)));
    if (await this.prisma.company.findUnique({ where: { code } })) throw new ConflictException(`The company code "${code}" is already used`);
    const email = dto.owner.email.trim().toLowerCase();
    const username = dto.owner.username.trim().toLowerCase();
    const taken = await this.prisma.user.findFirst({ where: { OR: [{ email: { equals: email, mode: 'insensitive' } }, { username: { equals: username, mode: 'insensitive' } }] } });
    if (taken) throw new ConflictException('This owner email or username is already used. Usernames are unique across TailoringERP.');

    const trial = dto.trial ?? true;
    const now = new Date();
    const docPrefix = (dto.docPrefix ?? dto.name.replace(/[^A-Za-z]/g, '').slice(0, 2)).toUpperCase() || 'TE';
    const company = await this.prisma.company.create({
      data: {
        code, name: dto.name.trim(), ownerName: dto.ownerName?.trim() || dto.owner.fullName.trim(), phone: dto.phone?.trim() || null,
        email: dto.email?.trim().toLowerCase() || email, address: dto.address?.trim() || null, city: dto.city?.trim() || null,
        docPrefix, planId: plan.id, status: trial ? 'TRIAL' : 'ACTIVE',
        trialEndsAt: trial ? new Date(now.getTime() + (dto.trialDays ?? TRIAL_DAYS) * DAY) : null,
        paidUntil: !trial && dto.paidUntil ? endOfDay(dto.paidUntil) : null,
      },
      include: { plan: true },
    });
    try {
      const db = asDb(this.prisma);
      await Tenant.run(company.id, async () => {
        await provisionCompany(db, { docPrefix });
        await createOwner(db, { ...dto.owner, email, username });
      });
    } catch (e) {
      // Never leave a half-made company behind.
      await this.removeCompanyData(company.id).catch(() => undefined);
      throw e;
    }
    await this.audit.log({ action: 'COMPANY_CREATED', module: 'platform', recordId: company.id, newValues: { code, name: company.name, plan: plan.code, trial, owner: username } }, ctx);
    return this.getCompany(company.id);
  }

  private async freeCode(base: string): Promise<string> {
    let code = base;
    for (let n = 2; await this.prisma.company.findUnique({ where: { code } }); n++) code = `${base.slice(0, 26)}-${n}`;
    return code;
  }

  /** Only used to undo a failed company creation (the company has no business records yet). */
  private async removeCompanyData(companyId: string) {
    await this.prisma.$transaction(async (tx) => {
      const tables = ['user_roles', 'role_permissions', 'users', 'roles', 'measurement_fields', 'garments', 'measurement_templates', 'workflow_stages', 'fabric_categories', 'system_settings', 'audit_logs', 'login_attempts', 'sessions'];
      await tx.$executeRawUnsafe('ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_append_only');
      for (const t of tables) await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "companyId" = $1::uuid`, companyId);
      await tx.$executeRawUnsafe('ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_append_only');
      await tx.company.delete({ where: { id: companyId } });
    });
  }

  async updateCompany(id: string, dto: UpdateCompanyDto, ctx: RequestContext) {
    const before = await this.findCompany(id);
    if (dto.planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
      if (!plan) throw new BadRequestException('Plan not found');
      if (dto.planId !== before.planId) {
        const active = await this.prisma.user.count({ where: { companyId: id, deletedAt: null, isActive: true } });
        if (active > plan.maxUsers) throw new BadRequestException(`This company has ${active} active users; the ${plan.name} plan allows ${plan.maxUsers}. Deactivate users first.`);
      }
    }
    const data: Prisma.CompanyUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim() || before.name;
    for (const k of ['ownerName', 'phone', 'email', 'address', 'city', 'notes'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k]?.trim() || null;
    }
    if (dto.planId) data.planId = dto.planId;
    if (dto.graceDays !== undefined) data.graceDays = dto.graceDays;
    if (dto.status && before.status !== 'SUSPENDED') data.status = dto.status;
    if (dto.trialEndsAt !== undefined) data.trialEndsAt = dto.trialEndsAt ? endOfDay(dto.trialEndsAt) : null;
    if (dto.paidUntil !== undefined) data.paidUntil = dto.paidUntil ? endOfDay(dto.paidUntil) : null;
    if (dto.noExpiry) data.paidUntil = null;
    const after = await this.prisma.company.update({ where: { id }, data, include: { plan: true } });
    await this.audit.log({
      action: 'COMPANY_UPDATED', module: 'platform', recordId: id,
      oldValues: { name: before.name, plan: before.plan.code, status: before.status, trialEndsAt: ymd(before.trialEndsAt), paidUntil: ymd(before.paidUntil), graceDays: before.graceDays },
      newValues: { name: after.name, plan: after.plan.code, status: after.status, trialEndsAt: ymd(after.trialEndsAt), paidUntil: ymd(after.paidUntil), graceDays: after.graceDays },
    }, ctx);
    return this.getCompany(id);
  }

  async suspend(id: string, reason: string, ctx: RequestContext) {
    const c = await this.findCompany(id);
    if (c.status === 'SUSPENDED') throw new BadRequestException('This company is already suspended');
    // Remember what to go back to on activation.
    const resumeAs = c.trialEndsAt && !c.paidUntil && c.status === 'TRIAL' ? 'TRIAL' : 'ACTIVE';
    await this.prisma.company.update({ where: { id }, data: { status: 'SUSPENDED', suspendedReason: reason.trim(), notes: c.notes } });
    // Everyone of that company is logged out at once.
    const r = await this.prisma.session.updateMany({ where: { companyId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ action: 'COMPANY_SUSPENDED', module: 'platform', recordId: id, newValues: { reason, sessionsEnded: r.count, resumeAs } }, ctx);
    return this.getCompany(id);
  }

  async activate(id: string, ctx: RequestContext) {
    const c = await this.findCompany(id);
    if (c.status !== 'SUSPENDED') throw new BadRequestException('This company is not suspended');
    const status: CompanyStatus = c.paidUntil || !c.trialEndsAt ? 'ACTIVE' : 'TRIAL';
    await this.prisma.company.update({ where: { id }, data: { status, suspendedReason: null } });
    await this.audit.log({ action: 'COMPANY_ACTIVATED', module: 'platform', recordId: id, newValues: { status } }, ctx);
    return this.getCompany(id);
  }

  async resetOwnerPassword(id: string, password: string, ctx: RequestContext) {
    const policy = passwordPolicyError(password);
    if (policy) throw new BadRequestException(policy);
    await this.findCompany(id);
    const owner = await this.prisma.user.findFirst({
      where: { companyId: id, deletedAt: null, roles: { some: { role: { code: 'OWNER' } } } }, orderBy: { createdAt: 'asc' },
    });
    if (!owner) throw new NotFoundException('This company has no Owner login');
    await this.prisma.user.update({
      where: { id: owner.id },
      data: { passwordHash: await this.passwords.hash(password), passwordChangedAt: new Date(), isActive: true, lockedUntil: null, failedLoginAttempts: 0 },
    });
    await this.sessions.revokeAllForUser(owner.id);
    await this.audit.log({ action: 'OWNER_PASSWORD_RESET', module: 'platform', recordId: id, newValues: { username: owner.username } }, ctx);
    return { success: true, username: owner.username };
  }

  // ------------------------------------------------------------------ support access ("login as")

  async enter(id: string, user: AuthUser, ctx: RequestContext) {
    const c = await this.findCompany(id);
    await this.sessions.setActingCompany(user.sessionId, c.id);
    await this.audit.log({ action: 'SUPPORT_ACCESS_STARTED', module: 'platform', recordId: c.id, newValues: { company: c.name, by: user.username } }, ctx);
    // Also visible in the company's own audit log.
    await Tenant.run(c.id, () => this.audit.log({ action: 'SUPPORT_ACCESS_STARTED', module: 'platform', recordId: c.id, newValues: { by: `${user.fullName} (TailoringERP support)` } }, ctx));
    return { success: true, company: { id: c.id, name: c.name } };
  }

  async exit(user: AuthUser, ctx: RequestContext) {
    if (user.companyId) {
      const companyId = user.companyId;
      await Tenant.run(companyId, () => this.audit.log({ action: 'SUPPORT_ACCESS_ENDED', module: 'platform', recordId: companyId, newValues: { by: `${user.fullName} (TailoringERP support)` } }, ctx));
    }
    await this.sessions.setActingCompany(user.sessionId, null);
    await this.audit.log({ action: 'SUPPORT_ACCESS_ENDED', module: 'platform', recordId: user.companyId, newValues: { by: user.username } }, ctx);
    return { success: true };
  }

  // ------------------------------------------------------------------ payments

  private presentPayment(p: { id: string; companyId: string; amount: Prisma.Decimal; months: number; method: string; reference: string | null; paidAt: Date; periodFrom: Date; periodTo: Date; notes: string | null; createdAt: Date; company?: { name: string; code: string } }) {
    return {
      id: p.id, companyId: p.companyId, company: p.company?.name, companyCode: p.company?.code, amount: moneyString(p.amount), months: p.months, method: p.method,
      reference: p.reference, paidAt: ymd(p.paidAt), periodFrom: ymd(p.periodFrom), periodTo: ymd(p.periodTo), notes: p.notes, createdAt: p.createdAt,
    };
  }

  /**
   * A company paid (JazzCash / EasyPaisa / bank / cash): extends "paid until" by the months paid,
   * starting from today or from the current end date (whichever is later). Trial -> Active.
   */
  async recordPayment(id: string, dto: RecordCompanyPaymentDto, user: AuthUser, ctx: RequestContext) {
    const c = await this.findCompany(id);
    const today = karachiToday();
    const paidAt = dto.paidAt ?? today;
    if (paidAt > today) throw new BadRequestException('Payment date cannot be in the future');
    // Karachi calendar day the current paid period ends on; the new period starts the day after.
    const paidEndDay = c.paidUntil ? karachiToday(c.paidUntil) : null;
    const fromDay = paidEndDay && paidEndDay >= today ? ymd(new Date(asDate(paidEndDay).getTime() + DAY))! : today;
    const toDay = ymd(new Date(addMonths(asDate(fromDay), dto.months).getTime() - DAY))!;
    const result = await this.prisma.$transaction(async (tx) => {
      const p = await tx.companyPayment.create({
        data: {
          companyId: id, amount: new Prisma.Decimal(dto.amount), months: dto.months, method: dto.method, reference: dto.reference?.trim() || null,
          paidAt: asDate(paidAt), periodFrom: asDate(fromDay), periodTo: asDate(toDay), notes: dto.notes?.trim() || null, recordedById: user.id,
        },
      });
      await tx.company.update({
        where: { id },
        data: { paidUntil: endOfDay(toDay), ...(c.status === 'SUSPENDED' ? {} : { status: 'ACTIVE' }) },
      });
      return p;
    });
    await this.audit.log({ action: 'COMPANY_PAYMENT', module: 'platform', recordId: id, newValues: { amount: dto.amount, months: dto.months, method: dto.method, paidUntil: toDay } }, ctx);
    return { payment: this.presentPayment(result), company: await this.getCompany(id) };
  }

  async listPayments(q: PaymentListQueryDto) {
    const where: Prisma.CompanyPaymentWhereInput = {
      ...(q.companyId ? { companyId: q.companyId } : {}),
      ...(q.search ? { OR: [{ reference: { contains: q.search, mode: 'insensitive' } }, { company: { name: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total, sum] = await Promise.all([
      this.prisma.companyPayment.findMany({ where, orderBy: [{ paidAt: q.sortOrder }, { createdAt: q.sortOrder }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { company: { select: { name: true, code: true } } } }),
      this.prisma.companyPayment.count({ where }),
      this.prisma.companyPayment.aggregate({ where, _sum: { amount: true } }),
    ]);
    return { ...paginate(rows.map((p) => this.presentPayment(p)), total, q), totalAmount: moneyString(sum._sum.amount ?? 0) };
  }

  // ------------------------------------------------------------------ plans

  async listPlans() {
    const plans = await this.prisma.plan.findMany({ orderBy: [{ sortOrder: 'asc' }, { monthlyPrice: 'asc' }], include: { _count: { select: { companies: true } } } });
    return plans.map((p) => ({ ...p, monthlyPrice: moneyString(p.monthlyPrice), companies: p._count.companies, allModules: enabledModules(p.modules), _count: undefined }));
  }

  async createPlan(dto: PlanDto, ctx: RequestContext) {
    if (await this.prisma.plan.findUnique({ where: { code: dto.code } })) throw new ConflictException(`Plan code ${dto.code} is already used`);
    const p = await this.prisma.plan.create({ data: { ...dto, monthlyPrice: new Prisma.Decimal(dto.monthlyPrice), sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true } });
    await this.audit.log({ action: 'PLAN_CREATED', module: 'platform', recordId: p.id, newValues: dto }, ctx);
    return p;
  }

  async updatePlan(id: string, dto: UpdatePlanDto, ctx: RequestContext) {
    const before = await this.prisma.plan.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Plan not found');
    const p = await this.prisma.plan.update({
      where: { id },
      data: { ...dto, ...(dto.monthlyPrice !== undefined ? { monthlyPrice: new Prisma.Decimal(dto.monthlyPrice) } : {}) },
    });
    await this.audit.log({ action: 'PLAN_UPDATED', module: 'platform', recordId: id, oldValues: { ...before, monthlyPrice: moneyString(before.monthlyPrice) }, newValues: dto }, ctx);
    return p;
  }

  /** Platform activity: Super Admin actions and logins (records without a company). */
  async auditLogs(q: PaymentListQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      companyId: null,
      ...(q.search ? { OR: [{ action: { contains: q.search, mode: 'insensitive' } }, { module: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: q.sortOrder }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { user: { select: { fullName: true, username: true } } } }),
      this.prisma.auditLog.count({ where }),
    ]);
    const companyIds = [...new Set(rows.map((r) => r.recordId).filter((x): x is string => !!x && /^[0-9a-f-]{36}$/.test(x)))];
    const names = new Map((await this.prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
    return paginate(rows.map((r) => ({
      id: r.id, action: r.action, module: r.module, recordId: r.recordId, company: r.recordId ? names.get(r.recordId) ?? null : null,
      newValues: r.newValues, user: r.user?.fullName ?? null, ipAddress: r.ipAddress, createdAt: r.createdAt,
    })), total, q);
  }

  /** Companies for the support "Open company" picker. */
  async companyOptions() {
    const rows = await this.prisma.company.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, status: true } });
    return rows;
  }
}
