// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings, payments, sales } from "@/db/schema";
import { createCustomer } from "@/features/customers/queries";
import { createProduct, registerMovement } from "@/features/inventory/queries";
import {
  createSale,
  confirmSale,
  createCashSale,
  paymentStatus,
  cobrosResumen,
  accountsReceivableGrouped,
} from "./queries";

let db: TestDb;
let orgId: string;
let customerId: string;
let productId: string;
const USER = null;
const DAY = 24 * 60 * 60 * 1000;

let seq = 0;
const key = () =>
  `ad0000ff-0000-4000-8000-0000000000${String(++seq).padStart(2, "0")}`;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [org] = await db
    .insert(organizations)
    .values({ name: "VentasFiel", slug: "adventas" })
    .returning();
  orgId = org.id;
  await db.insert(orgSettings).values({ orgId, baseCurrency: "CUP" });
  customerId = (await createCustomer(db, orgId, USER, { name: "Bodega" })).id;
  const p = await createProduct(db, orgId, USER, {
    name: "Jabón",
    unit: "unit",
    price: "100.00",
  });
  productId = p.id;
  await registerMovement(db, orgId, USER, {
    productId,
    kind: "in",
    qty: "100",
    unitCostCents: 50_00n,
  });
});

const item = (qty = "1") => ({
  productId,
  description: "jabón",
  qty,
  unitPriceCents: 100_00n,
});

describe("paridad ventas — descuento, IVA y fecha", () => {
  it("total = max(0, subtotal + IVA − descuento) como el ERP", async () => {
    const s = await createSale(db, orgId, USER, {
      customerId,
      currency: "CUP",
      rateToBase: "1",
      idempotencyKey: key(),
      items: [item()],
      taxPct: "10",
      discountCents: 30_00n,
      poNumber: "OC-77",
      note: "entregar temprano",
    });
    expect(s.taxCents).toBe(10_00n);
    expect(s.discountCents).toBe(30_00n);
    expect(s.totalCents).toBe(80_00n);
    expect(s.totalBaseCents).toBe(80_00n);
    expect(s.poNumber).toBe("OC-77");
    expect(s.note).toBe("entregar temprano");
  });

  it("descuento mayor que el subtotal → total 0 (clamp del ERP)", async () => {
    const s = await createSale(db, orgId, USER, {
      customerId,
      currency: "CUP",
      rateToBase: "1",
      idempotencyKey: key(),
      items: [item()],
      discountCents: 500_00n,
    });
    expect(s.totalCents).toBe(0n);
  });

  it("rechaza fecha futura y respeta la retroactiva al confirmar", async () => {
    await expect(
      createSale(db, orgId, USER, {
        customerId,
        currency: "CUP",
        rateToBase: "1",
        idempotencyKey: key(),
        items: [item()],
        soldAt: new Date(Date.now() + DAY),
      }),
    ).rejects.toThrow("La fecha no puede ser futura");

    const ayer = new Date(Date.now() - DAY);
    const s = await createSale(db, orgId, USER, {
      customerId,
      currency: "CUP",
      rateToBase: "1",
      idempotencyKey: key(),
      items: [item()],
      soldAt: ayer,
    });
    const confirmed = await confirmSale(db, orgId, USER, s.id);
    expect(confirmed.soldAt!.getTime()).toBe(ayer.getTime());
  });
});

