import { notFound } from "../../common/errors.js";
import { pageMeta, type PageQuery } from "../../common/pagination.js";
import { getPrisma } from "../../db/client.js";
import { recordAudit, type ServiceContext } from "../audit/audit.service.js";

export interface BalanceFilter {
  q?: string;
  lowOnly?: boolean;
  chemicalId?: string;
}

interface BalanceRow {
  id: string;
  chemical_id: string;
  chemical_code: string;
  chemical_name: string;
  storage_location: string | null;
  chemical_active: boolean;
  pack_size_id: string;
  pack_label: string;
  unit_type: "MASS" | "VOLUME" | "COUNT";
  base_unit: "g" | "ml" | "piece";
  base_quantity: string;
  pack_active: boolean;
  on_hand_quantity: number;
  reserved_quantity: number;
  minimum_quantity: number;
  version: number;
  updated_at: Date;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

const BASE_SQL = `
  FROM inventory_balances b
  JOIN chemicals c ON c.id = b.chemical_id
  JOIN pack_sizes p ON p.id = b.pack_size_id
 WHERE ($1::text IS NULL OR c.chemical_code ILIKE $1 OR c.name ILIKE $1 OR c.storage_location ILIKE $1)
   AND ($2::boolean = false OR (b.minimum_quantity > 0 AND b.on_hand_quantity - b.reserved_quantity <= b.minimum_quantity))
   AND ($3::uuid IS NULL OR c.id = $3::uuid)`;

const SELECT_SQL = `
SELECT b.id::text AS id, c.id::text AS chemical_id, c.chemical_code, c.name AS chemical_name, c.storage_location,
       c.is_active AS chemical_active, p.id::text AS pack_size_id, p.label AS pack_label, p.unit_type::text AS unit_type,
       p.base_unit::text AS base_unit, p.base_quantity::text AS base_quantity, p.is_active AS pack_active,
       b.on_hand_quantity, b.reserved_quantity, b.minimum_quantity, b.version, b.updated_at
${BASE_SQL}
 ORDER BY c.chemical_code, p.unit_type, p.base_quantity
 LIMIT $4 OFFSET $5`;

export const toBalanceDto = (r: BalanceRow) => {
  const available = r.on_hand_quantity - r.reserved_quantity;
  return {
    id: r.id,
    chemicalId: r.chemical_id,
    chemicalCode: r.chemical_code,
    chemicalName: r.chemical_name,
    storageLocation: r.storage_location,
    chemicalActive: r.chemical_active,
    packSizeId: r.pack_size_id,
    packLabel: r.pack_label,
    unitType: r.unit_type,
    baseUnit: r.base_unit,
    baseQuantity: r.base_quantity,
    packActive: r.pack_active,
    onHandQuantity: r.on_hand_quantity,
    reservedQuantity: r.reserved_quantity,
    availableQuantity: available,
    minimumQuantity: r.minimum_quantity,
    lowStock: r.minimum_quantity > 0 && available <= r.minimum_quantity,
    version: r.version,
    updatedAt: r.updated_at,
  };
};
export type BalanceDto = ReturnType<typeof toBalanceDto>;

/** Parameterised raw SQL (values are bound, never concatenated) — needed for the column-to-column low-stock comparison. */
export async function queryBalances(
  filter: BalanceFilter,
  page: { limit: number; offset: number },
): Promise<{ rows: BalanceDto[]; total: number }> {
  const db = getPrisma();
  const like = filter.q ? `%${escapeLike(filter.q)}%` : null;
  const args = [like, filter.lowOnly ?? false, filter.chemicalId ?? null] as const;
  const [rows, count] = await Promise.all([
    db.$queryRawUnsafe<BalanceRow[]>(SELECT_SQL, ...args, page.limit, page.offset),
    db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n ${BASE_SQL}`, ...args),
  ]);
  return { rows: rows.map(toBalanceDto), total: Number(count[0]?.n ?? 0) };
}

export async function listBalances(q: PageQuery & BalanceFilter) {
  const { rows, total } = await queryBalances(q, { limit: q.pageSize, offset: (q.page - 1) * q.pageSize });
  return { data: rows, meta: pageMeta(q, total) };
}

export async function setMinimumQuantity(ctx: ServiceContext, packSizeId: string, minimumQuantity: number) {
  const db = getPrisma();
  await db.$transaction(async (tx) => {
    const before = await tx.inventoryBalance.findUnique({ where: { packSizeId } });
    if (!before) throw notFound("Inventory balance");
    const after = await tx.inventoryBalance.update({ where: { packSizeId }, data: { minimumQuantity } });
    await recordAudit(tx, ctx, {
      action: "INVENTORY_THRESHOLD_CHANGED",
      entityType: "inventory_balance",
      entityId: before.id,
      before: { minimumQuantity: before.minimumQuantity },
      after: { minimumQuantity: after.minimumQuantity },
    });
  });
  const { rows } = await queryBalances({}, { limit: 500, offset: 0 });
  const dto = rows.find((r) => r.packSizeId === packSizeId);
  if (!dto) throw notFound("Inventory balance");
  return dto;
}
