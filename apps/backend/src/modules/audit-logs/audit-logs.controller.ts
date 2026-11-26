import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolveDateRange, timestampFilter } from '../../common/utils/date-range';
import { AuditQueryDto } from './dto/audit-query.dto';

/** Read-only by design: there is no create/update/delete endpoint, and the table is append-only in PostgreSQL. */
@ApiTags('Audit Logs')
@ApiCookieAuth()
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('audit_logs', 'VIEW')
  async list(@Query() q: AuditQueryDto) {
    let range;
    try {
      range = resolveDateRange(q.preset ?? 'this_month', q.from, q.to);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const where: Prisma.AuditLogWhereInput = {
      createdAt: timestampFilter(range),
      ...(q.module ? { module: q.module } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.search ? { OR: [{ recordId: { contains: q.search } }, { action: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where, orderBy: { createdAt: q.sortOrder }, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        include: { user: { select: { id: true, fullName: true, username: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { ...paginate(rows, total, q), range: { from: range.fromDate, to: range.toDate } };
  }

  @Get('filters')
  @RequirePermissions('audit_logs', 'VIEW')
  async filters() {
    const [modules, actions] = await Promise.all([
      this.prisma.auditLog.findMany({ distinct: ['module'], select: { module: true }, orderBy: { module: 'asc' } }),
      this.prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    ]);
    return { modules: modules.map((m) => m.module), actions: actions.map((a) => a.action) };
  }
}
