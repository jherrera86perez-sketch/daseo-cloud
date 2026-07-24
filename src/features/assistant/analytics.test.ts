// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/test/db";
import {
  organizations,
  orgSettings,
  pipelineStages,
  products,
  recipes,
  recipeItems,
  productionOrders,
  productionInputs,
  productionLabor,
  employees,
  employeeDayEvaluations,
  statements,
  statementMovements,
} from "@/db/schema";
import { DEFAULT_STAGES } from "@/lib/auth";
import { registerMovement } from "@/features/inventory/queries";
import { createCustomer } from "@/features/customers/queries";
import { createSale, confirmSale } from "@/features/sales/queries";
import { createOrder, confirmOrder } from "@/features/production/queries";
import {
  analisisInventario,
  analisisProduccion,
  analisisEmpleados,
  analisisPrecios,
  detectarFraccionamientoTransferencias,
  generarRecomendaciones,
  obtenerKPIs,
  tendencias,
} from "./analytics";

let db: TestDb;
let orgId: string;
let orgB: string;
const USER = null;

const DAY = 24 * 60 * 60 * 1000;
// Rango fijo de 10 días exactos con margen hacia el futuro para que los
// seeds creados durante el test (created_at = now real) caigan dentro.
const NOW = Date.now();
const HASTA = new Date(NOW + 12 * 60 * 60 * 1000);
const DESDE = new Date(HASTA.getTime() - 10 * DAY);
const RANGO = { desde: DESDE.toISOString(), hasta: HASTA.toISOString() };

const dateStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const D1 = dateStr(NOW - 5 * DAY); // día con 3 transferencias fraccionadas
const D2 = dateStr(NOW - 3 * DAY); // día con 2

const ids: Record<string, string> = {};

