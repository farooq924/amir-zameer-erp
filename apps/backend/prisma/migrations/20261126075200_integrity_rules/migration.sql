-- =============================================================================
-- AMIR ZAMEER ERP - database-level integrity rules
-- These rules hold even if application code has a bug.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Generic "append-only" guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION az_block_modification() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Records in % are append-only and cannot be %', TG_TABLE_NAME, lower(TG_OP)
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

-- Audit log: no UPDATE / DELETE, ever.
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION az_block_modification();

-- Inventory ledger: corrections are new ADJUSTMENT movements.
CREATE TRIGGER inventory_movements_append_only
  BEFORE UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION az_block_modification();

-- Customer / supplier sub-ledgers: corrections are REVERSAL entries.
CREATE TRIGGER customer_ledger_append_only
  BEFORE UPDATE OR DELETE ON customer_ledger
  FOR EACH ROW EXECUTE FUNCTION az_block_modification();

CREATE TRIGGER supplier_ledger_append_only
  BEFORE UPDATE OR DELETE ON supplier_ledger
  FOR EACH ROW EXECUTE FUNCTION az_block_modification();

-- Measurement versions are history: never edited after saving.
CREATE TRIGGER measurement_values_append_only
  BEFORE UPDATE OR DELETE ON measurement_values
  FOR EACH ROW EXECUTE FUNCTION az_block_modification();

CREATE OR REPLACE FUNCTION az_customer_measurement_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Measurement versions cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  -- Only the "isLatest" flag may change (when a newer version is saved).
  IF (NEW."customerId", NEW."templateId", NEW."versionNo", NEW.unit, NEW."takenAt", NEW.notes)
     IS DISTINCT FROM (OLD."customerId", OLD."templateId", OLD."versionNo", OLD.unit, OLD."takenAt", OLD.notes) THEN
    RAISE EXCEPTION 'Measurement versions are immutable; save a new version instead' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_measurements_immutable
  BEFORE UPDATE OR DELETE ON customer_measurements
  FOR EACH ROW EXECUTE FUNCTION az_customer_measurement_guard();

-- ---------------------------------------------------------------------------
-- 2. Customer payments: never deleted; only POSTED -> REVERSED allowed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION az_payment_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payments cannot be deleted; post a reversal instead' USING ERRCODE = 'P0001';
  END IF;
  IF NOT (OLD.status = 'POSTED' AND NEW.status = 'REVERSED')
     OR (NEW.amount, NEW."customerId", NEW."orderId", NEW.method, NEW.type, NEW."paymentDate")
        IS DISTINCT FROM (OLD.amount, OLD."customerId", OLD."orderId", OLD.method, OLD.type, OLD."paymentDate") THEN
    RAISE EXCEPTION 'Posted payments are immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_guard BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION az_payment_guard();

-- ---------------------------------------------------------------------------
-- 3. Double-entry accounting
--    * entries are created as DRAFT, lines are added, then status -> POSTED
--    * posting requires SUM(debit) = SUM(credit) > 0
--    * posted entries are immutable; only POSTED -> REVERSED is allowed
--    * nothing may be posted into a CLOSED / LOCKED accounting period
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION az_journal_entry_guard() RETURNS trigger AS $$
DECLARE
  v_debit  numeric(14,2);
  v_credit numeric(14,2);
  v_lines  int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Journal entries must be created as DRAFT and then posted' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Posted journal entries cannot be deleted; post a reversal instead' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.status = 'POSTED' THEN
    IF NEW.status = 'REVERSED'
       AND (NEW."entryDate", NEW.description, NEW."totalDebit", NEW."totalCredit", NEW."sourceType", NEW."sourceId")
           IS NOT DISTINCT FROM (OLD."entryDate", OLD.description, OLD."totalDebit", OLD."totalCredit", OLD."sourceType", OLD."sourceId") THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Posted journal entries are immutable' USING ERRCODE = 'P0001';
  END IF;

  IF OLD.status = 'REVERSED' THEN
    RAISE EXCEPTION 'Reversed journal entries are immutable' USING ERRCODE = 'P0001';
  END IF;

  IF OLD.status = 'DRAFT' AND NEW.status = 'POSTED' THEN
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0), COUNT(*)
      INTO v_debit, v_credit, v_lines
      FROM journal_entry_lines WHERE "journalEntryId" = NEW.id;
    IF v_lines < 2 OR v_debit <> v_credit OR v_debit = 0 THEN
      RAISE EXCEPTION 'Journal entry % is not balanced (debit %, credit %, lines %)', NEW."entryNo", v_debit, v_credit, v_lines
        USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM accounting_periods p
               WHERE NEW."entryDate" BETWEEN p."startDate" AND p."endDate" AND p.status <> 'OPEN') THEN
      RAISE EXCEPTION 'Accounting period for % is closed', NEW."entryDate" USING ERRCODE = 'P0001';
    END IF;
    NEW."totalDebit"  := v_debit;
    NEW."totalCredit" := v_credit;
    NEW."postedAt"    := COALESCE(NEW."postedAt", now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entries_guard
  BEFORE INSERT OR UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION az_journal_entry_guard();

CREATE OR REPLACE FUNCTION az_journal_line_guard() RETURNS trigger AS $$
DECLARE
  v_status text;
  v_entry  uuid;
BEGIN
  v_entry := CASE WHEN TG_OP = 'DELETE' THEN OLD."journalEntryId" ELSE NEW."journalEntryId" END;
  SELECT status INTO v_status FROM journal_entries WHERE id = v_entry;
  IF v_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Lines of a posted journal entry cannot be changed' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entry_lines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION az_journal_line_guard();

-- ---------------------------------------------------------------------------
-- 4. CHECK constraints (money and quantities)
-- ---------------------------------------------------------------------------
ALTER TABLE journal_entry_lines
  ADD CONSTRAINT jel_amounts_non_negative CHECK (debit >= 0 AND credit >= 0),
  ADD CONSTRAINT jel_one_side_only CHECK ((debit = 0) <> (credit = 0));

ALTER TABLE customer_ledger
  ADD CONSTRAINT cl_amounts_non_negative CHECK (debit >= 0 AND credit >= 0),
  ADD CONSTRAINT cl_one_side_only CHECK ((debit = 0) <> (credit = 0));

ALTER TABLE supplier_ledger
  ADD CONSTRAINT sl_amounts_non_negative CHECK (debit >= 0 AND credit >= 0),
  ADD CONSTRAINT sl_one_side_only CHECK ((debit = 0) <> (credit = 0));

ALTER TABLE payments          ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);
ALTER TABLE supplier_payments ADD CONSTRAINT supplier_payments_amount_positive CHECK (amount > 0);
ALTER TABLE salary_payments   ADD CONSTRAINT salary_payments_amount_positive CHECK (amount > 0);
ALTER TABLE expenses          ADD CONSTRAINT expenses_amount_positive CHECK (amount > 0);
ALTER TABLE employee_advances
  ADD CONSTRAINT advances_amount_positive CHECK (amount > 0),
  ADD CONSTRAINT advances_balance_valid CHECK ("balanceAmount" >= 0 AND "recoveredAmount" >= 0 AND "recoveredAmount" <= amount);

