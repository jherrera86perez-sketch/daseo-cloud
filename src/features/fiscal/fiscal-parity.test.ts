// @vitest-environment node
// Paridad fiel con TaxEngine.js del ERP CubaOne (docs/research/spec-fiscal-erp.md):
// la base imponible sale del BANCO en cascada de 3 niveles de confianza,
// NO de `ventas` (que solo alimenta el análisis de brecha/transparencia).
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import {
  organizations,
  orgSettings,
  consolidatedEntries,
  statements,
  statementMovements,
} from "@/db/schema";
import { createCustomer } from "@/features/customers/queries";
import { createSale, confirmSale } from "@/features/sales/queries";
import {
  saveFiscalSettings,
  incomeSourceDetail,
  deductibleExpensesFromBank,
  gapAnalysis,
  onatApartarEstimate,
} from "./queries";

let db: TestDb;
const USER = null;
const now = new Date();
const YEAR = now.getUTCFullYear();
const MONTH = now.getUTCMonth() + 1;

function iso(day: number): string {
  return `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function makeOrg(slug: string): Promise<string> {
  const [org] = await db
    .insert(organizations)
    .values({ name: slug, slug })
    .returning();
  await db.insert(orgSettings).values({ orgId: org.id, baseCurrency: "CUP" });
  await saveFiscalSettings(db, org.id, USER, "CU", { regime: "TCP_GENERAL" });
  return org.id;
}

beforeAll(async () => {
  ({ db } = await createTestDb());
});

describe("incomeSourceDetail — cascada de 3 niveles (paridad ERP)", () => {
  it("nivel 1 (alta): consolidado categorizado como venta real", async () => {
    const org = await makeOrg("fp-alta");
    await db.insert(consolidatedEntries).values([
      {
        orgId: org,
        fechaContable: iso(5),
        mes: MONTH,
        anio: YEAR,
        tipoTransaccion: "CR",
        importe: "50000.00",
        categoria: "Ventas Minoristas",
      },
      // un CR no-categorizado-como-venta en el mismo período no debe sumarse
      // al nivel 1 (solo entra si el nivel 1 está vacío)
      {
        orgId: org,
        fechaContable: iso(6),
        mes: MONTH,
        anio: YEAR,
        tipoTransaccion: "CR",
        importe: "9999.00",
        categoria: "Préstamo recibido",
      },
    ]);
    const r = await incomeSourceDetail(db, org, YEAR, MONTH);
    expect(r.source).toBe("consolidado_ventas");
    expect(r.confidence).toBe("alta");
    expect(r.totalCents).toBe(5_000_000n);
  });

  it("nivel 2 (media): sin categoría de venta, CR bancario excluyendo no-operativos", async () => {
    const org = await makeOrg("fp-media");
    await db.insert(consolidatedEntries).values([
      {
        orgId: org,
        fechaContable: iso(5),
        mes: MONTH,
        anio: YEAR,
        tipoTransaccion: "CR",
        importe: "30000.00",
        categoria: "Otros Ingresos",
      },
      // no-operativo: NO debe sumarse al nivel 2
      {
        orgId: org,
        fechaContable: iso(6),
        mes: MONTH,
        anio: YEAR,
        tipoTransaccion: "CR",
        importe: "7000.00",
        categoria: "Préstamo recibido",
      },
    ]);
    const r = await incomeSourceDetail(db, org, YEAR, MONTH);
    expect(r.source).toBe("consolidado_bancario");
    expect(r.confidence).toBe("media");
    expect(r.totalCents).toBe(3_000_000n);
  });

  it("nivel 2 cae a 0 si SOLO hay CR no-operativos → sigue al nivel 3", async () => {
    const org = await makeOrg("fp-solo-no-operativo");
    await db.insert(consolidatedEntries).values({
      orgId: org,
      fechaContable: iso(5),
      mes: MONTH,
      anio: YEAR,
      tipoTransaccion: "CR",
      importe: "12000.00",
      categoria: "Aporte de capital",
    });
    const [stmt] = await db
      .insert(statements)
      .values({ orgId: org, filename: "x.pdf" })
      .returning();
    await db.insert(statementMovements).values({
      orgId: org,
      statementId: stmt.id,
      position: 0,
      anio: YEAR,
      mes: MONTH,
      operacion: "CR",
      importe: "4500.00",
    });
    const r = await incomeSourceDetail(db, org, YEAR, MONTH);
    expect(r.source).toBe("movimientos_cuenta");
    expect(r.confidence).toBe("baja");
    expect(r.totalCents).toBe(450_000n);
  });

  it("nivel 3 (baja): sin consolidado, solo estado de cuenta crudo (BPA sin conciliar)", async () => {
    const org = await makeOrg("fp-baja");
    const [stmt] = await db
      .insert(statements)
      .values({ orgId: org, filename: "y.pdf" })
      .returning();
    await db.insert(statementMovements).values({
      orgId: org,
      statementId: stmt.id,
      position: 0,
      anio: YEAR,
      mes: MONTH,
      operacion: "CR",
      importe: "8800.00",
    });
    const r = await incomeSourceDetail(db, org, YEAR, MONTH);
    expect(r.source).toBe("movimientos_cuenta");
    expect(r.confidence).toBe("baja");
    expect(r.totalCents).toBe(880_000n);
  });

  it("sin_datos: ninguna fuente tiene ingresos del período", async () => {
    const org = await makeOrg("fp-vacio");
    const r = await incomeSourceDetail(db, org, YEAR, MONTH);
    expect(r.source).toBe("none");
    expect(r.confidence).toBe("sin_datos");
    expect(r.totalCents).toBe(0n);
  });

  it("aislamiento multi-tenant: no mezcla datos de otra org", async () => {
    const orgX = await makeOrg("fp-iso-x");
    const orgY = await makeOrg("fp-iso-y");
    await db.insert(consolidatedEntries).values({
      orgId: orgX,
      fechaContable: iso(5),
      mes: MONTH,
      anio: YEAR,
      tipoTransaccion: "CR",
      importe: "1000.00",
      categoria: "Ventas Minoristas",
    });
    const r = await incomeSourceDetail(db, orgY, YEAR, MONTH);
    expect(r.totalCents).toBe(0n);
    expect(r.confidence).toBe("sin_datos");
  });
});

describe("deductibleExpensesFromBank — 100% banco (paridad ERP)", () => {
  it("suma DB del consolidado en categorías deducibles, ignora las no-deducibles", async () => {
    const org = await makeOrg("fp-deducibles");
    await db.insert(consolidatedEntries).values([
      {
        orgId: org,
        fechaContable: iso(3),
        mes: MONTH,
        anio: YEAR,
        tipoTransaccion: "DB",
        importe: "15000.00",
        categoria: "Salarios",
      },
      {
        orgId: org,
        fechaContable: iso(4),
        mes: MONTH,
        anio: YEAR,
        tipoTransaccion: "DB",
        importe: "2000.00",
        categoria: "Electricidad",
      },
      // no deducible: no debe sumarse
      {
        orgId: org,
        fechaContable: iso(5),
        mes: MONTH,
        anio: YEAR,
        tipoTransaccion: "DB",
        importe: "9000.00",
        categoria: "Retiro de capital",
      },
    ]);
    const total = await deductibleExpensesFromBank(db, org, YEAR, MONTH);
    expect(total).toBe(1_700_000n);
  });
});

describe("gapAnalysis — brecha ventas internas vs banco (transparencia)", () => {
  it("calcula la brecha y el % bancarizado por mes, sin alterar la base declarada", async () => {
    const org = await makeOrg("fp-brecha");
    const c = await createCustomer(db, org, USER, { name: "Cliente brecha" });
    // venta interna de 20,000.00 este mes
    const s = await createSale(db, org, USER, {
      customerId: c.id,
      currency: "CUP",
      rateToBase: "1",
      idempotencyKey: "fbfbfbfb-0000-4000-8000-000000000001",
      items: [{ description: "d", qty: "1", unitPriceCents: 2_000_000n }],
    });
    await confirmSale(db, org, USER, s.id);
    // solo 12,000.00 llegó al banco (efectivo retenido fuera del sistema)
    await db.insert(consolidatedEntries).values({
      orgId: org,
      fechaContable: iso(10),
      mes: MONTH,
      anio: YEAR,
      tipoTransaccion: "CR",
      importe: "12000.00",
      categoria: "Ventas Minoristas",
    });
    const { months, totals } = await gapAnalysis(db, org, YEAR);
    const m = months.find((x) => x.mes === MONTH)!;
    expect(m.ventasInternasCents).toBe(2_000_000n);
    expect(m.ingresosBancariosCents).toBe(1_200_000n);
    expect(m.brechaCents).toBe(800_000n);
    expect(m.porcentajeBancarizado).toBe(60);
    expect(totals.ventasInternasCents).toBe(2_000_000n);
    expect(totals.brechaCents).toBe(800_000n);
  });
});

describe("onatApartarEstimate — ≈ onatApartar del PanelNegocio.tsx (informativo)", () => {
  it("11% por defecto, 7% si exentoFotovoltaico — sobre los ingresos del mes", async () => {
    const org = await makeOrg("fp-apartar");
    await db.insert(consolidatedEntries).values({
      orgId: org,
      fechaContable: iso(5),
      mes: MONTH,
      anio: YEAR,
      tipoTransaccion: "CR",
      importe: "10000.00",
      categoria: "Ventas Minoristas",
    });
    const normal = await onatApartarEstimate(db, org, YEAR, MONTH);
    expect(normal.incomeCents).toBe(1_000_000n);
    expect(normal.rate).toBe(0.11);
    expect(normal.apartarCents).toBe(110_000n);

    await saveFiscalSettings(db, org, USER, "CU", {
      regime: "TCP_GENERAL",
      exentoFotovoltaico: true,
    });
    const exento = await onatApartarEstimate(db, org, YEAR, MONTH);
    expect(exento.rate).toBe(0.07);
    expect(exento.apartarCents).toBe(70_000n);
  });
});
