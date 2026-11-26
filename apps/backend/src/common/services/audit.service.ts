import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, PrismaTx } from '../prisma/prisma.service';
import { RequestContext } from '../types/auth-user';
import { redact } from '../utils/sanitize';

export interface AuditEntry {
  action: string; // LOGIN, LOGOUT, CREATE, UPDATE, DELETE, STATUS_CHANGE ...
  module: string; // module key, e.g. "users"
  recordId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  userId?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes an audit record. Pass `tx` to make the audit part of the same
   * database transaction as the business change (recommended for financial data).
   */
  async log(entry: AuditEntry, ctx?: RequestContext | null, tx?: PrismaTx): Promise<void> {
    const client = tx ?? this.prisma;
    const data: Prisma.AuditLogUncheckedCreateInput = {
      action: entry.action,
      module: entry.module,
      recordId: entry.recordId ?? null,
      userId: entry.userId ?? ctx?.userId ?? null,
      oldValues: toJson(entry.oldValues),
      newValues: toJson(entry.newValues),
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      sessionId: ctx?.sessionId ?? null,
    };
    if (tx) {
      await client.auditLog.create({ data });
      return;
    }
    // Outside a transaction an audit failure must not break the user's action, but it is logged.
    try {
      await client.auditLog.create({ data });
    } catch (err) {
      this.logger.error(`Failed to write audit log for ${entry.module}.${entry.action}: ${(err as Error).message}`);
    }
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === undefined || value === null) return Prisma.DbNull;
  return JSON.parse(JSON.stringify(redact(value))) as Prisma.InputJsonValue;
}
