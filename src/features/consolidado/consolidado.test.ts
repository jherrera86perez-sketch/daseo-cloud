// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/test/db";
import {
  organizations,
  statements,
  statementMovements,
  customers,
  sales,
  payments,
} from "@/db/schema";
import {
  defaultCategoria,
  resumenConciliacion,
  importarMovimiento,
  importarMasivo,
  crearEntradaManual,
  editarEntrada,
  eliminarEntrada,
  listConsolidado,
  listSubcategorias,
  reporteSubcategorias,
  saldoTendencia,
} from "./queries";
import {
  puntuarMatch,
  extraerPagador,
  sugerenciasBanco,
  asignarBanco,
  autoVincular,
  listCobrosPendientes,
} from "./cobros";
import { deleteStatement } from "@/features/statements/queries";

let db: TestDb;
let orgA: string;
let orgB: string;
let stmtId: string;
let movCrId: string; // CR 1500 BANCAMOVIL 05/07
let movDbId: string; // DB 400 IMPUESTO ONAT 10/07
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "cba" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "B", slug: "cbb" })
    .returning();
  orgA = a.id;
  orgB = b.id;

  const [stmt] = await db
    .insert(statements)
    .values({
      orgId: orgA,
      filename: "jul-2026.pdf",
      cuentaInterna: "06011234",
      fechaInicio: "01/07/2026",
      fechaFin: "31/07/2026",
      saldoFinal: "2500.00",
    })
    .returning();
  stmtId = stmt.id;
  const base = { orgId: orgA, statementId: stmt.id, anio: 2026, mes: 7 };
  const [m1] = await db
    .insert(statementMovements)
    .values({
      ...base,
      position: 0,
      fecha: "05/07/2026",
      fechaIso: "2026-07-05",
      referencia: "REF00000123",
      operacion: "CR",
      importe: "1500.00",
      saldo: "1700.00",
      observacion:
        "BANCAMOVIL Ordenada por: PEDRO GOMEZ PAN: 123456XXXXXX7890.",
      clientName: "PEDRO GOMEZ",
      telefono: "5351234567",
    })
    .returning();
  movCrId = m1.id;
  const [m2] = await db
    .insert(statementMovements)
    .values({
      ...base,
      position: 1,
      fecha: "10/07/2026",
      fechaIso: "2026-07-10",
      referencia: "REF00000124",
      operacion: "DB",
      importe: "400.00",
      observacion: "PAGO IMPUESTO ONAT",
    })
    .returning();
  movDbId = m2.id;
  await db.insert(statementMovements).values({
    ...base,
    position: 2,
    fecha: "12/07/2026",
    fechaIso: "2026-07-12",
    referencia: "REF00000125",
    operacion: "CR",
    importe: "800.00",
    observacion: "SWITCH TRANSFERENCIA",
    clientName: "MARIA PEREZ",
  });
});

describe("defaultCategoria (literal del ERP)", () => {
  it("clasifica por operación y observación", () => {
    expect(defaultCategoria("CR", "pago BANCAMOVIL x")).toBe(
      "Ventas Minoristas",
    );
    expect(defaultCategoria("CR", "algo SWITCH")).toBe("Ventas Minoristas");
    expect(defaultCategoria("CR", "otra cosa")).toBe("Otros Ingresos");
    expect(defaultCategoria("DB", "PAGO SALARIO julio")).toBe("Salarios");
    expect(defaultCategoria("DB", "IMPUESTO ONAT")).toBe("Impuestos");
    expect(defaultCategoria("DB", "gasolina")).toBe("Otros Gastos");
  });
});

describe("conciliación banco → libro", () => {
  it("importar copia el movimiento, marca conciliado y aplica categoría default", async () => {
    const entry = await importarMovimiento(db, orgA, USER, {
      movimientoId: movCrId,
    });
    expect(entry.origen).toBe("banco");
    expect(entry.conciliado).toBe(true);
    expect(entry.auditStatus).toBe("CONCILIADO");
    expect(entry.categoria).toBe("Ventas Minoristas");
    expect(entry.importe).toBe("1500.00");
    expect(entry.clienteNombre).toBe("PEDRO GOMEZ");
    const [mov] = await db
      .select()
      .from(statementMovements)
      .where(eq(statementMovements.id, movCrId));
    expect(mov.conciliado).toBe(true);
    expect(mov.consolidadoId).toBe(entry.id);
  });

  it("reimportar el mismo movimiento lanza el mensaje literal", async () => {
    await expect(
      importarMovimiento(db, orgA, USER, { movimientoId: movCrId }),
    ).rejects.toThrow("Este movimiento ya fue importado");
  });

  it("otra org no puede importar movimientos ajenos", async () => {
    await expect(
      importarMovimiento(db, orgB, USER, { movimientoId: movDbId }),
    ).rejects.toThrow();
  });

  it("importar-masivo trae los pendientes restantes y luego avisa que no hay más", async () => {
    const res = await importarMasivo(db, orgA, USER, { mes: 7, anio: 2026 });
    expect(res.importados).toBe(2);
    await expect(
      importarMasivo(db, orgA, USER, { mes: 7, anio: 2026 }),
    ).rejects.toThrow("No hay movimientos pendientes para este período");
  });

  it("resumen cuadra banco vs libros tras importar todo", async () => {
    const r = await resumenConciliacion(db, orgA, 7, 2026);
    expect(r.banco.ingresos).toBe("2300.00");
    expect(r.banco.egresos).toBe("400.00");
    expect(r.banco.pendientes).toBe(0);
    expect(r.libros.ingresos).toBe("2300.00");
    expect(r.libros.egresos).toBe("400.00");
    expect(r.cuadrado).toBe(true);
  });

  it("eliminar una entrada desvincula el movimiento y descuadra", async () => {
    const [mov] = await db
      .select()
      .from(statementMovements)
      .where(eq(statementMovements.id, movDbId));
    await eliminarEntrada(db, orgA, USER, mov.consolidadoId!);
    const [movDespues] = await db
      .select()
      .from(statementMovements)
      .where(eq(statementMovements.id, movDbId));
    expect(movDespues.conciliado).toBe(false);
    expect(movDespues.consolidadoId).toBeNull();
    const r = await resumenConciliacion(db, orgA, 7, 2026);
    expect(r.cuadrado).toBe(false);
    expect(r.banco.pendientesDB).toBe(1);
  });
});

