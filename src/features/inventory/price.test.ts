// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings } from "@/db/schema";
import { createProduct, updateProduct } from "./queries";

let db: TestDb;
let orgId: string;
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [org] = await db
    .insert(organizations)
    .values({ name: "Precio", slug: "adprecio" })
    .returning();
  orgId = org.id;
  await db.insert(orgSettings).values({ orgId, baseCurrency: "CUP" });
});

describe("precio de venta en el form de productos", () => {
  it("crea con precio decimal → cents y vacío = 0", async () => {
    const p = await createProduct(db, orgId, USER, {
      name: "Jabón",
      unit: "unit",
      price: "125.50",
    });
    expect(p.priceCents).toBe(12550n);

    const sin = await createProduct(db, orgId, USER, {
      name: "SinPrecio",
      unit: "unit",
    });
    expect(sin.priceCents).toBe(0n);
  });

  it("actualiza el precio (coma decimal aceptada)", async () => {
    const p = await createProduct(db, orgId, USER, {
      name: "Suavizante",
      unit: "L",
      price: "80.00",
    });
    const upd = await updateProduct(db, orgId, USER, p.id, {
      name: "Suavizante",
      unit: "L",
      price: "95,25",
    });
    expect(upd.priceCents).toBe(9525n);
  });
});
