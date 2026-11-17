-- CIMS 0001_init — hand-authored to mirror prisma/schema.prisma using Prisma's naming conventions.
-- NOTE: not yet verified against `prisma migrate diff` (Prisma engines were unavailable when written).

CREATE TYPE "role" AS ENUM ('EMPLOYEE', 'ADMIN', 'STOREKEEPER');
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');
CREATE TYPE "unit_type" AS ENUM ('MASS', 'VOLUME', 'COUNT');
CREATE TYPE "base_unit" AS ENUM ('g', 'ml', 'piece');
CREATE TYPE "request_status" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PARTIALLY_ISSUED', 'ISSUED', 'CANCELLED');
CREATE TYPE "decision" AS ENUM ('APPROVED', 'REJECTED');
CREATE TYPE "transaction_type" AS ENUM ('RECEIPT', 'ISSUE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVERSAL');

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_code" VARCHAR(32) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(254),
    "password_hash" TEXT NOT NULL,
    "role" "role" NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chemicals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chemical_code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100),
    "hazard_notes" TEXT,
    "storage_location" VARCHAR(60),
    "minimum_stock_alert" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "chemicals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pack_sizes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chemical_id" UUID NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "unit_type" "unit_type" NOT NULL,
    "base_unit" "base_unit" NOT NULL,
    "base_quantity" DECIMAL(12,3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "pack_sizes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_balances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chemical_id" UUID NOT NULL,
    "pack_size_id" UUID NOT NULL,
    "on_hand_quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
    "minimum_quantity" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chemical_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_number" VARCHAR(30),
    "requested_by" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "department" VARCHAR(100),
    "status" "request_status" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMPTZ(6),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "chemical_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "request_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "chemical_id" UUID NOT NULL,
    "pack_size_id" UUID NOT NULL,
    "requested_quantity" INTEGER NOT NULL,
    "approved_quantity" INTEGER,
    "issued_quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "request_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "reviewed_by" UUID NOT NULL,
    "decision" "decision" NOT NULL,
    "comments" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chemical_id" UUID NOT NULL,
    "pack_size_id" UUID NOT NULL,
    "transaction_type" "transaction_type" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "request_item_id" UUID,
    "performed_by" UUID NOT NULL,
    "reason" TEXT,
    "idempotency_key" VARCHAR(200),
    "reversal_of_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" UUID,
    "before_data" JSONB,
    "after_data" JSONB,
    "request_id" VARCHAR(100),
    "ip_address" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "session" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

CREATE UNIQUE INDEX "users_employee_code_key" ON "users"("employee_code");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

CREATE UNIQUE INDEX "chemicals_chemical_code_key" ON "chemicals"("chemical_code");
CREATE INDEX "chemicals_name_idx" ON "chemicals"("name");
CREATE INDEX "chemicals_storage_location_idx" ON "chemicals"("storage_location");
CREATE INDEX "chemicals_is_active_idx" ON "chemicals"("is_active");

CREATE UNIQUE INDEX "pack_sizes_chemical_id_label_key" ON "pack_sizes"("chemical_id", "label");
CREATE UNIQUE INDEX "pack_sizes_chemical_id_base_unit_base_quantity_key" ON "pack_sizes"("chemical_id", "base_unit", "base_quantity");
CREATE UNIQUE INDEX "pack_sizes_id_chemical_id_key" ON "pack_sizes"("id", "chemical_id");

CREATE UNIQUE INDEX "inventory_balances_pack_size_id_chemical_id_key" ON "inventory_balances"("pack_size_id", "chemical_id");
CREATE UNIQUE INDEX "inventory_balances_pack_size_id_key" ON "inventory_balances"("pack_size_id");

CREATE UNIQUE INDEX "chemical_requests_request_number_key" ON "chemical_requests"("request_number");
CREATE INDEX "chemical_requests_status_submitted_at_idx" ON "chemical_requests"("status", "submitted_at");
CREATE INDEX "chemical_requests_requested_by_created_at_idx" ON "chemical_requests"("requested_by", "created_at");
CREATE INDEX "chemical_requests_submitted_at_idx" ON "chemical_requests"("submitted_at");

CREATE UNIQUE INDEX "request_items_request_id_pack_size_id_key" ON "request_items"("request_id", "pack_size_id");
CREATE INDEX "request_items_chemical_id_idx" ON "request_items"("chemical_id");

CREATE UNIQUE INDEX "approval_actions_request_id_key" ON "approval_actions"("request_id");
CREATE INDEX "approval_actions_reviewed_by_idx" ON "approval_actions"("reviewed_by");

CREATE UNIQUE INDEX "stock_transactions_idempotency_key_key" ON "stock_transactions"("idempotency_key");
CREATE UNIQUE INDEX "stock_transactions_reversal_of_id_key" ON "stock_transactions"("reversal_of_id");
CREATE INDEX "stock_transactions_chemical_id_created_at_idx" ON "stock_transactions"("chemical_id", "created_at");
CREATE INDEX "stock_transactions_pack_size_id_created_at_idx" ON "stock_transactions"("pack_size_id", "created_at");
CREATE INDEX "stock_transactions_transaction_type_created_at_idx" ON "stock_transactions"("transaction_type", "created_at");
CREATE INDEX "stock_transactions_performed_by_created_at_idx" ON "stock_transactions"("performed_by", "created_at");
CREATE INDEX "stock_transactions_request_item_id_idx" ON "stock_transactions"("request_item_id");
CREATE INDEX "stock_transactions_created_at_idx" ON "stock_transactions"("created_at");

CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

CREATE INDEX "IDX_session_expire" ON "session"("expire");

ALTER TABLE "chemicals" ADD CONSTRAINT "chemicals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pack_sizes" ADD CONSTRAINT "pack_sizes_chemical_id_fkey" FOREIGN KEY ("chemical_id") REFERENCES "chemicals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_chemical_id_fkey" FOREIGN KEY ("chemical_id") REFERENCES "chemicals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_pack_size_id_chemical_id_fkey" FOREIGN KEY ("pack_size_id", "chemical_id") REFERENCES "pack_sizes"("id", "chemical_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chemical_requests" ADD CONSTRAINT "chemical_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chemical_requests" ADD CONSTRAINT "chemical_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "chemical_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_chemical_id_fkey" FOREIGN KEY ("chemical_id") REFERENCES "chemicals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_pack_size_id_chemical_id_fkey" FOREIGN KEY ("pack_size_id", "chemical_id") REFERENCES "pack_sizes"("id", "chemical_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "chemical_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_chemical_id_fkey" FOREIGN KEY ("chemical_id") REFERENCES "chemicals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_pack_size_id_chemical_id_fkey" FOREIGN KEY ("pack_size_id", "chemical_id") REFERENCES "pack_sizes"("id", "chemical_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_request_item_id_fkey" FOREIGN KEY ("request_item_id") REFERENCES "request_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "stock_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