ALTER TABLE orders
  ADD CONSTRAINT orders_amounts_non_negative CHECK (
    "stitchingTotal" >= 0 AND "fabricTotal" >= 0 AND "additionalCharges" >= 0 AND discount >= 0
    AND subtotal >= 0 AND "totalAmount" >= 0 AND "paidAmount" >= 0),
  ADD CONSTRAINT orders_delivery_after_order CHECK ("expectedDeliveryDate" IS NULL OR "expectedDeliveryDate" >= "orderDate");

ALTER TABLE order_items
  ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT order_items_delivered_valid CHECK ("deliveredQuantity" >= 0 AND "deliveredQuantity" <= quantity),
  ADD CONSTRAINT order_items_amounts_non_negative CHECK (
    "fabricQuantity" >= 0 AND "fabricRate" >= 0 AND "stitchingPrice" >= 0 AND "additionalCharges" >= 0 AND "lineTotal" >= 0);

ALTER TABLE fabrics
  ADD CONSTRAINT fabrics_stock_non_negative CHECK ("currentStock" >= 0 AND "reservedStock" >= 0),
  ADD CONSTRAINT fabrics_prices_non_negative CHECK ("purchasePrice" >= 0 AND "salePrice" >= 0 AND "minimumStock" >= 0);

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT inventory_movements_balance_non_negative CHECK ("balanceAfter" >= 0);

ALTER TABLE stock_reservations
  ADD CONSTRAINT stock_reservations_quantity_valid CHECK (quantity > 0 AND consumed >= 0 AND consumed <= quantity);

ALTER TABLE measurement_values
  ADD CONSTRAINT measurement_values_non_negative CHECK (value IS NULL OR value >= 0);

ALTER TABLE attendance
  ADD CONSTRAINT attendance_minutes_non_negative CHECK ("lateMinutes" >= 0 AND "earlyMinutes" >= 0 AND "overtimeMinutes" >= 0);

ALTER TABLE payroll_items
  ADD CONSTRAINT payroll_items_paid_valid CHECK ("paidAmount" >= 0 AND "paidAmount" <= "netAmount" OR "netAmount" < 0);

ALTER TABLE accounting_periods
  ADD CONSTRAINT accounting_periods_dates_valid CHECK ("endDate" >= "startDate");

ALTER TABLE number_sequences
  ADD CONSTRAINT number_sequences_next_positive CHECK ("nextValue" >= 1);

-- Case-insensitive uniqueness for login identifiers.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
CREATE UNIQUE INDEX users_username_lower_key ON users (lower(username));

-- Only one "latest" measurement per customer + template.
CREATE UNIQUE INDEX customer_measurements_one_latest
  ON customer_measurements ("customerId", "templateId") WHERE "isLatest";

-- Only one current salary structure per employee.
CREATE UNIQUE INDEX salary_structures_one_current
  ON salary_structures ("employeeId") WHERE "isCurrent";

-- Fast duplicate-customer lookup by mobile (active records only).
CREATE INDEX customers_mobile_active_idx ON customers (mobile) WHERE "deletedAt" IS NULL;
