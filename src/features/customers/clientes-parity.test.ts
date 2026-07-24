// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings } from "@/db/schema";
import { createCustomer } from "./queries";
import {
  createSale,
  confirmSale,
  accountsReceivableGrouped,
} from "@/features/sales/queries";
import { createProduct, registerMovement } from "@/features/inventory/queries";

let db: TestDb;
let orgId: string;
const USER = null;

let seq = 0;
const key = () =>
  `adc10000-0000-4000-8000-0000000000${String(++seq).padStart(2, "0")}`;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [org] = await db
    .insert(organizations)
    .values({ name: "ClientesFiel", slug: "adclientes" })
    .returning();
  orgId = org.id;
  await db.insert(orgSettings).values({ orgId, baseCurrency: "CUP" });
});

describe("paridad clientes — campos retrocompatibles con defaults", () => {
  it("sin customerType/active/blocked explícitos → defaults del ERP", async () => {
    const c = await createCustomer(db, orgId, USER, { name: "Legacy" });
    expect(c.customerType).toBe("CLIENTE");
    expect(c.active).toBe(true);
    expect(c.blocked).toBe(false);
  });

  it("crea PDV con datos financieros informativos", async () => {
    const c = await createCustomer(db, orgId, USER, {
      name: "Bodega El Sol",
      customerType: "PDV",
      paymentTerms: "30 días",
      creditDays: 30,
      creditLimit: "5000.00",
      discountDefaultPct: "5",
      category: "VIP",
    });
    expect(c.customerType).toBe("PDV");
    expect(c.paymentTerms).toBe("30 días");
    expect(c.creditDays).toBe(30);
    expect(c.creditLimitCents).toBe(500000n);
    expect(c.category).toBe("VIP");
  });

  it("bloqueado con motivo", async () => {
    const c = await createCustomer(db, orgId, USER, {
      name: "Deudor Crónico",
      active: true,
      blocked: true,
      blockReason: "Deuda vencida 90+",
    });
    expect(c.blocked).toBe(true);
    expect(c.blockReason).toBe("Deuda vencida 90+");
  });
});

describe("paridad clientes — tipo=CLIENTE|PDV filtra CxC (ERP)", () => {
  it("accountsReceivableGrouped respeta el filtro por tipo del cliente", async () => {
    const cliente = await createCustomer(db, orgId, USER, {
      name: "Juana Peña",
      customerType: "CLIENTE",
    });
    const pdv = await createCustomer(db, orgId, USER, {
      name: "Kiosco 5ta",
      customerType: "PDV",
    });
    const product = await createProduct(db, orgId, USER, {
      name: "Detergente",
      unit: "L",
    });
    await registerMovement(db, orgId, USER, {
      productId: product.id,
      kind: "in",
      qty: "100",
      unitCostCents: 10_00n,
    });

    for (const cust of [cliente, pdv]) {
      const s = await createSale(db, orgId, USER, {
        customerId: cust.id,
        currency: "CUP",
        rateToBase: "1",
        idempotencyKey: key(),
        items: [
          {
            productId: product.id,
            description: "d",
            qty: "1",
            unitPriceCents: 50_00n,
          },
        ],
      });
      await confirmSale(db, orgId, USER, s.id);
    }

    const todos = await accountsReceivableGrouped(db, orgId);
    expect(todos).toHaveLength(2);

    const soloClientes = await accountsReceivableGrouped(db, orgId, "CLIENTE");
    expect(soloClientes).toHaveLength(1);
    expect(soloClientes[0].customerName).toBe("Juana Peña");

    const soloPdv = await accountsReceivableGrouped(db, orgId, "PDV");
    expect(soloPdv).toHaveLength(1);
    expect(soloPdv[0].customerName).toBe("Kiosco 5ta");
  });
});
