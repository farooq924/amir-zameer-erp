-- Phase 5: Employees, Attendance, Production & Payroll rules.
-- Safe on existing data: only adds triggers and NOT VALID checks (no column or table changes).

-- Salary payments are permanent records: never edited or deleted.
CREATE TRIGGER salary_payments_append_only
  BEFORE UPDATE OR DELETE ON salary_payments
  FOR EACH ROW EXECUTE FUNCTION az_block_modification();

-- Employment history is an audit trail.
CREATE TRIGGER employment_history_append_only
  BEFORE UPDATE OR DELETE ON employment_history
  FOR EACH ROW EXECUTE FUNCTION az_block_modification();

-- Sensible numbers only.
ALTER TABLE production_records
  ADD CONSTRAINT production_records_quantity_valid CHECK ("completedQuantity" >= 0 AND "rejectedQuantity" >= 0 AND amount >= 0 AND "pieceRate" >= 0) NOT VALID;
ALTER TABLE overtime_records
  ADD CONSTRAINT overtime_records_values_valid CHECK (hours > 0 AND "ratePerHour" >= 0 AND amount >= 0) NOT VALID;
ALTER TABLE salary_structures
  ADD CONSTRAINT salary_structures_amounts_valid CHECK ("monthlySalary" >= 0 AND "dailyWage" >= 0 AND "perPieceRate" >= 0 AND "overtimeRatePerHour" >= 0) NOT VALID;
ALTER TABLE leave_records
  ADD CONSTRAINT leave_records_dates_valid CHECK ("toDate" >= "fromDate" AND days > 0) NOT VALID;

-- A paid payroll line can never be removed (protects salary history).
CREATE OR REPLACE FUNCTION az_payroll_item_guard() RETURNS trigger AS $$
BEGIN
  IF OLD."paidAmount" > 0 THEN
    RAISE EXCEPTION 'A payroll line with salary payments cannot be deleted' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payroll_items_no_delete_paid
  BEFORE DELETE ON payroll_items
  FOR EACH ROW EXECUTE FUNCTION az_payroll_item_guard();
