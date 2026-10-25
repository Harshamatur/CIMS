-- CIMS 0002_integrity — sequence, CHECK constraints and append-only triggers.
-- These objects are not expressible in schema.prisma; Prisma ignores CHECK constraints and triggers when diffing.

CREATE SEQUENCE "request_number_seq" AS BIGINT START WITH 1 INCREMENT BY 1;

ALTER TABLE "chemicals" ADD CONSTRAINT "chk_chemicals_min_alert_nonneg" CHECK ("minimum_stock_alert" >= 0);

ALTER TABLE "pack_sizes"
  ADD CONSTRAINT "chk_pack_sizes_base_quantity_positive" CHECK ("base_quantity" > 0),
  ADD CONSTRAINT "chk_pack_sizes_unit_consistent" CHECK (
    ("unit_type" = 'MASS' AND "base_unit" = 'g') OR
    ("unit_type" = 'VOLUME' AND "base_unit" = 'ml') OR
    ("unit_type" = 'COUNT' AND "base_unit" = 'piece')
  );

ALTER TABLE "inventory_balances"
  ADD CONSTRAINT "chk_inventory_on_hand_nonneg" CHECK ("on_hand_quantity" >= 0),
  ADD CONSTRAINT "chk_inventory_reserved_nonneg" CHECK ("reserved_quantity" >= 0),
  ADD CONSTRAINT "chk_inventory_available_nonneg" CHECK ("reserved_quantity" <= "on_hand_quantity"),
  ADD CONSTRAINT "chk_inventory_minimum_nonneg" CHECK ("minimum_quantity" >= 0),
  ADD CONSTRAINT "chk_inventory_version_positive" CHECK ("version" >= 1);

ALTER TABLE "chemical_requests"
  ADD CONSTRAINT "chk_requests_submitted_fields" CHECK (
    "status" = 'DRAFT' OR ("request_number" IS NOT NULL AND "submitted_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "chk_requests_rejection_reason" CHECK (
    "status" <> 'REJECTED' OR ("rejection_reason" IS NOT NULL AND char_length(btrim("rejection_reason")) >= 10)
  ),
  ADD CONSTRAINT "chk_requests_decision_fields" CHECK (
    "status" NOT IN ('APPROVED', 'REJECTED', 'PARTIALLY_ISSUED', 'ISSUED')
    OR ("decided_by" IS NOT NULL AND "decided_at" IS NOT NULL)
  );

ALTER TABLE "request_items"
  ADD CONSTRAINT "chk_items_requested_positive" CHECK ("requested_quantity" > 0),
  ADD CONSTRAINT "chk_items_approved_range" CHECK ("approved_quantity" IS NULL OR ("approved_quantity" >= 0 AND "approved_quantity" <= "requested_quantity")),
  ADD CONSTRAINT "chk_items_issued_nonneg" CHECK ("issued_quantity" >= 0),
  ADD CONSTRAINT "chk_items_issued_within_approved" CHECK ("issued_quantity" <= COALESCE("approved_quantity", 0));

ALTER TABLE "stock_transactions"
  ADD CONSTRAINT "chk_tx_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "chk_tx_reason_required" CHECK (
    "transaction_type" IN ('ISSUE') OR ("reason" IS NOT NULL AND char_length(btrim("reason")) >= 3)
  ),
  ADD CONSTRAINT "chk_tx_reversal_link" CHECK (("transaction_type" = 'REVERSAL') = ("reversal_of_id" IS NOT NULL)),
  ADD CONSTRAINT "chk_tx_issue_link" CHECK (("transaction_type" = 'ISSUE') = ("request_item_id" IS NOT NULL));

CREATE FUNCTION cims_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not permitted: table is append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER "trg_stock_transactions_append_only" BEFORE UPDATE OR DELETE ON "stock_transactions"
  FOR EACH ROW EXECUTE FUNCTION cims_forbid_mutation();
CREATE TRIGGER "trg_stock_transactions_no_truncate" BEFORE TRUNCATE ON "stock_transactions"
  FOR EACH STATEMENT EXECUTE FUNCTION cims_forbid_mutation();
CREATE TRIGGER "trg_audit_logs_append_only" BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION cims_forbid_mutation();
CREATE TRIGGER "trg_audit_logs_no_truncate" BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION cims_forbid_mutation();