async function seedProduct(
  name: string,
  opts: {
    priceCents: bigint;
    isSellable?: boolean;
    isComponent?: boolean;
  },
) {
  const [p] = await db
    .insert(products)
    .values({
      orgId,
      name,
      unit: "unit",
      priceCents: opts.priceCents,
      isSellable: opts.isSellable ?? true,
      isComponent: opts.isComponent ?? false,
    })
    .returning();
  ids[name] = p.id;
  return p;
}

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [org] = await db
    .insert(organizations)
    .values({ name: "Asistente", slug: "adasist" })
    .returning();
  orgId = org.id;
  await db.insert(orgSettings).values({ orgId, baseCurrency: "CUP" });
  await db
    .insert(pipelineStages)
    .values(DEFAULT_STAGES.map((s) => ({ ...s, orgId })));
  const [b] = await db
    .insert(organizations)
    .values({ name: "Ajena", slug: "adajena" })
    .returning();
  orgB = b.id;
  await db.insert(orgSettings).values({ orgId: orgB, baseCurrency: "CUP" });

  // ── Inventario / precios ──────────────────────────────────────────────
  // Jabón: 100 @ $50, venta de 95 → stock 5, consumo 9.5/día → CRITICO
  await seedProduct("Jabón", { priceCents: 100_00n });
  await registerMovement(db, orgId, USER, {
    productId: ids["Jabón"],
    kind: "in",
    qty: "100",
    unitCostCents: 50_00n,
  });
  // Añejo: componente con stock y CERO salidas → SIN_MOVIMIENTO ($200)
  await seedProduct("Añejo", {
    priceCents: 0n,
    isSellable: false,
    isComponent: true,
  });
  await registerMovement(db, orgId, USER, {
    productId: ids["Añejo"],
    kind: "in",
    qty: "10",
    unitCostCents: 20_00n,
  });
  // SinPrecio: vendible sin precio con stock y con movimiento
  await seedProduct("SinPrecio", { priceCents: 0n });
  await registerMovement(db, orgId, USER, {
    productId: ids["SinPrecio"],
    kind: "in",
    qty: "5",
    unitCostCents: 10_00n,
  });
  await registerMovement(db, orgId, USER, {
    productId: ids["SinPrecio"],
    kind: "out",
    qty: "1",
    sourceType: "sale",
  });
  // MargenBajo: precio $100, costo $90 → margen 10% (<15)
  await seedProduct("MargenBajo", { priceCents: 100_00n });
  await registerMovement(db, orgId, USER, {
    productId: ids["MargenBajo"],
    kind: "in",
    qty: "10",
    unitCostCents: 90_00n,
  });
  await registerMovement(db, orgId, USER, {
    productId: ids["MargenBajo"],
    kind: "out",
    qty: "1",
    sourceType: "sale",
  });
  // Oportunidad: precio $100, costo $80 → margen 20% con stock >5
  await seedProduct("Oportunidad", { priceCents: 100_00n });
  await registerMovement(db, orgId, USER, {
    productId: ids["Oportunidad"],
    kind: "in",
    qty: "10",
    unitCostCents: 80_00n,
  });
  await registerMovement(db, orgId, USER, {
    productId: ids["Oportunidad"],
    kind: "out",
    qty: "2",
    sourceType: "sale",
  });

  // Venta real confirmada: 95 Jabón @ $100 → salida de kardex + tendencias
  const cust = await createCustomer(db, orgId, USER, { name: "Bodega" });
  const sale = await createSale(db, orgId, USER, {
    customerId: cust.id,
    currency: "CUP",
    rateToBase: "1",
    idempotencyKey: "ad000000-0000-4000-8000-000000000001",
    items: [
      {
        description: "jabón",
        qty: "95",
        unitPriceCents: 100_00n,
        productId: ids["Jabón"],
      },
    ],
  });
  await confirmSale(db, orgId, USER, sale.id);

  // ── Producción ────────────────────────────────────────────────────────
  // Sosa (insumo) y CaroProd (terminado con margen 0%)
  await seedProduct("Sosa", {
    priceCents: 0n,
    isSellable: false,
    isComponent: true,
  });
  await registerMovement(db, orgId, USER, {
    productId: ids["Sosa"],
    kind: "in",
    qty: "100",
    unitCostCents: 10_00n,
  });
  await seedProduct("CaroProd", { priceCents: 10_00n });
  const [recipe] = await db
    .insert(recipes)
    .values({
      orgId,
      productId: ids["CaroProd"],
      name: "CaroProd x10",
      outputQty: "10",
    })
    .returning();
  await db.insert(recipeItems).values({
    orgId,
    recipeId: recipe.id,
    productId: ids["Sosa"],
    qty: "10",
  });
  // Orden 1 confirmada: 10 Sosa @$10 → 10 CaroProd @$10 (margen 0) + merma 2
  const order1 = await createOrder(db, orgId, USER, { recipeId: recipe.id });
  const inputs = await db
    .select()
    .from(productionInputs)
    .where(eq(productionInputs.orderId, order1.id));
  await confirmOrder(db, orgId, USER, order1.id, {
    producedQty: "10",
    laborCostBaseCents: 0n,
    overheadBaseCents: 0n,
    inputs: [{ inputId: inputs[0].id, actualQty: "10" }],
  });
  await db
    .update(productionOrders)
    .set({ wasteQty: "2" })
    .where(eq(productionOrders.id, order1.id));
  // Orden 2 en borrador → pendiente (costo estimado 10×$10 = $100)
  await createOrder(db, orgId, USER, { recipeId: recipe.id });

  // ── Empleados ─────────────────────────────────────────────────────────
  const emp = async (name: string, role: string, salaryCents: bigint) => {
    const [e] = await db
      .insert(employees)
      .values({ orgId, name, role, salaryCents })
      .returning();
    ids[name] = e.id;
    return e;
  };
  await emp("Naydit", "Operaria", 5000_00n);
  await emp("Lento", "Operario", 4000_00n);
  await emp("Guardia", "Vigilante", 3000_00n);

  const rawOrder = async (createdAt: Date) => {
    const [o] = await db
      .insert(productionOrders)
      .values({
        orgId,
        recipeId: recipe.id,
        productId: ids["CaroProd"],
        status: "confirmed",
        producedQty: "1",
        createdAt,
      })
      .returning();
    return o;
  };
  // Naydit: 3 órdenes/día × 10 días, 0.1h @ $20/h → 10 órdenes/hora
  let guardiaDone = false;
  for (let d = 0; d < 10; d++) {
    for (let k = 0; k < 3; k++) {
      const o = await rawOrder(new Date(NOW - d * DAY));
      await db.insert(productionLabor).values({
        orgId,
        orderId: o.id,
        employeeId: ids["Naydit"],
        hours: "0.10",
        costHourCents: 20_00n,
      });
      if (!guardiaDone) {
        // Vigilante con actividad: queda excluido del ranking por rol
        await db.insert(productionLabor).values({
          orgId,
          orderId: o.id,
          employeeId: ids["Guardia"],
          hours: "1.00",
          costHourCents: 20_00n,
        });
        guardiaDone = true;
      }
    }
  }
  // Lento: 1 orden/día × 8 días (muestra mínima), 1h cada una
  for (let d = 0; d < 8; d++) {
    const o = await rawOrder(new Date(NOW - d * DAY));
    await db.insert(productionLabor).values({
      orgId,
      orderId: o.id,
      employeeId: ids["Lento"],
      hours: "1.00",
      costHourCents: 20_00n,
    });
  }
  // Observación manual del día (para tendencias/empleados_activos)
  await db.insert(employeeDayEvaluations).values({
    orgId,
    employeeId: ids["Naydit"],
    date: dateStr(NOW),
    wasteProduced: "1",
    defects: 2,
  });

  // ── Fraccionamiento BPA ───────────────────────────────────────────────
  const [stmt] = await db
    .insert(statements)
    .values({ orgId, filename: "test.pdf" })
    .returning();
  const mov = (
    position: number,
    fechaIso: string,
    clientName: string,
    panOrigen: string,
    importe: string,
  ) => ({
    orgId,
    statementId: stmt.id,
    position,
    fechaIso,
    operacion: "CR",
    importe,
    clientName,
    panOrigen,
  });
  await db.insert(statementMovements).values([
    mov(1, D1, "JUANA PEÑA", "92351111", "2000.00"),
    mov(2, D1, "JUANA PE A", "92351111", "1500.00"),
    mov(3, D1, "", "92351111", "600.00"),
    mov(4, D2, "JUANA PEÑA", "92351111", "900.00"),
    mov(5, D2, "JUANA PEÑA", "92351111", "800.00"),
    mov(6, D2, "OTRO CLIENTE", "", "3000.00"),
  ]);
}, 120_000);

