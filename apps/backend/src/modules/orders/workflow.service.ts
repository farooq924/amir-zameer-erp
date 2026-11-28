import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { byCompany } from '../../common/tenant';
import { STAGE_CANCELLED, STAGE_DELIVERED, STAGE_NEW } from '@az/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { RequestContext } from '../../common/types/auth-user';
import { ReorderStagesDto, StageDto, UpdateStageDto } from './dto/order.dto';

/** Configurable production workflow (New Order -> ... -> Ready). Delivered and Cancelled are fixed final stages. */
@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(includeInactive = true) {
    const [stages, counts] = await Promise.all([
      this.prisma.workflowStage.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.orderItem.groupBy({ by: ['stageId'], where: { order: { deletedAt: null, lifecycle: { in: ['OPEN', 'PARTIALLY_DELIVERED'] } } }, _count: { _all: true } }),
    ]);
    const used = new Map(counts.map((c) => [c.stageId, c._count._all]));
    return stages.map((s) => ({
      id: s.id, code: s.code, name: s.name, color: s.color, sortOrder: s.sortOrder, isTerminal: s.isTerminal, isSystem: s.isSystem,
      isActive: s.isActive, openItems: used.get(s.id) ?? 0,
    }));
  }

  async create(dto: StageDto, ctx: RequestContext) {
    await this.assertUniqueName(dto.name);
    const last = await this.prisma.workflowStage.findFirst({ where: { isTerminal: false }, orderBy: { sortOrder: 'desc' } });
    const base = dto.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'STAGE';
    let code = base;
    for (let n = 2; await this.prisma.workflowStage.findUnique({ where: { companyId_code: byCompany({ code }) } }); n++) code = `${base}_${n}`;
    const stage = await this.prisma.$transaction(async (tx) => {
      // New stages go just before the final stages (Delivered / Cancelled).
      const s = await tx.workflowStage.create({ data: { code, name: dto.name, color: dto.color ?? 'slate', sortOrder: (last?.sortOrder ?? 0) + 5 } });
      await this.audit.log({ action: 'CREATE', module: 'orders', recordId: s.id, newValues: { workflowStage: s } }, ctx, tx);
      return s;
    });
    return stage;
  }

  async update(id: string, dto: UpdateStageDto, ctx: RequestContext) {
    const s = await this.prisma.workflowStage.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Stage not found');
    if (dto.name && dto.name.toLowerCase() !== s.name.toLowerCase()) await this.assertUniqueName(dto.name, id);
    if (dto.isActive === false) {
      if ([STAGE_NEW, STAGE_DELIVERED, STAGE_CANCELLED].includes(s.code)) throw new BadRequestException(`"${s.name}" is required by the system and cannot be switched off`);
      const inUse = await this.prisma.orderItem.count({ where: { stageId: id, order: { lifecycle: { in: ['OPEN', 'PARTIALLY_DELIVERED'] }, deletedAt: null } } });
      if (inUse) throw new BadRequestException(`${inUse} open garment(s) are in "${s.name}". Move them to another stage first.`);
    }
    const after = await this.prisma.workflowStage.update({ where: { id }, data: { name: dto.name, color: dto.color, isActive: dto.isActive } });
    await this.audit.log({ action: 'UPDATE', module: 'orders', recordId: id, oldValues: { workflowStage: s }, newValues: { workflowStage: after } }, ctx);
    return after;
  }

  /** Re-numbers the non-final stages in the given order. */
  async reorder(dto: ReorderStagesDto, ctx: RequestContext) {
    const stages = await this.prisma.workflowStage.findMany({ where: { isTerminal: false } });
    const ids = new Set(stages.map((s) => s.id));
    if (dto.stageIds.length !== stages.length || dto.stageIds.some((id) => !ids.has(id)) || new Set(dto.stageIds).size !== stages.length) {
      throw new BadRequestException('Send every non-final stage exactly once');
    }
    const newId = stages.find((s) => s.code === STAGE_NEW)?.id;
    if (newId && dto.stageIds[0] !== newId) throw new BadRequestException('"New Order" must stay the first stage');
    await this.prisma.$transaction(async (tx) => {
      for (const [i, id] of dto.stageIds.entries()) await tx.workflowStage.update({ where: { id }, data: { sortOrder: (i + 1) * 10 } });
      const finals = await tx.workflowStage.findMany({ where: { isTerminal: true }, orderBy: { sortOrder: 'asc' } });
      for (const [i, f] of finals.entries()) await tx.workflowStage.update({ where: { id: f.id }, data: { sortOrder: (dto.stageIds.length + 1 + i) * 10 } });
      await this.audit.log({ action: 'REORDER', module: 'orders', newValues: { workflowStages: dto.stageIds } }, ctx, tx);
    });
    return this.list();
  }

  private async assertUniqueName(name: string, excludeId?: string) {
    const dup = await this.prisma.workflowStage.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (dup) throw new ConflictException(`A stage named "${dup.name}" already exists`);
  }
}
