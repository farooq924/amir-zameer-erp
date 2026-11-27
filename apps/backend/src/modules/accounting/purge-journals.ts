import { PrismaTx } from '../../common/prisma/prisma.service';

export interface PurgeScope {
  customerIds?: string[];
  supplierIds?: string[];
  employeeIds?: string[];
  fabricIds?: string[];
  /** Any document ids (orders, payments, purchases, payrolls, movements, expenses ...). */
  sourceIds?: string[];
}

/**
 * ONLY for removing sample (demo) data: deletes the automatic journal entries that belong to the given
 * customers / suppliers / employees / fabrics / documents, including their reversal entries, so that
 * the books show real business only. Posted entries are normally permanent, so the guard triggers are
 * paused inside the caller's transaction and switched back on before it returns.
 * Call it inside the removal transaction BEFORE the customers, suppliers, employees and stock
 * movements are deleted. Returns the number of entries removed.
 */
export async function purgeJournalsFor(tx: PrismaTx, scope: PurgeScope): Promise<number> {
  const C = scope.customerIds ?? [];
  const S = scope.supplierIds ?? [];
  const E = scope.employeeIds ?? [];
  const F = scope.fabricIds ?? [];
  const D = scope.sourceIds ?? [];
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
    `WITH base AS (
       SELECT DISTINCT l."journalEntryId" AS id FROM journal_entry_lines l
        WHERE l."customerId" = ANY($1::uuid[]) OR l."supplierId" = ANY($2::uuid[]) OR l."employeeId" = ANY($3::uuid[])
       UNION
       SELECT j.id FROM journal_entries j
        WHERE j."sourceId" = ANY($5::uuid[])
           OR j."sourceId" IN (SELECT m.id FROM inventory_movements m WHERE m."fabricId" = ANY($4::uuid[]) OR m."referenceId" = ANY($5::uuid[]))
     )
     SELECT id::text FROM base
     UNION
     SELECT r.id::text FROM journal_entries r WHERE r."reversalOfId" IN (SELECT id FROM base)`,
    C, S, E, F, D,
  );
  const ids = rows.map((r) => r.id);
  if (!ids.length) return 0;
  await tx.$executeRawUnsafe('ALTER TABLE journal_entries DISABLE TRIGGER journal_entries_guard');
  await tx.$executeRawUnsafe('ALTER TABLE journal_entry_lines DISABLE TRIGGER journal_entry_lines_guard');
  await tx.$executeRawUnsafe(`DELETE FROM journal_entry_lines WHERE "journalEntryId" = ANY($1::uuid[])`, ids);
  await tx.$executeRawUnsafe(`UPDATE journal_entries SET "reversalOfId" = NULL WHERE id = ANY($1::uuid[])`, ids);
  const n = await tx.$executeRawUnsafe(`DELETE FROM journal_entries WHERE id = ANY($1::uuid[])`, ids);
  await tx.$executeRawUnsafe('ALTER TABLE journal_entry_lines ENABLE TRIGGER journal_entry_lines_guard');
  await tx.$executeRawUnsafe('ALTER TABLE journal_entries ENABLE TRIGGER journal_entries_guard');
  return n;
}
