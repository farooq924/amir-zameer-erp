-- =============================================================================
-- TailoringERP SaaS (multi-company). v2.0.0
--  * New tables: plans, companies, company_payments, platform_settings.
--  * Every business table gets "companyId" (+ index + foreign key to companies).
--  * Business numbers/codes become unique PER COMPANY.
--  * EXISTING DATA: if this database already has users, a company called
--    "Zameer Ansari" is created and ALL existing rows are assigned to it.
--    Nothing is deleted. A fresh (empty) database gets no company here; the
--    seed creates the first one.
-- =============================================================================


CREATE TYPE "CompanyStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED');

CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "monthlyPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "modules" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "ownerName" VARCHAR(120),
    "phone" VARCHAR(30),
    "email" VARCHAR(160),
    "address" TEXT,
    "city" VARCHAR(80),
    "docPrefix" VARCHAR(6) NOT NULL DEFAULT 'AZ',
    "status" "CompanyStatus" NOT NULL DEFAULT 'TRIAL',
    "planId" UUID NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "paidUntil" TIMESTAMP(3),
    "graceDays" INTEGER NOT NULL DEFAULT 7,
    "notes" TEXT,
    "suspendedReason" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_payments" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 1,
    "method" VARCHAR(20) NOT NULL,
    "reference" VARCHAR(120),
    "paidAt" DATE NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "notes" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- Safety net: a row inserted without a company fails instead of silently
-- landing in the wrong company. The app always sets companyId itself.
CREATE OR REPLACE FUNCTION az_require_company() RETURNS uuid AS $$
BEGIN
  RAISE EXCEPTION 'companyId is required (no company selected)' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

-- Default plans (editable later in Super Admin > Plans).
INSERT INTO "plans" ("id","code","name","description","monthlyPrice","maxUsers","modules","sortOrder","isActive","updatedAt") VALUES
 ('00000000-0000-4000-b000-000000000001','BASIC','Basic','Customers, measurements, orders, payments and reports.',2000,3,ARRAY[]::text[],10,true,now()),
 ('00000000-0000-4000-b000-000000000002','STANDARD','Standard','Basic + fabric inventory, purchases, suppliers, expenses and WhatsApp.',4000,8,ARRAY['inventory','purchases','suppliers','expenses','whatsapp'],20,true,now()),
 ('00000000-0000-4000-b000-000000000003','PREMIUM','Premium','Everything: + employees, attendance, production, payroll and accounting.',7000,25,ARRAY['inventory','purchases','suppliers','expenses','whatsapp','employees','attendance','production','payroll','accounting'],30,true,now());

-- Existing installation -> company "Zameer Ansari" (Premium, active, no expiry).
INSERT INTO "companies" ("id","code","name","docPrefix","status","planId","paidUntil","updatedAt")
SELECT '00000000-0000-4000-a000-000000000001','zameer-ansari','Zameer Ansari','AZ','ACTIVE','00000000-0000-4000-b000-000000000003',NULL,now()
WHERE EXISTS (SELECT 1 FROM "users");


-- companyId on every business table. Existing rows get the "Zameer Ansari" company.
-- (ADD COLUMN with a constant default does not fire the append-only triggers.)

ALTER TABLE "accounting_periods" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "accounting_periods" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "advance_recoveries" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "advance_recoveries" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "attachments" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "attachments" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "attendance" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "attendance" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "audit_logs" ADD COLUMN "companyId" UUID DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "audit_logs" ALTER COLUMN "companyId" DROP DEFAULT;

ALTER TABLE "chart_of_accounts" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "chart_of_accounts" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "customer_addresses" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "customer_addresses" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "customer_ledger" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "customer_ledger" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "customer_measurements" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "customer_measurements" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "customer_notes" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "customer_notes" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "customers" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "customers" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "employee_advances" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "employee_advances" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "employee_assignments" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "employee_assignments" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "employees" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "employees" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "employment_history" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "employment_history" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "expense_categories" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "expense_categories" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "expenses" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "expenses" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "fabric_categories" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "fabric_categories" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "fabrics" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "fabrics" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "garment_measurements" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "garment_measurements" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "garments" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "garments" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "idempotency_keys" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "idempotency_keys" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "inventory_movements" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "inventory_movements" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "journal_entries" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "journal_entries" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "journal_entry_lines" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "journal_entry_lines" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "leave_records" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "leave_records" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "login_attempts" ADD COLUMN "companyId" UUID DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "login_attempts" ALTER COLUMN "companyId" DROP DEFAULT;