describe("asistente directivo — analisisInventario", () => {
  it("anota estados, consumo y totales como el ERP", async () => {
    const r = await analisisInventario(db, orgId, RANGO);
    expect(r.totalProductos).toBe(7);
    expect(r.diasAnalisis).toBe(10);

    const jabon = r.inventario.find((p) => p.id === ids["Jabón"])!;
    expect(jabon.estado).toBe("CRITICO");
    expect(jabon.stock).toBe(5);
    expect(jabon.consumo_diario).toBeCloseTo(9.5, 5);
    expect(jabon.dias_stock!).toBeCloseTo(5 / 9.5, 5);

    const anejo = r.inventario.find((p) => p.id === ids["Añejo"])!;
    expect(anejo.estado).toBe("SIN_MOVIMIENTO");

    expect(r.stockBajo.map((p) => p.id)).toEqual([ids["Jabón"]]);
    expect(r.sinMovimiento.map((p) => p.id).sort()).toEqual(
      [ids["Añejo"], ids["CaroProd"]].sort(),
    );
    expect(r.sinPrecio.map((p) => p.id)).toEqual([ids["SinPrecio"]]);
    // 5×50 + 10×20 + 4×10 + 9×90 + 8×80 + 10×10 + 90×10 = 2940
    expect(r.valorTotalInventario).toBeCloseTo(2940, 2);
    expect(r.totalInversionParalizada).toBeCloseTo(300, 2);
    expect(r.alertasCount).toBe(4);
  });
});

describe("asistente directivo — analisisProduccion", () => {
  it("pendientes, merma y costos altos", async () => {
    const r = await analisisProduccion(db, orgId, RANGO);
    expect(r.ordenesPendientes).toHaveLength(1);
    expect(r.ordenesPendientes[0].costo_total).toBeCloseTo(100, 2);
    expect(r.totalMerma).toBeCloseTo(2, 3);
    expect(r.mermaRegistrada).toHaveLength(1);
    expect(r.mermaRegistrada[0].porcentaje_merma).toBeCloseTo(20, 2);
    expect(r.costosAltos).toHaveLength(1);
    const caro = r.costosAltos[0];
    expect(caro.id).toBe(ids["CaroProd"]);
    expect(caro.costo_promedio).toBeCloseTo(10, 2);
    expect(caro.precio_venta).toBeCloseTo(10, 2);
    expect(caro.es_critico).toBe(true);
    expect(r.alertasCount).toBe(3);
  });
});

