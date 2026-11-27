import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { GarmentType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { RequestContext } from '../../common/types/auth-user';
import { moneyString } from '../../common/utils/money';
import { CreateGarmentDto, UpdateGarmentDto } from './dto/garment.dto';

const include = { measurementTemplate: { select: { id: true, code: true, name: true } } } satisfies Prisma.GarmentTypeInclude;
type Row = Prisma.GarmentTypeGetPayload<{ include: typeof include }>;

export function presentGarment(g: Row | (GarmentType & { measurementTemplate?: Row['measurementTemplate'] })) {
  return {
    id: g.id, code: g.code, name: g.name, category: g.category, isActive: g.isActive,
    measurementTemplate: g.measurementTemplate ?? null,
    defaultStitchingPrice: moneyString(g.defaultStitchingPrice),
    defaultFabricConsumption: g.defaultFabricConsumption.toFixed(3),
    defaultPieceRate: moneyString(g.defaultPieceRate),
  };
}

function codeFrom(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) || 'GARMENT';
}

@Injectable()
export class GarmentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(includeInactive: boolean) {
    const rows = await this.prisma.garmentType.findMany({
      where: includeInactive ? {} : { isActive: true }, include, orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    const usage = await this.prisma.orderItem.groupBy({ by: ['garmentTypeId'], where: { garmentTypeId: { in: rows.map((r) => r.id) } }, _sum: { quantity: true } });
    const used = new Map(usage.map((u) => [u.garmentTypeId, u._sum.quantity ?? 0]));
    return rows.map((r) => ({ ...presentGarment(r), piecesOrdered: used.get(r.id) ?? 0 }));
  }

  private async checkTemplate(id: string | null | undefined) {
    if (!id) return;
    const t = await this.prisma.measurementTemplate.findUnique({ where: { id } });
    if (!t) throw new BadRequestException('Select a valid measurement template');
  }

  private async assertUniqueName(name: string, excludeId?: string) {
    const dup = await this.prisma.garmentType.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (dup) throw new ConflictException(`A garment named "${dup.name}" already exists`);
  }

  async create(dto: CreateGarmentDto, ctx: RequestContext) {
    await this.checkTemplate(dto.measurementTemplateId);
    await this.assertUniqueName(dto.name);
    let code = codeFrom(dto.name);
    for (let n = 2; await this.prisma.garmentType.findUnique({ where: { code } }); n++) code = `${codeFrom(dto.name).slice(0, 30)}_${n}`;
    const g = await this.prisma.$transaction(async (tx) => {
      const created = await tx.garmentType.create({
        data: {
          code, name: dto.name, category: dto.category, measurementTemplateId: dto.measurementTemplateId ?? null,
          defaultStitchingPrice: dto.defaultStitchingPrice ?? '0', defaultFabricConsumption: dto.defaultFabricConsumption ?? '0',
          defaultPieceRate: dto.defaultPieceRate ?? '0', isActive: dto.isActive ?? true,
        },
        include,
      });
      await this.audit.log({ action: 'CREATE', module: 'garments', recordId: created.id, newValues: presentGarment(created) }, ctx, tx);
      return created;
    });
    return presentGarment(g);
  }

  async update(id: string, dto: UpdateGarmentDto, ctx: RequestContext) {
    const before = await this.prisma.garmentType.findUnique({ where: { id }, include });
    if (!before) throw new NotFoundException('Garment not found');
    if (dto.measurementTemplateId !== undefined) await this.checkTemplate(dto.measurementTemplateId);
    if (dto.name && dto.name.toLowerCase() !== before.name.toLowerCase()) await this.assertUniqueName(dto.name, id);
    const g = await this.prisma.$transaction(async (tx) => {
      const after = await tx.garmentType.update({
        where: { id },
        data: {
          name: dto.name, category: dto.category, measurementTemplateId: dto.measurementTemplateId,
          defaultStitchingPrice: dto.defaultStitchingPrice, defaultFabricConsumption: dto.defaultFabricConsumption,
          defaultPieceRate: dto.defaultPieceRate, isActive: dto.isActive,
        },
        include,
      });
      await this.audit.log({ action: 'UPDATE', module: 'garments', recordId: id, oldValues: presentGarment(before), newValues: presentGarment(after) }, ctx, tx);
      return after;
    });
    return presentGarment(g);
  }
}