ALTER TABLE "measurement_fields" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "measurement_fields" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "measurement_templates" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "measurement_templates" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "measurement_values" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "measurement_values" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "notifications" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "notifications" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "number_sequences" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "number_sequences" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "order_adjustments" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "order_adjustments" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "order_deliveries" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "order_deliveries" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "order_delivery_items" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "order_delivery_items" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "order_items" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "order_items" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "order_status_history" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "order_status_history" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "orders" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "orders" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "overtime_records" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "overtime_records" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "payments" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "payments" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "payroll_items" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "payroll_items" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "payrolls" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "payrolls" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "production_records" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "production_records" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "purchase_items" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "purchase_items" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "purchase_order_items" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "purchase_order_items" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "purchase_orders" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "purchase_orders" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "purchase_return_items" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "purchase_return_items" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "purchase_returns" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "purchase_returns" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "purchases" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "purchases" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "recurring_expenses" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "recurring_expenses" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "role_permissions" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "role_permissions" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "roles" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "roles" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "salary_payments" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "salary_payments" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "salary_structures" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "salary_structures" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "sale_return_items" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "sale_return_items" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "sale_returns" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "sale_returns" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "sessions" ADD COLUMN "companyId" UUID DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "sessions" ALTER COLUMN "companyId" DROP DEFAULT;

ALTER TABLE "sessions" ADD COLUMN     "actingCompanyId" UUID;

ALTER TABLE "stock_reservations" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "stock_reservations" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "supplier_ledger" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "supplier_ledger" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "supplier_payments" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "supplier_payments" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "suppliers" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "suppliers" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "sync_conflicts" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "sync_conflicts" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "sync_operations" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "sync_operations" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "system_settings" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "system_settings" DROP CONSTRAINT "system_settings_pkey";
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("companyId", "key");
ALTER TABLE "system_settings" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "user_roles" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "user_roles" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "users" ADD COLUMN "companyId" UUID DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "users" ALTER COLUMN "companyId" DROP DEFAULT;

ALTER TABLE "users" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "whatsapp_messages" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "whatsapp_messages" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "whatsapp_templates" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "whatsapp_templates" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

ALTER TABLE "workflow_stages" ADD COLUMN "companyId" UUID NOT NULL DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE "workflow_stages" ALTER COLUMN "companyId" SET DEFAULT az_require_company();

-- Keep the existing shop name on prints: the old built-in default was "AMIR ZAMEER".
INSERT INTO "system_settings" ("companyId","key","group","value","updatedAt")
SELECT '00000000-0000-4000-a000-000000000001','group.business','business',
       '{"businessName":"AMIR ZAMEER","tagline":"Men''s Tailoring & Fabrics","phone":"","whatsapp":"","email":"","address":"","city":"","ntn":"","logoUrl":""}'::jsonb, now()
WHERE EXISTS (SELECT 1 FROM "companies" WHERE "id" = '00000000-0000-4000-a000-000000000001')
ON CONFLICT ("companyId","key") DO NOTHING;

-- Backup settings are platform-wide now (managed by the Super Admin).
INSERT INTO "platform_settings" ("key","value","updatedById","updatedAt")
SELECT "key","value","updatedById",now() FROM "system_settings" WHERE "key" IN ('backup.config','backup.key_saved')
ON CONFLICT ("key") DO NOTHING;
DELETE FROM "system_settings" WHERE "key" IN ('backup.config','backup.key_saved');

-- Per-company unique numbers / codes

DROP INDEX "accounting_periods_name_key";

DROP INDEX "accounting_periods_startDate_endDate_key";

DROP INDEX "chart_of_accounts_code_key";

DROP INDEX "customers_code_key";

DROP INDEX "employee_advances_advanceNo_key";

DROP INDEX "employees_cnic_key";

DROP INDEX "employees_code_key";

DROP INDEX "expense_categories_name_key";

DROP INDEX "expenses_expenseNo_key";

DROP INDEX "fabric_categories_name_key";

DROP INDEX "fabrics_code_key";

DROP INDEX "garments_code_key";

