import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Tenant } from '../../common/tenant';
import { Prisma } from '@prisma/client';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { RequestContext } from '../../common/types/auth-user';
import { MAX_MEASUREMENT, Unit, convertMeasurement } from '../../common/utils/units';
import { RecentQueryDto, SaveMeasurementDto } from './dto/measurement.dto';
import { fieldKey } from './templates.service';

const measurementInclude = {
  template: { select: { id: true, code: true, name: true, garmentCategory: true } },
  values: { include: { field: { select: { sortOrder: true } } } },
  createdBy: { select: { id: true, fullName: true } },
  customer: { select: { id: true, code: true, name: true, mobile: true } },
} satisfies Prisma.CustomerMeasurementInclude;

type MeasurementRow = Prisma.CustomerMeasurementGetPayload<{ include: typeof measurementInclude }>;

export function presentMeasurement(m: MeasurementRow) {
  const values = [...m.values]
    .sort((a, b) => (a.field?.sortOrder ?? 10_000) - (b.field?.sortOrder ?? 10_000) || a.fieldLabel.localeCompare(b.fieldLabel))
    .map((v) => ({
      fieldKey: v.fieldKey, fieldLabel: v.fieldLabel, isCustom: !v.fieldId,
      value: v.value === null ? null : v.value.toFixed(2), textValue: v.textValue,
    }));
  return {
    id: m.id, customer: m.customer, template: m.template, versionNo: m.versionNo, unit: m.unit, isLatest: m.isLatest,
    takenAt: m.takenAt, takenByName: m.takenByName, notes: m.notes, createdBy: m.createdBy, createdAt: m.createdAt, values,
  };
}

