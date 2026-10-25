import { conflict, forbidden, notFound } from "../../common/errors.js";
import { pageMeta, skipTake, type PageQuery } from "../../common/pagination.js";
import { can, type Actor } from "../../common/permissions.js";
import { getPrisma, type Tx } from "../../db/client.js";
import { recordAudit, type ServiceContext } from "../audit/audit.service.js";

const BASE_UNIT = { MASS: "g", VOLUME: "ml", COUNT: "piece" } as const;
type UnitType = keyof typeof BASE_UNIT;

const chemicalInclude = {
  packSizes: {
    include: { balance: true },
    orderBy: [{ unitType: "asc" as const }, { baseQuantity: "asc" as const }],
  },
};

type ChemicalRow = {
  id: string;
  chemicalCode: string;
  name: string;
  description: string | null;
  category: string | null;
  hazardNotes: string | null;
  storageLocation: string | null;
  minimumStockAlert: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  packSizes: {
    id: string;
    label: string;
    unitType: UnitType;
    baseUnit: "g" | "ml" | "piece";
    baseQuantity: { toString(): string };
    isActive: boolean;
    balance: { onHandQuantity: number; reservedQuantity: number; minimumQuantity: number } | null;
  }[];
};

/** Everyone sees available stock; on-hand/reserved/threshold detail is limited to ADMIN and STOREKEEPER. */
export function toChemicalDto(row: ChemicalRow, detailed: boolean) {
  return {
    id: row.id,
    chemicalCode: row.chemicalCode,
    name: row.name,
    description: row.description,
    category: row.category,
    hazardNotes: row.hazardNotes,
    storageLocation: row.storageLocation,
    minimumStockAlert: row.minimumStockAlert,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    packSizes: row.packSizes.map((p) => {
      const b = p.balance;
      const available = b ? b.onHandQuantity - b.reservedQuantity : 0;
      return {
        id: p.id,
        label: p.label,
        unitType: p.unitType,
        baseUnit: p.baseUnit,
        baseQuantity: p.baseQuantity.toString(),
        isActive: p.isActive,
        balance: b
          ? {
              available,
              lowStock: b.minimumQuantity > 0 && available <= b.minimumQuantity,
              ...(detailed
                ? {
                    onHand: b.onHandQuantity,
                    reserved: b.reservedQuantity,
                    minimumQuantity: b.minimumQuantity,
                  }
                : {}),
            }
          : null,
      };
    }),
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

export async function listChemicals(
  actor: Actor,
  q: PageQuery & { q?: string; category?: string; isActive?: boolean },
) {
  const detailed = can(actor.role, "inventory:view-detail");
  // Employees only ever see active chemicals, regardless of the filter they send.
  const isActive = detailed ? q.isActive : true;
  const where = {
    ...(isActive === undefined ? {} : { isActive }),
    ...(q.category ? { category: { equals: q.category, mode: "insensitive" as const } } : {}),
    ...(q.q
      ? {
          OR: [
            { chemicalCode: { contains: escapeLike(q.q), mode: "insensitive" as const } },
            { name: { contains: escapeLike(q.q), mode: "insensitive" as const } },
            { storageLocation: { contains: escapeLike(q.q), mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const db = getPrisma();
  const [rows, total] = await Promise.all([
    db.chemical.findMany({
      where,
      orderBy: { chemicalCode: "asc" },
      include: {
        packSizes: {
          ...chemicalInclude.packSizes,
          ...(detailed ? {} : { where: { isActive: true } }),
        },
      },
      ...skipTake(q),
    }),
    db.chemical.count({ where }),
  ]);
  return {
    data: rows.map((r) => toChemicalDto(r as unknown as ChemicalRow, detailed)),
    meta: pageMeta(q, total),
  };
}

export async function getChemical(actor: Actor, id: string) {
  const detailed = can(actor.role, "inventory:view-detail");
  const row = await getPrisma().chemical.findFirst({
    where: { id, ...(detailed ? {} : { isActive: true }) },
    include: {
      packSizes: { ...chemicalInclude.packSizes, ...(detailed ? {} : { where: { isActive: true } }) },
    },
  });
  if (!row) throw notFound("Chemical");
  return toChemicalDto(row as unknown as ChemicalRow, detailed);
}

async function addPackSize(
  tx: Tx,
  chemical: { id: string; minimumStockAlert: number },
  p: { label: string; unitType: UnitType; baseQuantity: number },
) {
  const pack = await tx.packSize.create({
    data: {
      chemicalId: chemical.id,
      label: p.label,
      unitType: p.unitType,
      baseUnit: BASE_UNIT[p.unitType], // derived, never client-supplied: mass and volume cannot be mixed
      baseQuantity: String(p.baseQuantity),
    },
  });
  // Every pack size gets exactly one balance row, starting at zero (stock arrives through RECEIPT transactions).
  await tx.inventoryBalance.create({
    data: { chemicalId: chemical.id, packSizeId: pack.id, minimumQuantity: chemical.minimumStockAlert },
  });
  return pack;
}

export async function createChemical(
  ctx: ServiceContext,
  input: {
    chemicalCode: string;
    name: string;
    description?: string;
    category?: string;
    hazardNotes?: string;
    storageLocation?: string;
    minimumStockAlert: number;
    packSizes: { label: string; unitType: UnitType; baseQuantity: number }[];
  },
) {
  if (!ctx.actorId) throw forbidden();
  const db = getPrisma();
  const id = await db.$transaction(async (tx) => {
    const exists = await tx.chemical.findUnique({
      where: { chemicalCode: input.chemicalCode },
      select: { id: true },
    });
    if (exists) throw conflict("DUPLICATE_RESOURCE", "A chemical with this code already exists.");
    const { packSizes, ...fields } = input;
    const chemical = await tx.chemical.create({ data: { ...fields, createdBy: ctx.actorId as string } });
    for (const p of packSizes) await addPackSize(tx, chemical, p);
    await recordAudit(tx, ctx, {
      action: "CHEMICAL_CREATED",
      entityType: "chemical",
      entityId: chemical.id,
      after: { ...fields, packSizes },
    });
    return chemical.id;
  });
  return getChemical({ id: ctx.actorId, role: "ADMIN" }, id);
}

export async function updateChemical(ctx: ServiceContext, id: string, patch: Record<string, unknown>) {
  await getPrisma().$transaction(async (tx) => {
    const before = await tx.chemical.findUnique({ where: { id } });
    if (!before) throw notFound("Chemical");
    const after = await tx.chemical.update({ where: { id }, data: patch });
    await recordAudit(tx, ctx, {
      action: "CHEMICAL_UPDATED",
      entityType: "chemical",
      entityId: id,
      before,
      after,
    });
  });
  return getChemical({ id: ctx.actorId ?? "", role: "ADMIN" }, id);
}

export async function createPackSize(
  ctx: ServiceContext,
  chemicalId: string,
  input: { label: string; unitType: UnitType; baseQuantity: number },
) {
  const packId = await getPrisma().$transaction(async (tx) => {
    const chemical = await tx.chemical.findUnique({ where: { id: chemicalId } });
    if (!chemical) throw notFound("Chemical");
    const dup = await tx.packSize.findFirst({
      where: {
        chemicalId,
        OR: [
          { label: input.label },
          { baseUnit: BASE_UNIT[input.unitType], baseQuantity: String(input.baseQuantity) },
        ],
      },
      select: { id: true },
    });
    if (dup) throw conflict("DUPLICATE_RESOURCE", "This pack size already exists for the chemical.");
    const pack = await addPackSize(tx, chemical, input);
    await recordAudit(tx, ctx, {
      action: "PACK_SIZE_CREATED",
      entityType: "pack_size",
      entityId: pack.id,
      after: { chemicalId, ...input },
    });
    return pack.id;
  });
  const chem = await getChemical({ id: ctx.actorId ?? "", role: "ADMIN" }, chemicalId);
  const pack = chem.packSizes.find((p) => p.id === packId);
  if (!pack) throw notFound("Pack size");
  return pack;
}

/** Only label and active flag may change; unit and quantity are immutable so historical transactions keep their meaning. */
export async function updatePackSize(
  ctx: ServiceContext,
  chemicalId: string,
  packSizeId: string,
  patch: { label?: string; isActive?: boolean },
) {
  await getPrisma().$transaction(async (tx) => {
    const before = await tx.packSize.findFirst({ where: { id: packSizeId, chemicalId } });
    if (!before) throw notFound("Pack size");
    const after = await tx.packSize.update({ where: { id: packSizeId }, data: patch });
    await recordAudit(tx, ctx, {
      action: "PACK_SIZE_UPDATED",
      entityType: "pack_size",
      entityId: packSizeId,
      before,
      after,
    });
  });
  const chem = await getChemical({ id: ctx.actorId ?? "", role: "ADMIN" }, chemicalId);
  const pack = chem.packSizes.find((p) => p.id === packSizeId);
  if (!pack) throw notFound("Pack size");
  return pack;
}