DROP INDEX "inventory_movements_movementNo_key";

DROP INDEX "journal_entries_entryNo_key";

DROP INDEX "measurement_templates_code_key";

DROP INDEX "orders_orderNumber_key";

DROP INDEX "payments_receiptNo_key";

DROP INDEX "payrolls_payrollNo_key";

DROP INDEX "payrolls_periodKey_key";

DROP INDEX "purchase_orders_poNumber_key";

DROP INDEX "purchase_returns_returnNo_key";

DROP INDEX "purchases_purchaseNo_key";

DROP INDEX "roles_code_key";

DROP INDEX "roles_name_key";

DROP INDEX "salary_payments_paymentNo_key";

DROP INDEX "sale_returns_returnNo_key";

DROP INDEX "supplier_payments_paymentNo_key";

DROP INDEX "suppliers_code_key";

DROP INDEX "workflow_stages_code_key";

DROP INDEX IF EXISTS "number_sequences_key_period_key";
DROP INDEX IF EXISTS "whatsapp_templates_name_language_key";
CREATE UNIQUE INDEX "number_sequences_companyId_key_period_key" ON "number_sequences"("companyId", "key", "period");
CREATE UNIQUE INDEX "whatsapp_templates_companyId_name_language_key" ON "whatsapp_templates"("companyId", "name", "language");

CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");

CREATE INDEX "companies_status_idx" ON "companies"("status");

CREATE INDEX "company_payments_companyId_paidAt_idx" ON "company_payments"("companyId", "paidAt");

CREATE INDEX "accounting_periods_companyId_idx" ON "accounting_periods"("companyId");

CREATE UNIQUE INDEX "accounting_periods_companyId_startDate_endDate_key" ON "accounting_periods"("companyId", "startDate", "endDate");

CREATE UNIQUE INDEX "accounting_periods_companyId_name_key" ON "accounting_periods"("companyId", "name");

CREATE INDEX "advance_recoveries_companyId_idx" ON "advance_recoveries"("companyId");

CREATE INDEX "attachments_companyId_idx" ON "attachments"("companyId");

CREATE INDEX "attendance_companyId_idx" ON "attendance"("companyId");

CREATE INDEX "audit_logs_companyId_idx" ON "audit_logs"("companyId");

CREATE INDEX "chart_of_accounts_companyId_idx" ON "chart_of_accounts"("companyId");

CREATE UNIQUE INDEX "chart_of_accounts_companyId_code_key" ON "chart_of_accounts"("companyId", "code");

CREATE INDEX "customer_addresses_companyId_idx" ON "customer_addresses"("companyId");

CREATE INDEX "customer_ledger_companyId_idx" ON "customer_ledger"("companyId");

CREATE INDEX "customer_measurements_companyId_idx" ON "customer_measurements"("companyId");

CREATE INDEX "customer_notes_companyId_idx" ON "customer_notes"("companyId");

CREATE INDEX "customers_companyId_idx" ON "customers"("companyId");

CREATE UNIQUE INDEX "customers_companyId_code_key" ON "customers"("companyId", "code");

CREATE INDEX "employee_advances_companyId_idx" ON "employee_advances"("companyId");

CREATE UNIQUE INDEX "employee_advances_companyId_advanceNo_key" ON "employee_advances"("companyId", "advanceNo");

CREATE INDEX "employee_assignments_companyId_idx" ON "employee_assignments"("companyId");

CREATE INDEX "employees_companyId_idx" ON "employees"("companyId");

CREATE UNIQUE INDEX "employees_companyId_code_key" ON "employees"("companyId", "code");

CREATE UNIQUE INDEX "employees_companyId_cnic_key" ON "employees"("companyId", "cnic");

CREATE INDEX "employment_history_companyId_idx" ON "employment_history"("companyId");

CREATE INDEX "expense_categories_companyId_idx" ON "expense_categories"("companyId");

CREATE UNIQUE INDEX "expense_categories_companyId_name_key" ON "expense_categories"("companyId", "name");

CREATE INDEX "expenses_companyId_idx" ON "expenses"("companyId");

CREATE UNIQUE INDEX "expenses_companyId_expenseNo_key" ON "expenses"("companyId", "expenseNo");

CREATE INDEX "fabric_categories_companyId_idx" ON "fabric_categories"("companyId");

