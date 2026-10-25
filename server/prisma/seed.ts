/**
 * Deterministic seed of FICTIONAL demonstration data. Not real chemical-store records.
 *   SEED_DEMO_PASSWORD='<>=12 chars>' npm run db:seed
 * - Refused when NODE_ENV=production (unless ALLOW_DEMO_SEED=true is set deliberately).
 * - No default password exists: every demo account uses the password you supply, which is never printed.
 * - Idempotent: re-running does not duplicate rows or add opening stock twice.
 * - Opening stock is recorded as RECEIPT transactions so balances always reconcile with the ledger.
 */
import { createHash } from "node:crypto";
import { hashPassword, passwordPolicy } from "../src/common/password.js";
import { createScriptPrisma } from "../src/db/script-client.js";

/** Stable UUIDs (RFC 4122 v5-style) so repeated seeds hit the same rows. */
function stableUuid(name: string): string {
  const h = createHash("sha1").update(`cims-demo:${name}`).digest();
  h[6] = ((h[6] ?? 0) & 0x0f) | 0x50;
  h[8] = ((h[8] ?? 0) & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

const USERS = [
  { code: "DEMO-ADM-01", name: "Demo Administrator", role: "ADMIN" },
  { code: "DEMO-ADM-02", name: "Demo Second Administrator", role: "ADMIN" },
  { code: "DEMO-SK-01", name: "Demo Storekeeper", role: "STOREKEEPER" },
  { code: "DEMO-EMP-01", name: "Demo Employee One", role: "EMPLOYEE" },
  { code: "DEMO-EMP-02", name: "Demo Employee Two", role: "EMPLOYEE" },
  { code: "DEMO-EMP-03", name: "Demo Employee Three", role: "EMPLOYEE" },
] as const;

type Pack = { label: string; type: "MASS" | "VOLUME"; qty: number; stock: number; min: number };
const CHEMICALS: { code: string; name: string; category: string; rack: string; packs: Pack[] }[] = [
  {
    code: "DEMO-0001",
    name: "Demo Acid A (fictional)",
    category: "Acid",
    rack: "R-01",
    packs: [
      { label: "500 ml", type: "VOLUME", qty: 500, stock: 40, min: 10 },
      { label: "1000 ml", type: "VOLUME", qty: 1000, stock: 30, min: 10 },
      { label: "2.5 L", type: "VOLUME", qty: 2500, stock: 12, min: 4 },
    ],
  },
  {
    code: "DEMO-0002",
    name: "Demo Acid B (fictional)",
    category: "Acid",
    rack: "R-02",
    packs: [
      { label: "500 ml", type: "VOLUME", qty: 500, stock: 25, min: 8 },
      { label: "1000 ml", type: "VOLUME", qty: 1000, stock: 18, min: 6 },
    ],
  },
  {
    code: "DEMO-0003",
    name: "Demo Alkali (fictional)",
    category: "Alkali",
    rack: "R-03",
    packs: [
      { label: "100 g", type: "MASS", qty: 100, stock: 35, min: 10 },
      { label: "500 g", type: "MASS", qty: 500, stock: 20, min: 5 },
      { label: "1 kg", type: "MASS", qty: 1000, stock: 9, min: 3 },
    ],
  },
  {
    code: "DEMO-0004",
    name: "Demo Oxidiser Solution (fictional)",
    category: "Solution",
    rack: "R-04",
    packs: [
      { label: "500 ml", type: "VOLUME", qty: 500, stock: 15, min: 5 },
      { label: "2.5 L", type: "VOLUME", qty: 2500, stock: 8, min: 3 },
    ],
  },
  // Deliberately below its threshold so low-stock reports have something to show.
  {
    code: "DEMO-0005",
    name: "Demo Coagulant Salt (fictional)",
    category: "Salt",
    rack: "R-05",
    packs: [
      { label: "100 g", type: "MASS", qty: 100, stock: 4, min: 6 },
      { label: "500 g", type: "MASS", qty: 500, stock: 3, min: 5 },
    ],
  },
  {
    code: "DEMO-0006",
    name: "Demo Polymer Powder (fictional)",
    category: "Polymer",
    rack: "R-06",
    packs: [
      { label: "500 g", type: "MASS", qty: 500, stock: 22, min: 6 },
      { label: "1 kg", type: "MASS", qty: 1000, stock: 14, min: 4 },
    ],
  },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error(
      "Refusing to seed demo data when NODE_ENV=production. Set ALLOW_DEMO_SEED=true only for a throw-away demo database.",
    );
  }
  const password = process.env.SEED_DEMO_PASSWORD ?? "";
  const parsed = passwordPolicy.safeParse(password);
  if (!parsed.success)
    throw new Error("SEED_DEMO_PASSWORD is required (12-128 characters). There is deliberately no default.");

  const db = createScriptPrisma();
  try {
    const passwordHash = await hashPassword(password);
    const ids = new Map<string, string>();
    for (const u of USERS) {
      const id = stableUuid(`user:${u.code}`);
      ids.set(u.code, id);
      await db.user.upsert({
        where: { employeeCode: u.code },
        update: {},
        create: {
          id,
          employeeCode: u.code,
          fullName: u.name,
          email: `${u.code.toLowerCase()}@demo.invalid`,
          role: u.role,
          passwordHash,
        },
      });
    }
    const adminId = ids.get("DEMO-ADM-01") as string;
    const storekeeperId = ids.get("DEMO-SK-01") as string;

    let receipts = 0;
    for (const c of CHEMICALS) {
      const chemicalId = stableUuid(`chemical:${c.code}`);
      await db.chemical.upsert({
        where: { chemicalCode: c.code },
        update: {},
        create: {
          id: chemicalId,
          chemicalCode: c.code,
          name: c.name,
          category: c.category,
          storageLocation: c.rack,
          createdBy: adminId,
        },
      });
      for (const p of c.packs) {
        const packSizeId = stableUuid(`pack:${c.code}:${p.label}`);
        await db.packSize.upsert({
          where: { chemicalId_label: { chemicalId, label: p.label } },
          update: {},
          create: {
            id: packSizeId,
            chemicalId,
            label: p.label,
            unitType: p.type,
            baseUnit: p.type === "MASS" ? "g" : "ml",
            baseQuantity: String(p.qty),
          },
        });
        await db.inventoryBalance.upsert({
          where: { packSizeId },
          update: {},
          create: { chemicalId, packSizeId, minimumQuantity: p.min },
        });
        const key = `seed-opening:${packSizeId}`;
        const already = await db.stockTransaction.findUnique({ where: { idempotencyKey: key } });
        if (!already) {
          await db.$transaction(async (tx) => {
            await tx.stockTransaction.create({
              data: {
                chemicalId,
                packSizeId,
                transactionType: "RECEIPT",
                quantity: p.stock,
                performedBy: storekeeperId,
                reason: "Opening stock (fictional demo data)",
                idempotencyKey: key,
              },
            });
            await tx.inventoryBalance.update({
              where: { packSizeId },
              data: { onHandQuantity: { increment: p.stock }, version: { increment: 1 } },
            });
          });
          receipts++;
        }
      }
    }
    console.log(
      `Seed complete: ${USERS.length} users, ${CHEMICALS.length} chemicals, ${receipts} opening-stock receipts added.`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "Seed failed");
  process.exit(1);
});