describe("asistente directivo — analisisEmpleados", () => {
  it("bajo rendimiento por órdenes/día y eficiencia", async () => {
    const r = await analisisEmpleados(db, orgId, RANGO);
    expect(r.productividad).toHaveLength(3);
    expect(r.produccionPromedio).toBe(19); // round((30+8)/2)

    expect(r.bajoRendimiento.map((e) => e.id)).toEqual([ids["Lento"]]);
    const lento = r.bajoRendimiento[0];
    expect(lento.ordenes_totales).toBe(8);
    expect(lento.dias_registrados).toBe(8);

    // Guardia trabajó pero su rol lo excluye del ranking
    expect(r.costoEficiencia.map((e) => e.id)).not.toContain(ids["Guardia"]);
    const naydit = r.costoEficiencia[0];
    expect(naydit.id).toBe(ids["Naydit"]);
    expect(naydit.ordenes_por_hora).toBeCloseTo(10, 2);
    expect(naydit.cumple_meta).toBe(true);
    // devengado 30×0.1×20 = $60 sobre salario $5000 → 1.2%
    expect(naydit.aprovechamiento_salario!).toBeCloseTo(1.2, 3);
    expect(r.alertasCount).toBe(1);
  });
});

describe("asistente directivo — analisisPrecios", () => {
  it("margen bajo, oportunidades y promedio", async () => {
    const r = await analisisPrecios(db, orgId);
    expect(r.promedioMargen).toBe(20); // round(avg(50,10,20,0))
    expect(r.margenBajo.map((p) => p.id).sort()).toEqual(
      [ids["MargenBajo"], ids["CaroProd"]].sort(),
    );
    expect(r.oportunidadAumento.map((p) => p.id)).toEqual([
      ids["Oportunidad"],
    ]);
    expect(r.topMargenes[0].id).toBe(ids["Jabón"]);
    expect(r.topMargenes[0].margen_porcentaje).toBeCloseTo(50, 2);
    expect(r.alertasCount).toBe(2);
  });
});

describe("asistente directivo — fraccionamiento BPA", () => {
  it("une por nombre/tarjeta con union-find y agrupa por día", async () => {
    const r = await detectarFraccionamientoTransferencias(db, orgId, RANGO);
    expect(r).toHaveLength(1);
    const j = r[0];
    expect(j.cliente).toBe("JUANA PEÑA");
    expect(j.dias).toHaveLength(2);
    expect(j.totalOps).toBe(5);
    expect(j.totalMonto).toBeCloseTo(5800, 2);
    expect(j.maxDiaOps).toBe(3);
    expect(j.maxDiaTotal).toBeCloseTo(4100, 2);
    // ordenado por total desc: D1 (4100) primero
    expect(j.dias[0]).toMatchObject({ dia: D1, ops: 3 });
  });
});