describe("entradas manuales y edición", () => {
  it("valida con mensajes literales", async () => {
    await expect(
      crearEntradaManual(db, orgA, USER, {
        fechaContable: "",
        tipoTransaccion: "CR",
        importe: "10",
      }),
    ).rejects.toThrow(
      "fecha_contable, tipo_transaccion e importe son requeridos",
    );
    await expect(
      crearEntradaManual(db, orgA, USER, {
        fechaContable: "2026-07-15",
        tipoTransaccion: "XX",
        importe: "10",
      }),
    ).rejects.toThrow("tipo_transaccion debe ser CR o DB");
  });

  it("crea con ABS(importe), default por tipo y NO operativa fuera de KPIs", async () => {
    const gasto = await crearEntradaManual(db, orgA, USER, {
      fechaContable: "2026-07-15",
      tipoTransaccion: "DB",
      importe: "-250.50",
      subcategoria: "Combustible / transporte",
    });
    expect(gasto.importe).toBe("250.50");
    expect(gasto.categoria).toBe("Otros Gastos");
    expect(gasto.origen).toBe("manual");
    // No operativa: no debe mover los KPIs de libros
    await crearEntradaManual(db, orgA, USER, {
      fechaContable: "2026-07-16",
      tipoTransaccion: "CR",
      importe: "9999",
      categoria: "Préstamo recibido",
    });
    const r = await resumenConciliacion(db, orgA, 7, 2026);
    expect(r.libros.ingresos).toBe("2300.00");
    // única DB en libros: la manual (la de 400 se eliminó en el test anterior)
    expect(r.libros.egresos).toBe("250.50");
  });

  it("editar solo campos presentes y 'Nada que actualizar'", async () => {
    const { rows } = await listConsolidado(db, orgA, { mes: 7, anio: 2026 });
    const gasto = rows.find((r) => r.importe === "250.50")!;
    await expect(editarEntrada(db, orgA, USER, gasto.id, {})).rejects.toThrow(
      "Nada que actualizar",
    );
    const editado = await editarEntrada(db, orgA, USER, gasto.id, {
      categoria: "Combustibles",
      detalle: "Kwid",
    });
    expect(editado.categoria).toBe("Combustibles");
    expect(editado.detalle).toBe("Kwid");
    expect(editado.importe).toBe("250.50");
  });

  it("subcategorías por frecuencia y reporte agrupado", async () => {
    const subs = await listSubcategorias(db, orgA, "DB");
    expect(subs).toContain("Combustible / transporte");
    const rep = await reporteSubcategorias(db, orgA, { mes: 7, anio: 2026 });
    const sinClasificar = rep.rows.filter(
      (r) => r.subcategoria === "(sin clasificar)",
    );
    expect(sinClasificar.length).toBeGreaterThan(0);
    expect(Number(rep.totalCR)).toBeGreaterThan(0);
  });

  it("saldo-tendencia lee cabeceras de estados de cuenta", async () => {
    const st = await saldoTendencia(db, orgA, 6);
    expect(st.saldoActual).toBe("2500.00");
    expect(st.tendencia.at(-1)?.mes).toBe("2026-07");
  });
});

