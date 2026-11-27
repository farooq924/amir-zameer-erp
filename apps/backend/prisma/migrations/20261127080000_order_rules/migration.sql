-- =============================================================================
-- Phase 3 - Orders & Garments: database-level rules
-- =============================================================================

-- Measurement snapshots on order items are frozen: they can be replaced (delete +
-- insert, only while the order is open) but never edited in place.
CREATE TRIGGER garment_measurements_no_update
  BEFORE UPDATE ON garment_measurements
  FOR EACH ROW EXECUTE FUNCTION az_block_modification();

-- Status history and adjustments are history: never edited.
CREATE TRIGGER order_status_history_no_update
  BEFORE UPDATE ON order_status_history
  FOR EACH ROW EXECUTE FUNCTION az_block_modification();

CREATE TRIGGER order_adjustments_append_only
  BEFORE UPDATE OR DELETE ON order_adjustments
  FOR EACH ROW EXECUTE FUNCTION az_block_modification();

-- Deliveries are history: never edited or removed.
CREATE TRIGGER order_deliveries_append_only
  BEFORE UPDATE OR DELETE ON order_deliveries
  FOR EACH ROW EXECUTE FUNCTION az_block_modification();

CREATE TRIGGER order_delivery_items_append_only
  BEFORE UPDATE OR DELETE ON order_delivery_items
  FOR EACH ROW EXECUTE FUNCTION az_block_modification();

-- Orders are never hard-deleted (cancel instead).
CREATE OR REPLACE FUNCTION az_order_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Orders cannot be deleted; cancel the order instead' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_no_delete BEFORE DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION az_order_no_delete();

-- Money / quantity rules
ALTER TABLE orders
  ADD CONSTRAINT orders_discount_within_subtotal CHECK (discount <= subtotal),
  ADD CONSTRAINT orders_effective_total_non_negative CHECK ("totalAmount" + "adjustmentsTotal" >= 0);

ALTER TABLE order_delivery_items
  ADD CONSTRAINT order_delivery_items_quantity_positive CHECK (quantity > 0);

ALTER TABLE order_adjustments
  ADD CONSTRAINT order_adjustments_amount_not_zero CHECK (amount <> 0);

ALTER TABLE garments
  ADD CONSTRAINT garments_prices_non_negative CHECK (
    "defaultStitchingPrice" >= 0 AND "defaultFabricConsumption" >= 0 AND "defaultPieceRate" >= 0);

-- Faster order screens
CREATE INDEX orders_open_delivery_idx ON orders ("expectedDeliveryDate") WHERE lifecycle IN ('OPEN', 'PARTIALLY_DELIVERED') AND "deletedAt" IS NULL;
CREATE INDEX orders_number_trgm_idx ON orders USING gin ("orderNumber" gin_trgm_ops);
CREATE INDEX payments_order_status_idx ON payments ("orderId", status);