describe("paridad ventas — contado en un paso (Cobrar Ahora)", () => {
  it("crea+confirma+cobra en una tx; varios métodos = MIXTO del ERP", async () => {
    const s = await createCashSale(db, orgId, USER, {
      customerId,
      currency: "CUP",
      rateToBase: "1",
      idempotencyKey: key(),
      items: [item()],
      discountCents: 20_00n,
      payments: [
        { method: "cash", amountCents: 50_00n },
        { method: "transfer", amountCents: 30_00n },
      ],
    });
    expect(s.status).toBe("confirmed");
    expect(s.number).not.toBeNull();
    const pays = await db
      .select()
      .from(payments)
      .where(and(eq(payments.orgId, orgId), eq(payments.saleId, s.id)));
    expect(pays).toHaveLength(2);
    expect(paymentStatus(s, 80_00n)).toBe("PAGADA");
  });

  it("mensajes literales de cobertura: faltan / exceden", async () => {
    const base = {
      customerId,
      currency: "CUP",
      rateToBase: "1",
      items: [item()],
    };
    await expect(
      createCashSale(db, orgId, USER, {
        ...base,
        idempotencyKey: key(),
        payments: [{ method: "cash", amountCents: 10_00n }],
      }),
    ).rejects.toThrow("Faltan 90.00 por cubrir en los pagos");
    await expect(
      createCashSale(db, orgId, USER, {
        ...base,
        idempotencyKey: key(),
        payments: [{ method: "cash", amountCents: 105_00n }],
      }),
    ).rejects.toThrow("Los pagos exceden el total por 5.00");
  });

  it("sin pagos: autocompleta un pago cash por el total (ERP)", async () => {
    const s = await createCashSale(db, orgId, USER, {
      customerId,
      currency: "CUP",
      rateToBase: "1",
      idempotencyKey: key(),
      items: [item()],
      payments: [],
    });
    const pays = await db
      .select()
      .from(payments)
      .where(eq(payments.saleId, s.id));
    expect(pays).toHaveLength(1);
    expect(pays[0].amountCents).toBe(100_00n);
    expect(pays[0].method).toBe("cash");
  });

  it("idempotente: repetir el key no duplica venta ni pagos", async () => {
    const k = key();
    const input = {
      customerId,
      currency: "CUP",
      rateToBase: "1",
      idempotencyKey: k,
      items: [item()],
      payments: [{ method: "cash", amountCents: 100_00n }],
    };
    const s1 = await createCashSale(db, orgId, USER, input);
    const s2 = await createCashSale(db, orgId, USER, input);
    expect(s2.id).toBe(s1.id);
    const pays = await db
      .select()
      .from(payments)
      .where(eq(payments.saleId, s1.id));
    expect(pays).toHaveLength(1);
    const rows = await db
      .select()
      .from(sales)
      .where(and(eq(sales.orgId, orgId), eq(sales.idempotencyKey, k)));
    expect(rows).toHaveLength(1);
  });
});

describe("paridad ventas — estado de cobro y CxC del ERP", () => {
  it("paymentStatus deriva BORRADOR/PENDIENTE/PARCIAL/PAGADA/CANCELADA", () => {
    const base = { status: "confirmed", totalCents: 100n };
    expect(paymentStatus({ ...base, status: "draft" }, 0n)).toBe("BORRADOR");
    expect(paymentStatus({ ...base, status: "cancelled" }, 100n)).toBe(
      "CANCELADA",
    );
    expect(paymentStatus(base, 0n)).toBe("PENDIENTE");
    expect(paymentStatus(base, 50n)).toBe("PARCIAL");
    expect(paymentStatus(base, 100n)).toBe("PAGADA");
  });

  it("resumen de cobranza: vencida = >14 días desde la venta", async () => {
    const hace20 = new Date(Date.now() - 20 * DAY);
    const credito = await createSale(db, orgId, USER, {
      customerId,
      currency: "CUP",
      rateToBase: "1",
      idempotencyKey: key(),
      items: [item()],
      soldAt: hace20,
    });
    await confirmSale(db, orgId, USER, credito.id);
    const hoy = await createSale(db, orgId, USER, {
      customerId,
      currency: "CUP",
      rateToBase: "1",
      idempotencyKey: key(),
      items: [item()],
    });
    await confirmSale(db, orgId, USER, hoy.id);

    // la venta retroactiva del test anterior (confirmada sin cobrar) también
    // cuenta: 3 ventas con saldo, solo la de hace 20 días está vencida
    const r = await cobrosResumen(db, orgId);
    expect(r.num_ventas).toBe(3);
    expect(r.num_clientes).toBe(1);
    expect(r.max_dias_atraso).toBe(20);
    expect(r.num_vencidas).toBe(1);
    expect(r.total_adeudado_base_cents).toBe(300_00n);

    const grupos = await accountsReceivableGrouped(db, orgId);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].ventas).toHaveLength(3);
    expect(grupos[0].max_dias_atraso).toBe(20);
    expect(grupos[0].ventas[0].dias_atraso).toBe(20);
    expect(grupos[0].saldo_base_cents).toBe(300_00n);
  });
});