describe("matching cobros↔banco (score 40/30/30 del ERP)", () => {
  let paymentId: string;
  let customerId: string;

  beforeAll(async () => {
    const [cliente] = await db
      .insert(customers)
      .values({ orgId: orgA, name: "Pedro Gomez" })
      .returning();
    customerId = cliente.id;
    const [venta] = await db
      .insert(sales)
      .values({
        orgId: orgA,
        customerId,
        year: 2026,
        number: 1,
        status: "confirmed",
        currency: "CUP",
        rateToBaseFixed: "1",
        totalCents: 150000n,
        totalBaseCents: 150000n,
      })
      .returning();
    const [pago] = await db
      .insert(payments)
      .values({
        orgId: orgA,
        saleId: venta.id,
        amountCents: 150000n,
        currency: "CUP",
        rateFixed: "1",
        appliedCents: 150000n,
        method: "transfer",
        paidAt: new Date("2026-07-06T12:00:00Z"),
      })
      .returning();
    paymentId = pago.id;
  });

  it("puntuarMatch replica el score del ERP", () => {
    const mov = {
      id: "x",
      fechaIso: "2026-07-06",
      referencia: "REF",
      importe: "1500.00",
      clientName: "PEDRO GOMEZ",
      observacion: "",
    };
    const { score, reasons } = puntuarMatch(
      { monto: 1500, fecha: "2026-07-06" },
      mov,
      { referenciaBancaria: "", clienteNombre: "pedro gomez" },
    );
    // Importe exacto (40) + mismo día (30) + nombre (20) = 90
    expect(score).toBe(90);
    expect(reasons).toContain("Importe exacto");
    expect(reasons).toContain("Mismo día");
    expect(reasons).toContain("Titular coincide con nombre del cliente");
  });

  it("extraerPagador saca el ordenante de la observación", () => {
    expect(
      extraerPagador({
        clientName: null,
        observacion: "Ordenada por: JUAN LOPEZ PAN: 9999.",
      }),
    ).toBe("juan lopez");
  });

  it("sugerencias encuentra el CR compatible con score alto", async () => {
    const sugs = await sugerenciasBanco(db, orgA, paymentId);
    expect(sugs.length).toBeGreaterThan(0);
    expect(sugs[0].movimientoId).toBe(movCrId);
    expect(sugs[0].score).toBeGreaterThanOrEqual(85);
  });

  it("asignar-banco vincula y aprende la referencia bancaria del pagador", async () => {
    await asignarBanco(db, orgA, USER, paymentId, movCrId, 92);
    const [pago] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId));
    expect(pago.bancoMovimientoId).toBe(movCrId);
    expect(pago.bancoMatchScore).toBe(92);
    const [cliente] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId));
    expect(cliente.referenciaBancaria).toBe("pedro gomez");
    expect(await listCobrosPendientes(db, orgA, 7, 2026)).toHaveLength(0);
  });

  it("auto-vincular respeta el umbral y no usa movimientos ya vinculados", async () => {
    // Segundo cobro por 800 (match con movCr2, cliente distinto sin nombre en obs)
    const [venta2] = await db
      .insert(sales)
      .values({
        orgId: orgA,
        customerId,
        year: 2026,
        number: 2,
        status: "confirmed",
        currency: "CUP",
        rateToBaseFixed: "1",
        totalCents: 80000n,
        totalBaseCents: 80000n,
      })
      .returning();
    await db.insert(payments).values({
      orgId: orgA,
      saleId: venta2.id,
      amountCents: 80000n,
      currency: "CUP",
      rateFixed: "1",
      appliedCents: 80000n,
      method: "transfer",
      paidAt: new Date("2026-07-12T12:00:00Z"),
    });
    // dry_run no escribe
    const prev = await autoVincular(db, orgA, USER, {
      mes: 7,
      anio: 2026,
      minScore: 60,
      dryRun: true,
    });
    expect(prev.procesados).toBe(1);
    expect(prev.vinculados).toBe(1);
    expect(prev.detalles[0].resultado).toBe("vincularia");
    expect(await listCobrosPendientes(db, orgA, 7, 2026)).toHaveLength(1);
    // umbral alto: score_bajo (importe exacto 40 + mismo día 30 = 70 sin nombre)
    const alto = await autoVincular(db, orgA, USER, {
      mes: 7,
      anio: 2026,
      minScore: 95,
    });
    expect(alto.vinculados).toBe(0);
    expect(alto.detalles[0].resultado).toBe("score_bajo");
    // umbral permisivo: vincula de verdad
    const real = await autoVincular(db, orgA, USER, {
      mes: 7,
      anio: 2026,
      minScore: 60,
    });
    expect(real.vinculados).toBe(1);
    expect(await listCobrosPendientes(db, orgA, 7, 2026)).toHaveLength(0);
  });

  it("mes y anio son requeridos", async () => {
    await expect(
      autoVincular(db, orgA, USER, { mes: 0, anio: 2026 }),
    ).rejects.toThrow("mes y anio son requeridos");
  });
});

describe("cascada al borrar estados de cuenta", () => {
  it("borrar el statement elimina también sus filas del consolidado", async () => {
    const res = await deleteStatement(db, orgA, USER, stmtId);
    expect(res.movimientos).toBe(3);
    expect(res.consolidado).toBe(2); // el DB fue des-conciliado antes
    const { rows } = await listConsolidado(db, orgA, { mes: 7, anio: 2026 });
    // solo quedan las manuales (2)
    expect(rows.every((r) => r.origen === "manual")).toBe(true);
    expect(rows).toHaveLength(2);
  });
});