describe("asistente directivo — generarRecomendaciones", () => {
  it("textos literales, scores y orden exactos del ERP", async () => {
    const recs = await generarRecomendaciones(db, orgId, RANGO);
    expect(recs.map((r) => r.id)).toEqual([
      `inv_${ids["Jabón"]}`,
      "prod_pendientes",
      "fracc_juana_pe_a",
      "prod_merma",
      `prod_costo_${ids["CaroProd"]}`,
      `emp_rendimiento_${ids["Lento"]}`,
      `inv_obsoleto_${ids["Añejo"]}`,
      `inv_obsoleto_${ids["CaroProd"]}`,
      `precio_bajo_${ids["CaroProd"]}`,
      `precio_bajo_${ids["MargenBajo"]}`,
      `emp_sobrecarga_${ids["Naydit"]}`,
      `precio_suba_${ids["Oportunidad"]}`,
    ]);
    expect(recs.map((r) => r.posicion)).toEqual(
      recs.map((_, i) => i + 1),
    );

    const byId = new Map(recs.map((r) => [r.id, r]));
    expect(byId.get(`inv_${ids["Jabón"]}`)).toMatchObject({
      titulo: "Stock bajo: Jabón",
      descripcion: "Quedan 5 unidades (0.5 días de consumo)",
      accion: "Ordenar al menos 285 unidades",
      categoria: "inventario",
      impacto: "Alto",
      score: 9,
      urgencia: 9,
    });
    expect(byId.get(`inv_obsoleto_${ids["Añejo"]}`)).toMatchObject({
      titulo: "Producto obsoleto: Añejo",
      descripcion: "10 unidades sin movimiento (inversión: $200.00)",
      accion: "Revisar viabilidad de venta, descuento o donación",
      impacto: "Medio",
      score: 6,
      urgencia: 5,
    });
    expect(byId.get("prod_pendientes")).toMatchObject({
      titulo: "1 órdenes pendientes",
      descripcion: "Costo total pendiente: $100.00",
      accion: "Revisar cuello de botella y asignar recursos",
      impacto: "Alto",
      score: 9,
    });
    expect(byId.get("prod_merma")).toMatchObject({
      titulo: "Merma detectada: 2.00 unidades",
      descripcion: "Últimos 30 días: 1 registros",
      accion: "Investigar causas de merma y mejorar procesos",
      score: 7,
      urgencia: 7,
    });
    expect(byId.get(`prod_costo_${ids["CaroProd"]}`)).toMatchObject({
      titulo: "Costo cercano al precio: CaroProd",
      descripcion: "Costo: $10.00 vs Precio: $10.00",
      accion: "Revisar proceso de producción o ajustar precio",
      impacto: "Medio",
      score: 7,
      urgencia: 6,
    });
    expect(byId.get(`emp_rendimiento_${ids["Lento"]}`)).toMatchObject({
      titulo: "Bajo rendimiento: Lento",
      descripcion: "8 órdenes en 30 días (promedio: 19)",
      accion: "Capacitar, reasignar o ajustar metas",
      score: 6,
      urgencia: 6,
    });
    expect(byId.get(`emp_sobrecarga_${ids["Naydit"]}`)).toMatchObject({
      titulo: "Empleado sobrecargado: Naydit",
      descripcion: "10 órdenes/hora (límite recomendado: 3)",
      accion: "Distribuir carga de trabajo, prevenir burnout",
      score: 5,
      urgencia: 5,
    });
    expect(byId.get(`precio_bajo_${ids["MargenBajo"]}`)).toMatchObject({
      titulo: "Margen bajo: MargenBajo",
      descripcion: "10% margen (inversión: $900.00)",
      accion: "Aumentar precio o revisar costo",
      score: 6,
      urgencia: 5,
    });
    expect(byId.get(`precio_suba_${ids["Oportunidad"]}`)).toMatchObject({
      titulo: "Oportunidad de aumento: Oportunidad",
      descripcion: "Margen actual 20% - Potencial: +5-10%",
      accion: "Aumentar precio a $105.00",
      impacto: "Bajo",
      score: 4,
      urgencia: 2,
    });
    expect(byId.get("fracc_juana_pe_a")).toMatchObject({
      titulo: "Pagos fraccionados: JUANA PEÑA",
      categoria: "clientes",
      impacto: "Alto",
      score: 9,
      urgencia: 9,
      accion:
        "Cuando un cliente ya transfirió hoy, pedir otra forma de pago o registrar la compra a su nombre; revisar estos días con la dependienta para cortar la práctica.",
    });
    expect(byId.get("fracc_juana_pe_a")!.descripcion).toBe(
      `2 día(s) con 2+ transferencias el mismo día (compras repetidas; posible fraccionamiento para esquivar el tope BPA de $2500/día). ${D1}: 3 transf. = $4100.00 · ${D2}: 2 transf. = $1700.00`,
    );
  });
});

describe("asistente directivo — KPIs y tendencias", () => {
  it("obtenerKPIs con la forma exacta del ERP", async () => {
    const k = await obtenerKPIs(db, orgId, RANGO);
    expect(k).toEqual({
      inventario: {
        stockBajoCount: 1,
        productosObsoletos: 2,
        inversionParalizada: 300,
      },
      produccion: {
        ordenesPendientes: 1,
        costoTotalPendiente: 100,
        mermaTotal: 2,
      },
      empleados: {
        totalEmpleados: 3,
        produccionPromedio: 19,
        empleadosBajoRendimiento: 1,
      },
      precios: {
        margenPromedio: 20,
        productosMargenBajo: 2,
        oportunidadesAumento: 1,
      },
      alertasTotal: 10,
    });
  });

  it("tendencias rellena gaps y agrega por mes", async () => {
    const t = await tendencias(db, orgId, 3);
    expect(t).toHaveLength(3);
    const actual = t[2];
    const hoy = new Date();
    expect(actual.mes).toBe(
      `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`,
    );
    expect(actual.ventas_cantidad).toBe(1);
    expect(actual.ventas_total).toBeCloseTo(9500, 2);
    expect(actual.empleados_activos).toBe(1);
    // el mes más antiguo no tiene datos → todo en cero (gap rellenado)
    expect(t[0].ventas_cantidad).toBe(0);
    expect(t[0].produccion_ordenes).toBe(0);
  });

  it("aislamiento multi-tenant: la org B no ve nada", async () => {
    const recs = await generarRecomendaciones(db, orgB, RANGO);
    expect(recs).toEqual([]);
    const k = await obtenerKPIs(db, orgB, RANGO);
    expect(k.alertasTotal).toBe(0);
    expect(k.empleados.totalEmpleados).toBe(0);
  });
});
