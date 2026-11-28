import { Injectable } from '@nestjs/common';
import { PrismaService, PrismaTx } from '../prisma/prisma.service';
import { Tenant } from '../tenant';

export interface SequenceOptions {
  key: string; // ORDER, CUSTOMER, RECEIPT ...
  prefix: string; // "AZ", "AZC" ...
  period?: string; // "2026" for yearly numbering, omitted for a global counter
  padding?: number;
}

/**
 * Concurrency-safe document numbers using a single atomic UPSERT ... RETURNING.
 * Must run inside the same transaction as the document insert so a rollback
 * also rolls back the counter (no gaps from failed saves).
 * Every company has its own counters.
 */
@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  async next(opts: SequenceOptions, tx?: PrismaTx): Promise<string> {
    const client = tx ?? this.prisma;
    const period = opts.period ?? '';
    const padding = opts.padding ?? 5;
    const companyId = Tenant.require();
    const rows = await client.$queryRaw<{ value: number }[]>`
      INSERT INTO number_sequences (id, "companyId", key, period, prefix, padding, "nextValue", "updatedAt")
      VALUES (gen_random_uuid(), ${companyId}::uuid, ${opts.key}, ${period}, ${opts.prefix}, ${padding}, 2, now())
      ON CONFLICT ("companyId", key, period)
      DO UPDATE SET "nextValue" = number_sequences."nextValue" + 1, "updatedAt" = now()
      RETURNING ("nextValue" - 1)::int AS value`;
    const value = rows[0].value;
    return formatSequence(opts.prefix, period, value, padding);
  }
}

/** formatSequence('AZ', '2026', 1, 5) -> "AZ-2026-00001"; formatSequence('AZC', '', 7, 5) -> "AZC-00007" */
export function formatSequence(prefix: string, period: string, value: number, padding: number): string {
  const num = String(value).padStart(padding, '0');
  return period ? `${prefix}-${period}-${num}` : `${prefix}-${num}`;
}
