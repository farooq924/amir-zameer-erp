-- Phase 6: Finance & Accounting rules.
-- Safe on existing data: only adds functions, triggers and indexes (no column or table changes).

-- Approved expenses are part of the books: they are never deleted or edited, only cancelled
-- (cancelling posts a reversal entry). Rejected and cancelled expenses are final.
CREATE OR REPLACE FUNCTION az_expense_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'APPROVED' OR OLD."approvedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Approved expenses cannot be deleted; cancel them instead' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('REJECTED', 'CANCELLED') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'This expense is closed' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'APPROVED' THEN
    IF NEW.status NOT IN ('APPROVED', 'CANCELLED')
       OR (NEW.amount, NEW."categoryId", NEW."expenseDate", NEW."paymentMethod")
          IS DISTINCT FROM (OLD.amount, OLD."categoryId", OLD."expenseDate", OLD."paymentMethod") THEN
      RAISE EXCEPTION 'Approved expenses cannot be changed; cancel and record again' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER expenses_guard BEFORE UPDATE OR DELETE ON expenses
  FOR EACH ROW EXECUTE FUNCTION az_expense_guard();

-- A locked month can never be reopened or removed.
CREATE OR REPLACE FUNCTION az_period_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'OPEN' THEN
      RAISE EXCEPTION 'Closed or locked periods cannot be deleted' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'LOCKED' THEN
    RAISE EXCEPTION 'Locked periods cannot be changed' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounting_periods_guard BEFORE UPDATE OR DELETE ON accounting_periods
  FOR EACH ROW EXECUTE FUNCTION az_period_guard();

-- Faster reports.
CREATE INDEX IF NOT EXISTS journal_entries_status_date_idx ON journal_entries (status, "entryDate");
CREATE INDEX IF NOT EXISTS expenses_status_date_idx ON expenses (status, "expenseDate");