CREATE UNIQUE INDEX "fabric_categories_companyId_name_key" ON "fabric_categories"("companyId", "name");

CREATE INDEX "fabrics_companyId_idx" ON "fabrics"("companyId");

CREATE UNIQUE INDEX "fabrics_companyId_code_key" ON "fabrics"("companyId", "code");

CREATE INDEX "garment_measurements_companyId_idx" ON "garment_measurements"("companyId");

CREATE INDEX "garments_companyId_idx" ON "garments"("companyId");

CREATE UNIQUE INDEX "garments_companyId_code_key" ON "garments"("companyId", "code");

CREATE INDEX "idempotency_keys_companyId_idx" ON "idempotency_keys"("companyId");

CREATE INDEX "inventory_movements_companyId_idx" ON "inventory_movements"("companyId");

CREATE UNIQUE INDEX "inventory_movements_companyId_movementNo_key" ON "inventory_movements"("companyId", "movementNo");

CREATE INDEX "journal_entries_companyId_idx" ON "journal_entries"("companyId");

CREATE UNIQUE INDEX "journal_entries_companyId_entryNo_key" ON "journal_entries"("companyId", "entryNo");

CREATE INDEX "journal_entry_lines_companyId_idx" ON "journal_entry_lines"("companyId");

CREATE INDEX "leave_records_companyId_idx" ON "leave_records"("companyId");

CREATE INDEX "login_attempts_companyId_idx" ON "login_attempts"("companyId");

CREATE INDEX "measurement_fields_companyId_idx" ON "measurement_fields"("companyId");

CREATE INDEX "measurement_templates_companyId_idx" ON "measurement_templates"("companyId");

CREATE UNIQUE INDEX "measurement_templates_companyId_code_key" ON "measurement_templates"("companyId", "code");

CREATE INDEX "measurement_values_companyId_idx" ON "measurement_values"("companyId");

CREATE INDEX "notifications_companyId_idx" ON "notifications"("companyId");

CREATE INDEX "number_sequences_companyId_idx" ON "number_sequences"("companyId");

CREATE INDEX "order_adjustments_companyId_idx" ON "order_adjustments"("companyId");

CREATE INDEX "order_deliveries_companyId_idx" ON "order_deliveries"("companyId");

CREATE INDEX "order_delivery_items_companyId_idx" ON "order_delivery_items"("companyId");

CREATE INDEX "order_items_companyId_idx" ON "order_items"("companyId");

CREATE INDEX "order_status_history_companyId_idx" ON "order_status_history"("companyId");

CREATE INDEX "orders_companyId_idx" ON "orders"("companyId");

CREATE UNIQUE INDEX "orders_companyId_orderNumber_key" ON "orders"("companyId", "orderNumber");

CREATE INDEX "overtime_records_companyId_idx" ON "overtime_records"("companyId");

CREATE INDEX "payments_companyId_idx" ON "payments"("companyId");

CREATE UNIQUE INDEX "payments_companyId_receiptNo_key" ON "payments"("companyId", "receiptNo");

CREATE INDEX "payroll_items_companyId_idx" ON "payroll_items"("companyId");

CREATE INDEX "payrolls_companyId_idx" ON "payrolls"("companyId");

CREATE UNIQUE INDEX "payrolls_companyId_payrollNo_key" ON "payrolls"("companyId", "payrollNo");

CREATE UNIQUE INDEX "payrolls_companyId_periodKey_key" ON "payrolls"("companyId", "periodKey");

CREATE INDEX "production_records_companyId_idx" ON "production_records"("companyId");

CREATE INDEX "purchase_items_companyId_idx" ON "purchase_items"("companyId");

CREATE INDEX "purchase_order_items_companyId_idx" ON "purchase_order_items"("companyId");

CREATE INDEX "purchase_orders_companyId_idx" ON "purchase_orders"("companyId");

CREATE UNIQUE INDEX "purchase_orders_companyId_poNumber_key" ON "purchase_orders"("companyId", "poNumber");

CREATE INDEX "purchase_return_items_companyId_idx" ON "purchase_return_items"("companyId");

CREATE INDEX "purchase_returns_companyId_idx" ON "purchase_returns"("companyId");

CREATE UNIQUE INDEX "purchase_returns_companyId_returnNo_key" ON "purchase_returns"("companyId", "returnNo");

