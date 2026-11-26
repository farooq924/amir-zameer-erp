# Database & Migration Strategy

## Tooling
* PostgreSQL 16, Prisma 6 (`apps/backend/prisma/schema.prisma`).
* Migrations live in `apps/backend/prisma/migrations/` and are committed to git.

## Migrations so far
| Migration | Purpose |
|---|---|
| `20261126075112_init` | All tables, enums, foreign keys, unique keys and indexes for every module (Phases 1-10). |
| `20261126075200_integrity_rules` | Hand-written SQL: append-only triggers (audit log, inventory movements, customer/supplier ledgers, measurement values), measurement-version immutability, payment guard (no delete, POSTED -> REVERSED only), double-entry guard (create as DRAFT, balance check on posting, immutable once posted, closed-period protection), CHECK constraints for money/quantities, case-insensitive unique login names, "one latest measurement" and "one current salary" partial unique indexes. |

## Rules for future migrations
1. Development: change `schema.prisma`, run `pnpm --filter @az/backend db:migrate:dev --name <change>`.
   For raw SQL (triggers, checks) use `prisma migrate dev --create-only`, edit the SQL, then apply.
2. Never edit a migration that has been applied in production; always add a new one.
3. Production: `prisma migrate deploy` runs automatically when the backend container starts.
4. Destructive changes (dropping a column with data) need a two-step migration: copy data, release, then drop.
5. Take a backup before every production migration (Phase 10 automates this).

## Seed (`prisma/seed.ts`, idempotent)
* Syncs the permission catalogue from `packages/shared/src/modules.ts`.
* Creates the 8 default roles with their default permissions **only the first time** (owner edits are never overwritten). Owner always has full access.
* Creates the first Owner from `OWNER_*` environment variables **only if no owner exists**.
* Creates the 11 default workflow stages.

## Money & quantities
| Kind | Type |
|---|---|
| Money | `DECIMAL(14,2)` |
| Unit cost / average cost | `DECIMAL(14,4)` |
| Fabric quantity | `DECIMAL(12,3)` |
| Measurements | `DECIMAL(7,2)` |
Calculations in the backend use `Prisma.Decimal` (`src/common/utils/money.ts`), never JS floats.
API responses send money as strings like `"1250.00"`.

## Timezone
All business dates are calculated in Asia/Karachi (`src/common/utils/date-range.ts`).
Date-only fields (order date, expense date, attendance date) use PostgreSQL `DATE`.