@Injectable()
export class MeasurementsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /**
   * Saves a NEW version. Earlier versions are never modified (only their "latest" flag
   * is cleared), which the database also enforces with a trigger.
   */
  async saveVersion(customerId: string, dto: SaveMeasurementDto, ctx: RequestContext) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (dto.id) {
      const existing = await this.prisma.customerMeasurement.findUnique({ where: { id: dto.id }, include: measurementInclude });
      if (existing) return presentMeasurement(existing); // idempotent re-submit (offline sync)
    }
    const template = await this.prisma.measurementTemplate.findUnique({ where: { id: dto.templateId }, include: { fields: true } });
    if (!template || !template.isActive) throw new BadRequestException('Select an active measurement template');

    const unit = dto.unit as Unit;
    const max = MAX_MEASUREMENT[unit];
    const activeFields = template.fields.filter((f) => f.isActive);
    const byKey = new Map(template.fields.map((f) => [f.key, f]));
    const errors: string[] = [];
    const rows: Prisma.MeasurementValueCreateWithoutMeasurementInput[] = [];
    const seen = new Set<string>();

    for (const v of dto.values) {
      const field = byKey.get(v.fieldKey);
      if (!field) { errors.push(`Unknown field "${v.fieldKey}"`); continue; }
      if (seen.has(field.key)) { errors.push(`${field.label} entered twice`); continue; }
      seen.add(field.key);
      if (v.value === undefined) continue;
      const num = new Prisma.Decimal(v.value);
      if (num.lte(0) || num.gt(max)) { errors.push(`${field.label} must be between 0 and ${max} ${unit === 'INCH' ? 'inches' : 'cm'}`); continue; }
      rows.push({ field: { connect: { id: field.id } }, fieldKey: field.key, fieldLabel: field.label, value: num });
    }
    for (const f of activeFields) {
      if (f.isRequired && !rows.some((r) => r.fieldKey === f.key)) errors.push(`${f.label} is required`);
    }
    for (const c of dto.customValues ?? []) {
      if (c.value === undefined && !c.textValue) continue;
      let key = `custom_${fieldKey(c.label)}`.slice(0, 40);
      let n = 2;
      while (seen.has(key) || byKey.has(key)) key = `custom_${fieldKey(c.label)}`.slice(0, 36) + `_${n++}`;
      seen.add(key);
      if (c.value !== undefined) {
        const num = new Prisma.Decimal(c.value);
        if (num.lte(0) || num.gt(max)) { errors.push(`${c.label} must be between 0 and ${max}`); continue; }
        rows.push({ fieldKey: key, fieldLabel: c.label, value: num, textValue: c.textValue || null });
      } else {
        rows.push({ fieldKey: key, fieldLabel: c.label, textValue: c.textValue });
      }
    }
    if (errors.length) throw new BadRequestException({ message: 'Please correct the measurements', details: errors });
    if (!rows.length) throw new BadRequestException('Enter at least one measurement');

    const saved = await this.prisma.$transaction(async (tx) => {
      // Serialise versions per customer so two devices cannot create the same version number.
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId}::uuid AND "companyId" = ${Tenant.require()}::uuid FOR UPDATE`;
      const last = await tx.customerMeasurement.aggregate({ where: { customerId, templateId: template.id }, _max: { versionNo: true } });
      await tx.customerMeasurement.updateMany({ where: { customerId, templateId: template.id, isLatest: true }, data: { isLatest: false } });
      const m = await tx.customerMeasurement.create({
        data: {
          id: dto.id, customerId, templateId: template.id, versionNo: (last._max.versionNo ?? 0) + 1, unit, isLatest: true,
          takenByName: dto.takenByName || null, notes: dto.notes || null, createdById: ctx.userId, values: { create: rows },
        },
        include: measurementInclude,
      });
      await this.audit.log({
        action: 'MEASUREMENT_SAVED', module: 'measurements', recordId: m.id,
        newValues: { customer: customer.code, template: template.name, version: m.versionNo, unit, values: rows.map((r) => `${r.fieldLabel}: ${r.value ?? r.textValue}`) },
      }, ctx, tx);
      return m;
    });
    return presentMeasurement(saved);
  }

  async history(customerId: string, templateId?: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, deletedAt: null }, select: { id: true } });
    if (!customer) throw new NotFoundException('Customer not found');
    const rows = await this.prisma.customerMeasurement.findMany({
      where: { customerId, ...(templateId ? { templateId } : {}) },
      include: measurementInclude,
      orderBy: [{ template: { name: 'asc' } }, { versionNo: 'desc' }],
    });
    return rows.map(presentMeasurement);
  }

  async get(id: string) {
    const m = await this.prisma.customerMeasurement.findUnique({ where: { id }, include: measurementInclude });
    if (!m) throw new NotFoundException('Measurement not found');
    return presentMeasurement(m);
  }

  /** Field-by-field comparison; the older version is converted to the newer version's unit. */
  async compare(fromId: string, toId: string) {
    const [a, b] = await Promise.all([this.get(fromId), this.get(toId)]);
    if (a.customer.id !== b.customer.id) throw new BadRequestException('Only versions of the same customer can be compared');
    const unit = b.unit as Unit;
    const keys = [...new Set([...b.values.map((v) => v.fieldKey), ...a.values.map((v) => v.fieldKey)])];
    const fields = keys.map((key) => {
      const av = a.values.find((v) => v.fieldKey === key);
      const bv = b.values.find((v) => v.fieldKey === key);
      const from = av?.value != null ? convertMeasurement(av.value, a.unit as Unit, unit) : null;
      const to = bv?.value != null ? new Prisma.Decimal(bv.value) : null;
      const diff = from && to ? to.minus(from) : null;
      return {
        fieldKey: key, fieldLabel: bv?.fieldLabel ?? av?.fieldLabel ?? key,
        from: from?.toFixed(2) ?? null, to: to?.toFixed(2) ?? null,
        fromText: av?.textValue ?? null, toText: bv?.textValue ?? null,
        difference: diff?.toFixed(2) ?? null,
        changed: (from?.toFixed(2) ?? null) !== (to?.toFixed(2) ?? null) || (av?.textValue ?? null) !== (bv?.textValue ?? null),
      };
    });
    return {
      unit,
      from: { id: a.id, versionNo: a.versionNo, unit: a.unit, takenAt: a.takenAt, template: a.template },
      to: { id: b.id, versionNo: b.versionNo, unit: b.unit, takenAt: b.takenAt, template: b.template },
      sameTemplate: a.template.id === b.template.id,
      fields,
    };
  }

  async recent(q: RecentQueryDto) {
    const where: Prisma.CustomerMeasurementWhereInput = {
      ...(q.latestOnly !== false ? { isLatest: true } : {}),
      ...(q.templateId ? { templateId: q.templateId } : {}),
      customer: {
        deletedAt: null,
        ...(q.search ? { OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          { code: { contains: q.search, mode: 'insensitive' } },
          { mobile: { contains: q.search.replace(/\D/g, '').replace(/^0/, '') || q.search } },
        ] } : {}),
      },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customerMeasurement.findMany({
        where, orderBy: { takenAt: q.sortOrder }, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        select: {
          id: true, versionNo: true, unit: true, takenAt: true, takenByName: true, isLatest: true,
          template: { select: { id: true, name: true } }, customer: { select: { id: true, code: true, name: true, mobile: true } },
          _count: { select: { values: true } },
        },
      }),
      this.prisma.customerMeasurement.count({ where }),
    ]);
    return paginate(rows, total, q);
  }
}
