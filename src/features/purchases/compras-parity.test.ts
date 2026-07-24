// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings } from "@/db/schema";
import { createProduct } from "@/features/inventory/queries";
import { getStock } from "@/features/inventory/queries";
import {
  createSupplier,
  createPurchase,
  confirmPurchase,
  accountsPayable,
  accountsPayableGrouped,
  resumenPagos,
  marcarSinDeuda,
} from "./queries";

let db: TestDb;
let orgId: string;
let supplierId: string;
let productId: string;
const USER = null;
const DAY = 24 * 60 * 60 * 1000;

let seq = 0;
const key = () =>
  `adc000ff-0000-4000-8000-0000000000${String(++seq).padStart(2, "0")}`;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [org] = await db
    .insert(organizations)
    .values({ name: "ComprasFiel", slug: "adcompras" })
    .returning();
  orgId = org.id;
  await db.insert(orgSettings).values({ orgId, baseCurrency: "CUP" });
  supplierId = (
    await createSupplier(db, orgId, USER, {
      name: "Química SA",
      bankAccount: "9235-1234",
    })
  ).id;
  productId = (
    await createProduct(db, orgId, USER, { name: "Sosa", unit: "kg" })
  ).id;
});

const item = (qty = "10", unitCostCents = 100_00n) => ({
  productId,
  description: "sosa",
  qty,
  unitCostCents,
});

describe("paridad compras — gastos adicionales prorrateados", () => {
  it("total = subtotal + gastos; el prorrateo entra al costo del kardex", async () => {
    const p = await createPurchase(db, orgId, USER, {
      supplierId,
      currency: "CUP",
      rateToBase: "1",
      idempotencyKey: key(),
      items: [item()],
      transportCents: 50_00n,
      allowanceCents: 30_00n,
      otherCostsCents: 20_00n,
      supplierInvoice: "FAC-991",
      note: "urgente",
    });
    // subtotal 1000.00 + gastos 100.00
    expect(p.totalCents).toBe(1100_00n);
    expect(p.supplierInvoice).toBe("FAC-991");

    await confirmPurchase(db, orgId, USER, p.id);
    // ERP: costoUnitarioFinal = 100.00 + (100.00 × 1.0)/10 = 110.00
    const stock = await getStock(db, orgId, productId);
    expect(stock.avgCostCents).toBe(110_00n);
  });

  it("rechaza fecha futura y respeta la retroactiva al confirmar", async () => {
    await expect(
      createPurchase(db, orgId, USER, {
        supplierId,
        currency: "CUP",
        rateToBase: "1",
        idempotencyKey: key(),
        items: [item()],
        receivedAt: new Date(Date.now() + DAY),
      }),
    ).rejects.toThrow("La fecha no puede ser futura");

    const hace20 = new Date(Date.now() - 20 * DAY);
    const p = await createPurchase(db, orgId, USER, {
      supplierId,
      currency: "CUP",
      rateToBase: "1",
      idempotencyKey: key(),
      items: [item()],
      receivedAt: hace20,
      paymentTerms: "30 días",
    });
    const confirmed = await confirmPurchase(db, orgId, USER, p.id);
    expect(confirmed.receivedAt!.getTime()).toBe(hace20.getTime());
  });
});

describe("paridad compras — Contado/Crédito y CxP del ERP", () => {
  it("las compras de Contado quedan FUERA de CxP", async () => {
    const contado = await createPurchase(db, orgId, USER, {
      supplierId,
      currency: "CUP",
      rateToBase: "1",
      idempotencyKey: key(),
      items: [item()],
      paymentTerms: "Contado",
    });
    await confirmPurchase(db, orgId, USER, contado.id);
    const ap = await accountsPayable(db, orgId);
    expect(ap.map((p) => p.id)).not.toContain(contado.id);
  });

  it("CxP agrupada por proveedor con días de atraso y referencia bancaria", async () => {
    const grupos = await accountsPayableGrouped(db, orgId);
    expect(grupos).toHaveLength(1);
    const g = grupos[0];
    expect(g.supplierName).toBe("Química SA");
    expect(g.bankAccount).toBe("9235-1234");
    // dos compras a crédito con saldo (la de gastos y la retroactiva)
    expect(g.num_compras).toBe(2);
    expect(g.max_dias_atraso).toBe(20);
    expect(g.compras[0].dias_atraso).toBe(20);
    // 1100 + 1000 consolidado a base
    expect(g.total_adeudado_base_cents).toBe(2100_00n);
  });

  it("resumen de pagos del mes (excluye Contado)", async () => {
    const ahora = new Date();
    const r = await resumenPagos(db, orgId, {
      mes: ahora.getMonth() + 1,
      anio: ahora.getFullYear(),
    });
    // solo la compra con gastos quedó en el mes actual (la retro fue hace 20d
    // — puede o no caer en el mes; toleramos ambos casos con >=1)
    expect(r.num_compras).toBeGreaterThanOrEqual(1);
    expect(r.num_compras_sin_pago).toBe(r.num_compras);
    expect(r.pct_pagado).toBe(0);
    expect(r.saldo_total_base_cents).toBe(r.compras_total_base_cents);
  });

  it("marcar sin deuda: mensaje literal y sale de CxP", async () => {
    const antes = await accountsPayable(db, orgId);
    const target = antes[0];
    const r = await marcarSinDeuda(db, orgId, USER, target.id);
    expect(r.message).toBe(
      "Compra marcada como sin deuda: sale de Cuentas por Pagar y el stock recibido se conserva.",
    );
    const despues = await accountsPayable(db, orgId);
    expect(despues.map((p) => p.id)).not.toContain(target.id);
  });
});