CREATE INDEX "purchases_companyId_idx" ON "purchases"("companyId");

CREATE UNIQUE INDEX "purchases_companyId_purchaseNo_key" ON "purchases"("companyId", "purchaseNo");

CREATE INDEX "recurring_expenses_companyId_idx" ON "recurring_expenses"("companyId");

CREATE INDEX "role_permissions_companyId_idx" ON "role_permissions"("companyId");

CREATE INDEX "roles_companyId_idx" ON "roles"("companyId");

CREATE UNIQUE INDEX "roles_companyId_code_key" ON "roles"("companyId", "code");

CREATE UNIQUE INDEX "roles_companyId_name_key" ON "roles"("companyId", "name");

CREATE INDEX "salary_payments_companyId_idx" ON "salary_payments"("companyId");

CREATE UNIQUE INDEX "salary_payments_companyId_paymentNo_key" ON "salary_payments"("companyId", "paymentNo");

CREATE INDEX "salary_structures_companyId_idx" ON "salary_structures"("companyId");

CREATE INDEX "sale_return_items_companyId_idx" ON "sale_return_items"("companyId");

CREATE INDEX "sale_returns_companyId_idx" ON "sale_returns"("companyId");

CREATE UNIQUE INDEX "sale_returns_companyId_returnNo_key" ON "sale_returns"("companyId", "returnNo");

CREATE INDEX "sessions_companyId_idx" ON "sessions"("companyId");

CREATE INDEX "stock_reservations_companyId_idx" ON "stock_reservations"("companyId");

CREATE INDEX "supplier_ledger_companyId_idx" ON "supplier_ledger"("companyId");

CREATE INDEX "supplier_payments_companyId_idx" ON "supplier_payments"("companyId");

CREATE UNIQUE INDEX "supplier_payments_companyId_paymentNo_key" ON "supplier_payments"("companyId", "paymentNo");

CREATE INDEX "suppliers_companyId_idx" ON "suppliers"("companyId");

CREATE UNIQUE INDEX "suppliers_companyId_code_key" ON "suppliers"("companyId", "code");

CREATE INDEX "sync_conflicts_companyId_idx" ON "sync_conflicts"("companyId");

CREATE INDEX "sync_operations_companyId_idx" ON "sync_operations"("companyId");

CREATE INDEX "user_roles_companyId_idx" ON "user_roles"("companyId");

CREATE INDEX "users_companyId_idx" ON "users"("companyId");

CREATE INDEX "whatsapp_messages_companyId_idx" ON "whatsapp_messages"("companyId");

CREATE INDEX "whatsapp_templates_companyId_idx" ON "whatsapp_templates"("companyId");

CREATE INDEX "workflow_stages_companyId_idx" ON "workflow_stages"("companyId");

CREATE UNIQUE INDEX "workflow_stages_companyId_code_key" ON "workflow_stages"("companyId", "code");

ALTER TABLE "companies" ADD CONSTRAINT "companies_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "company_payments" ADD CONSTRAINT "company_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- companyId foreign keys (not modelled as Prisma relations on purpose)

ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "advance_recoveries" ADD CONSTRAINT "advance_recoveries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attachments" ADD CONSTRAINT "attachments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance" ADD CONSTRAINT "attendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_ledger" ADD CONSTRAINT "customer_ledger_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_measurements" ADD CONSTRAINT "customer_measurements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customers" ADD CONSTRAINT "customers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employment_history" ADD CONSTRAINT "employment_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fabric_categories" ADD CONSTRAINT "fabric_categories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fabrics" ADD CONSTRAINT "fabrics_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "garment_measurements" ADD CONSTRAINT "garment_measurements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "garments" ADD CONSTRAINT "garments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "measurement_fields" ADD CONSTRAINT "measurement_fields_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "measurement_templates" ADD CONSTRAINT "measurement_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "measurement_values" ADD CONSTRAINT "measurement_values_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_adjustments" ADD CONSTRAINT "order_adjustments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_delivery_items" ADD CONSTRAINT "order_delivery_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "overtime_records" ADD CONSTRAINT "overtime_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "production_records" ADD CONSTRAINT "production_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchases" ADD CONSTRAINT "purchases_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roles" ADD CONSTRAINT "roles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_ledger" ADD CONSTRAINT "supplier_ledger_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
