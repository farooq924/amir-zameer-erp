import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { RequestContext } from '../../common/types/auth-user';
import { CreateTemplateDto, TemplateFieldInput, UpdateTemplateDto } from './dto/measurement.dto';

const templateInclude = { fields: { orderBy: { sortOrder: 'asc' } } } satisfies Prisma.MeasurementTemplateInclude;

export function fieldKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'field';
}

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  list(includeInactive = false) {
    return this.prisma.measurementTemplate.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: includeInactive ? templateInclude : { fields: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async get(id: string) {
    const t = await this.prisma.measurementTemplate.findUnique({ where: { id }, include: templateInclude });
    if (!t) throw new NotFoundException('Measurement template not found');
    return t;
  }

  async create(dto: CreateTemplateDto, ctx: RequestContext) {
    if (!dto.fields.length) throw new BadRequestException('Add at least one measurement field');
    const code = `CUSTOM_${fieldKey(dto.name).toUpperCase()}`.slice(0, 40);
    if (await this.prisma.measurementTemplate.findFirst({ where: { OR: [{ code }, { name: { equals: dto.name, mode: 'insensitive' } }] } })) {
      throw new ConflictException('A template with this name already exists');
    }
    const fields = this.buildNewFields(dto.fields, new Set());
    const t = await this.prisma.$transaction(async (tx) => {
      const created = await tx.measurementTemplate.create({
        data: { code, name: dto.name, garmentCategory: dto.garmentCategory, defaultUnit: dto.defaultUnit ?? 'INCH', fields: { create: fields } },
        include: templateInclude,
      });
      await this.audit.log({ action: 'CREATE', module: 'measurements', recordId: created.id, newValues: { template: created.name, fields: fields.map((f) => f.label) } }, ctx, tx);
      return created;
    });
    return t;
  }

  /** Fields are never deleted (old measurements reference them); missing fields are deactivated. */
  async update(id: string, dto: UpdateTemplateDto, ctx: RequestContext) {
    const before = await this.get(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.measurementTemplate.update({ where: { id }, data: { name: dto.name, defaultUnit: dto.defaultUnit, isActive: dto.isActive } });
      if (dto.fields) {
        const existingById = new Map(before.fields.map((f) => [f.id, f]));
        const keepIds = new Set<string>();
        const usedKeys = new Set(before.fields.map((f) => f.key));
        for (const [i, f] of dto.fields.entries()) {
          const sortOrder = (i + 1) * 10;
          if (f.id) {
            if (!existingById.has(f.id)) throw new BadRequestException('A field does not belong to this template');
            keepIds.add(f.id);
            await tx.measurementField.update({
              where: { id: f.id },
              data: { label: f.label, isRequired: f.isRequired ?? false, isActive: f.isActive ?? true, sortOrder },
            });
          } else {
            const [nf] = this.buildNewFields([f], usedKeys);
            await tx.measurementField.create({ data: { ...nf, sortOrder, templateId: id } });
          }
        }
        const removed = before.fields.filter((f) => !keepIds.has(f.id) && f.isActive);
        if (removed.length) await tx.measurementField.updateMany({ where: { id: { in: removed.map((f) => f.id) } }, data: { isActive: false } });
      }
      const after = await tx.measurementTemplate.findUniqueOrThrow({ where: { id }, include: templateInclude });
      if (!after.fields.some((f) => f.isActive)) throw new BadRequestException('A template needs at least one active field');
      await this.audit.log({
        action: 'TEMPLATE_CHANGED', module: 'measurements', recordId: id,
        oldValues: { name: before.name, fields: before.fields.map((f) => `${f.label}${f.isActive ? '' : ' (inactive)'}`) },
        newValues: { name: after.name, fields: after.fields.map((f) => `${f.label}${f.isActive ? '' : ' (inactive)'}`) },
      }, ctx, tx);
    });
    return this.get(id);
  }

  private buildNewFields(inputs: TemplateFieldInput[], used: Set<string>) {
    return inputs.map((f, i) => {
      let key = fieldKey(f.label);
      let n = 2;
      while (used.has(key)) key = `${fieldKey(f.label).slice(0, 36)}_${n++}`;
      used.add(key);
      return { key, label: f.label, isRequired: f.isRequired ?? false, isActive: f.isActive ?? true, sortOrder: (i + 1) * 10 };
    });
  }
}
