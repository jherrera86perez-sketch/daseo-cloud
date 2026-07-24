import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { consolidatedEntries, statementMovements } from "@/db/schema";
import { assertOwnedByOrg } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import {
  NON_OPERATING_INCOME_CATEGORIES,
  NON_OPERATING_EXPENSE_CATEGORIES,
} from "@/lib/fiscal-categories";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type EntryRow = typeof consolidatedEntries.$inferSelect;
export type BankMovRow = typeof statementMovements.$inferSelect & {
  cbCategoria: string | null;
};

/** defaultCategoria del ERP (conciliacion.js:31-41). */
export function defaultCategoria(
  operacion: string | null,
  observacion: string | null,
): string {
  const obs = (observacion ?? "").toUpperCase();
  if (operacion === "CR") {
    if (
      obs.includes("BANCAMOVIL") ||
      obs.includes("BANCA MOVIL") ||
      obs.includes("SWITCH")
    ) {
      return "Ventas Minoristas";
    }
    return "Otros Ingresos";
  }
  if (obs.includes("SALARIO") || obs.includes("NOMINA")) return "Salarios";
  if (obs.includes("IMPUESTO") || obs.includes("ONAT")) return "Impuestos";
  return "Otros Gastos";
}

/** Filtro de período del ERP: mes=0 significa "todo el año". */
function periodo(
  col: { mes: unknown; anio: unknown },
  mes: number,
  anio: number,
) {
  const filters = [eq(col.anio as never, anio)];
  if (mes !== 0) filters.push(eq(col.mes as never, mes));
  return filters;
}

/** GET /resumen del ERP: banco vs libros + diferencia (conciliacion.js:55-146). */
export async function resumenConciliacion(
  db: Db,
  orgId: string,
  mes: number,
  anio: number,
): Promise<{
  banco: {
    ingresos: string;
    egresos: string;
    saldo: string;
    total: number;
    conciliados: number;
    pendientes: number;
    pendientesCR: number;
    pendientesDB: number;
  };
  libros: { ingresos: string; egresos: string; saldo: string; total: number };
  diferencia: string;
  cuadrado: boolean;
}> {
  const mesClause = mes !== 0 ? sql`and mes = ${mes}` : sql``;
  const bancoRes = await db.execute(sql`
    select
      coalesce(sum(importe) filter (where operacion = 'CR'), 0) as ingresos,
      coalesce(sum(importe) filter (where operacion = 'DB'), 0) as egresos,
      count(*)::int as total,
      count(*) filter (where conciliado)::int as conciliados,
      count(*) filter (where not conciliado)::int as pendientes,
      count(*) filter (where not conciliado and operacion = 'CR')::int as pendientes_cr,
      count(*) filter (where not conciliado and operacion = 'DB')::int as pendientes_db
    from statement_movements
    where org_id = ${orgId} and anio = ${anio} ${mesClause}
  `);
  const b = (bancoRes.rows ?? bancoRes)[0];

  const nonOpIncome = sql.join(
    NON_OPERATING_INCOME_CATEGORIES.map((c) => sql`${c}`),
    sql`, `,
  );
  const nonOpExpense = sql.join(
    NON_OPERATING_EXPENSE_CATEGORIES.map((c) => sql`${c}`),
    sql`, `,
  );
  const librosRes = await db.execute(sql`
    select
      coalesce(sum(importe) filter (
        where tipo_transaccion = 'CR'
          and (categoria is null or categoria not in (${nonOpIncome}))
      ), 0) as ingresos,
      coalesce(sum(abs(importe)) filter (
        where tipo_transaccion = 'DB'
          and (categoria is null or categoria not in (${nonOpExpense}))
      ), 0) as egresos,
      count(*)::int as total
    from consolidated_entries
    where org_id = ${orgId} and anio = ${anio} ${mesClause}
  `);
  const l = (librosRes.rows ?? librosRes)[0];

  const saldoBanco = Number(b.ingresos) - Number(b.egresos);
  const saldoLibros = Number(l.ingresos) - Number(l.egresos);
  const diferencia = saldoBanco - saldoLibros;
  return {
    banco: {
      ingresos: Number(b.ingresos).toFixed(2),
      egresos: Number(b.egresos).toFixed(2),
      saldo: saldoBanco.toFixed(2),
      total: b.total,
      conciliados: b.conciliados,
      pendientes: b.pendientes,
      pendientesCR: b.pendientes_cr,
      pendientesDB: b.pendientes_db,
    },
    libros: {
      ingresos: Number(l.ingresos).toFixed(2),
      egresos: Number(l.egresos).toFixed(2),
      saldo: saldoLibros.toFixed(2),
      total: l.total,
    },
    diferencia: diferencia.toFixed(2),
    // cuadrado = |diferencia| < 0.01 (conciliacion.js:129)
    cuadrado: Math.abs(diferencia) < 0.01,
  };
}

/** GET /movimientos: banco con estado de conciliación (LIMIT 50 del ERP). */
export async function listBankMovements(
  db: Db,
  orgId: string,
  opts: {
    mes: number;
    anio: number;
    estado?: "todos" | "pendientes" | "conciliados";
    tipo?: "CR" | "DB" | "";
    search?: string;
    orderBy?: "fecha" | "importe";
    orderDir?: "asc" | "desc";
    page?: number;
    limit?: number;
  },
): Promise<{ rows: BankMovRow[]; total: number }> {
  const filters = [
    eq(statementMovements.orgId, orgId),
    ...periodo(statementMovements, opts.mes, opts.anio),
  ];
  if (opts.estado === "pendientes") {
    filters.push(eq(statementMovements.conciliado, false));
  } else if (opts.estado === "conciliados") {
    filters.push(eq(statementMovements.conciliado, true));
  }
  if (opts.tipo) filters.push(eq(statementMovements.operacion, opts.tipo));
  if (opts.search) {
    const q = `%${opts.search}%`;
    filters.push(
      or(
        ilike(statementMovements.observacion, q),
        ilike(statementMovements.clientName, q),
        ilike(statementMovements.referencia, q),
      )!,
    );
  }
  const limit = opts.limit ?? 50;
  const page = opts.page ?? 1;
  const orderCol =
    opts.orderBy === "importe"
      ? statementMovements.importe
      : statementMovements.fechaIso;
  const orderFn = opts.orderDir === "asc" ? asc : desc;

  const rows = await db
    .select({
      mov: statementMovements,
      cbCategoria: consolidatedEntries.categoria,
    })
    .from(statementMovements)
    .leftJoin(
      consolidatedEntries,
      eq(consolidatedEntries.id, statementMovements.consolidadoId),
    )
    .where(and(...filters))
    .orderBy(orderFn(orderCol), desc(statementMovements.position))
    .limit(limit)
    .offset((page - 1) * limit);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(statementMovements)
    .where(and(...filters));
  return {
    rows: rows.map(
      (r: {
        mov: typeof statementMovements.$inferSelect;
        cbCategoria: string | null;
      }) => ({ ...r.mov, cbCategoria: r.cbCategoria }),
    ),
    total: count,
  };
}

/** GET /consolidado: entradas del libro del período + totales CR/DB. */
export async function listConsolidado(
  db: Db,
  orgId: string,
  opts: {
    mes: number;
    anio: number;
    tipo?: "CR" | "DB" | "";
    search?: string;
    orderBy?: "fecha" | "importe";
    orderDir?: "asc" | "desc";
    page?: number;
    limit?: number;
  },
): Promise<{
  rows: EntryRow[];
  total: number;
  totalCR: string;
  totalDB: string;
}> {
  const filters = [
    eq(consolidatedEntries.orgId, orgId),
    ...periodo(consolidatedEntries, opts.mes, opts.anio),
  ];
  if (opts.tipo) {
    filters.push(eq(consolidatedEntries.tipoTransaccion, opts.tipo));
  }
  if (opts.search) {
    const q = `%${opts.search}%`;
    filters.push(
      or(
        ilike(consolidatedEntries.observaciones, q),
        ilike(consolidatedEntries.clienteNombre, q),
        ilike(consolidatedEntries.categoria, q),
        ilike(consolidatedEntries.subcategoria, q),
        ilike(consolidatedEntries.referencia, q),
      )!,
    );
  }
  const limit = opts.limit ?? 50;
  const page = opts.page ?? 1;
  const orderCol =
    opts.orderBy === "importe"
      ? consolidatedEntries.importe
      : consolidatedEntries.fechaContable;
  const orderFn = opts.orderDir === "asc" ? asc : desc;

  const rows = await db
    .select()
    .from(consolidatedEntries)
    .where(and(...filters))
    .orderBy(orderFn(orderCol), desc(consolidatedEntries.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);
  const [tot] = await db
    .select({
      count: sql<number>`count(*)::int`,
      totalCR: sql<string>`coalesce(sum(${consolidatedEntries.importe}) filter (where ${consolidatedEntries.tipoTransaccion} = 'CR'), 0)`,
      totalDB: sql<string>`coalesce(sum(abs(${consolidatedEntries.importe})) filter (where ${consolidatedEntries.tipoTransaccion} = 'DB'), 0)`,
    })
    .from(consolidatedEntries)
    .where(and(...filters));
  return {
    rows,
    total: tot.count,
    totalCR: Number(tot.totalCR).toFixed(2),
    totalDB: Number(tot.totalDB).toFixed(2),
  };
}

function derivarFecha(fechaIso: string): {
  dia: number;
  mes: number;
  anio: number;
} {
  const [anio, mes, dia] = fechaIso.split("-").map((x) => parseInt(x, 10));
  return { dia, mes, anio };
}

/**
 * POST /importar del ERP: conciliar = copiar el movimiento del banco al
 * libro y marcarlo, todo en una transacción (conciliacion.js:264-320).
 */
export async function importarMovimiento(
  db: Db,
  orgId: string,
  userId: UserId,
  input: {
    movimientoId: string;
    categoria?: string | null;
    observaciones?: string | null;
    subcategoria?: string | null;
    detalle?: string | null;
  },
): Promise<EntryRow> {
  if (!input.movimientoId) throw new Error("movimiento_cuenta_id requerido");
  const row: EntryRow = await db.transaction(async (tx: Db) => {
    const [mov] = await tx
      .select()
      .from(statementMovements)
      .where(eq(statementMovements.id, input.movimientoId));
    const owned = assertOwnedByOrg(mov, orgId);
    if (!owned) throw new Error("Movimiento no encontrado");
    if (owned.conciliado) throw new Error("Este movimiento ya fue importado");

    const fechaIso: string =
      owned.fechaIso ?? owned.createdAt.toISOString().slice(0, 10);
    const [entry] = await tx
      .insert(consolidatedEntries)
      .values({
        orgId,
        archivoNombre: "conciliacion-bancaria",
        fechaContable: fechaIso,
        ...derivarFecha(fechaIso),
        referencia: owned.referencia,
        tipoTransaccion: owned.operacion === "DB" ? "DB" : "CR",
        importe: owned.importe ?? "0",
        saldo: owned.saldo,
        observaciones: input.observaciones ?? owned.observacion,
        categoria:
          input.categoria?.trim() ||
          defaultCategoria(owned.operacion, owned.observacion),
        subcategoria: input.subcategoria?.trim() || null,
        detalle: input.detalle?.trim() || null,
        conciliado: true,
        clienteNombre: owned.clientName,
        telefono: owned.telefono,
        pan: owned.panOrigen,
        tipoOperacion: owned.tipoTransaccion,
        statementMovementId: owned.id,
        origen: "banco",
        auditStatus: "CONCILIADO",
      })
      .returning();
    await tx
      .update(statementMovements)
      .set({ conciliado: true, consolidadoId: entry.id })
      .where(eq(statementMovements.id, owned.id));
    return entry;
  });
  await logAudit(db, {
    orgId,
    userId,
    entity: "consolidated_entry",
    entityId: row.id,
    action: "create",
    after: { origen: "banco", movimientoId: input.movimientoId },
  });
  return row;
}

/** POST /importar-masivo del ERP (conciliacion.js:325-388). */
export async function importarMasivo(
  db: Db,
  orgId: string,
  userId: UserId,
  opts: { mes: number; anio: number; operacion?: "CR" | "DB" },
): Promise<{ importados: number }> {
  const filters = [
    eq(statementMovements.orgId, orgId),
    ...periodo(statementMovements, opts.mes, opts.anio),
    eq(statementMovements.conciliado, false),
  ];
  if (opts.operacion) {
    filters.push(eq(statementMovements.operacion, opts.operacion));
  }
  const pendientes: Array<typeof statementMovements.$inferSelect> = await db
    .select()
    .from(statementMovements)
    .where(and(...filters))
    .orderBy(
      asc(statementMovements.fechaIso),
      asc(statementMovements.position),
    );
  if (pendientes.length === 0) {
    throw new Error("No hay movimientos pendientes para este período");
  }
  await db.transaction(async (tx: Db) => {
    for (const mov of pendientes) {
      const fechaIso: string =
        mov.fechaIso ?? mov.createdAt.toISOString().slice(0, 10);
      const [entry] = await tx
        .insert(consolidatedEntries)
        .values({
          orgId,
          archivoNombre: "conciliacion-bancaria",
          fechaContable: fechaIso,
          ...derivarFecha(fechaIso),
          referencia: mov.referencia,
          tipoTransaccion: mov.operacion === "DB" ? "DB" : "CR",
          importe: mov.importe ?? "0",
          saldo: mov.saldo,
          observaciones: mov.observacion,
          categoria: defaultCategoria(mov.operacion, mov.observacion),
          conciliado: true,
          clienteNombre: mov.clientName,
          telefono: mov.telefono,
          pan: mov.panOrigen,
          tipoOperacion: mov.tipoTransaccion,
          statementMovementId: mov.id,
          origen: "banco",
          auditStatus: "CONCILIADO",
        })
        .returning();
      await tx
        .update(statementMovements)
        .set({ conciliado: true, consolidadoId: entry.id })
        .where(eq(statementMovements.id, mov.id));
    }
  });
  await logAudit(db, {
    orgId,
    userId,
    entity: "consolidated_entry",
    entityId: orgId,
    action: "create",
    after: {
      origen: "banco-masivo",
      mes: opts.mes,
      anio: opts.anio,
      importados: pendientes.length,
    },
  });
  return { importados: pendientes.length };
}

/** POST /manual del ERP (conciliacion.js:393-445). */
export async function crearEntradaManual(
  db: Db,
  orgId: string,
  userId: UserId,
  input: {
    fechaContable: string;
    tipoTransaccion: string;
    importe: string;
    categoria?: string | null;
    observaciones?: string | null;
    clienteNombre?: string | null;
    referencia?: string | null;
    subcategoria?: string | null;
    detalle?: string | null;
  },
): Promise<EntryRow> {
  if (!input.fechaContable || !input.tipoTransaccion || !input.importe) {
    throw new Error(
      "fecha_contable, tipo_transaccion e importe son requeridos",
    );
  }
  if (input.tipoTransaccion !== "CR" && input.tipoTransaccion !== "DB") {
    throw new Error("tipo_transaccion debe ser CR o DB");
  }
  const importeAbs = Math.abs(Number(input.importe));
  const [entry] = await db
    .insert(consolidatedEntries)
    .values({
      orgId,
      archivoNombre: "entrada-manual",
      fechaContable: input.fechaContable,
      ...derivarFecha(input.fechaContable),
      referencia: input.referencia?.trim() || null,
      tipoTransaccion: input.tipoTransaccion,
      importe: importeAbs.toFixed(2),
      observaciones: input.observaciones?.trim() || null,
      categoria:
        input.categoria?.trim() ||
        (input.tipoTransaccion === "CR" ? "Otros Ingresos" : "Otros Gastos"),
      subcategoria: input.subcategoria?.trim() || null,
      detalle: input.detalle?.trim() || null,
      conciliado: false,
      clienteNombre: input.clienteNombre?.trim() || null,
      origen: "manual",
      auditStatus: "MANUAL",
    })
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "consolidated_entry",
    entityId: entry.id,
    action: "create",
    after: { origen: "manual", tipo: input.tipoTransaccion },
  });
  return entry;
}

async function getOwnedEntry(
  db: Db,
  orgId: string,
  id: string,
): Promise<EntryRow> {
  const [row] = await db
    .select()
    .from(consolidatedEntries)
    .where(eq(consolidatedEntries.id, id));
  const owned = assertOwnedByOrg(row, orgId);
  if (!owned) throw new Error("Registro no encontrado");
  return owned;
}

/** PUT /:id del ERP: solo actualiza campos presentes (conciliacion.js:450-479). */
export async function editarEntrada(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
  patch: {
    categoria?: string | null;
    observaciones?: string | null;
    clienteNombre?: string | null;
    fechaContable?: string;
    importe?: string;
    subcategoria?: string | null;
    detalle?: string | null;
  },
): Promise<EntryRow> {
  await getOwnedEntry(db, orgId, id);
  const set: Record<string, unknown> = {};
  if (patch.categoria !== undefined) set.categoria = patch.categoria;
  if (patch.observaciones !== undefined) {
    set.observaciones = patch.observaciones;
  }
  if (patch.clienteNombre !== undefined) {
    set.clienteNombre = patch.clienteNombre;
  }
  if (patch.fechaContable !== undefined) {
    set.fechaContable = patch.fechaContable;
    Object.assign(set, derivarFecha(patch.fechaContable));
  }
  if (patch.importe !== undefined) {
    set.importe = Math.abs(Number(patch.importe)).toFixed(2);
  }
  if (patch.subcategoria !== undefined) set.subcategoria = patch.subcategoria;
  if (patch.detalle !== undefined) set.detalle = patch.detalle;
  if (Object.keys(set).length === 0) throw new Error("Nada que actualizar");
  set.updatedAt = new Date();
  const [row] = await db
    .update(consolidatedEntries)
    .set(set)
    .where(
      and(eq(consolidatedEntries.id, id), eq(consolidatedEntries.orgId, orgId)),
    )
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "consolidated_entry",
    entityId: id,
    action: "update",
    after: patch,
  });
  return row;
}

/** DELETE /:id del ERP: borra y desvincula el movimiento (conciliacion.js:484-505). */
export async function eliminarEntrada(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
): Promise<void> {
  const entry = await getOwnedEntry(db, orgId, id);
  await db.transaction(async (tx: Db) => {
    await tx.delete(consolidatedEntries).where(eq(consolidatedEntries.id, id));
    if (entry.statementMovementId) {
      await tx
        .update(statementMovements)
        .set({ conciliado: false, consolidadoId: null })
        .where(eq(statementMovements.id, entry.statementMovementId));
    }
  });
  await logAudit(db, {
    orgId,
    userId,
    entity: "consolidated_entry",
    entityId: id,
    action: "delete",
    after: { origen: entry.origen },
  });
}

/** GET /subcategorias del ERP: usadas por frecuencia (conciliacion.js:512-536). */
export async function listSubcategorias(
  db: Db,
  orgId: string,
  tipo?: "CR" | "DB",
): Promise<string[]> {
  const tipoClause = tipo ? sql`and tipo_transaccion = ${tipo}` : sql``;
  const res = await db.execute(sql`
    select subcategoria, count(*)::int as n
    from consolidated_entries
    where org_id = ${orgId}
      and subcategoria is not null and trim(subcategoria) != ''
      ${tipoClause}
    group by subcategoria
    order by n desc
    limit 100
  `);
  return ((res.rows ?? res) as Array<{ subcategoria: string }>).map(
    (r) => r.subcategoria,
  );
}

export type SubcatReportRow = {
  tipo: string;
  subcategoria: string;
  categoria: string | null;
  n: number;
  total: string;
};

/** GET /reportes/subcategorias del ERP (conciliacion.js:543-611). */
export async function reporteSubcategorias(
  db: Db,
  orgId: string,
  opts: { mes?: number; anio?: number; desde?: string; hasta?: string },
): Promise<{
  rows: SubcatReportRow[];
  totalCR: string;
  totalDB: string;
}> {
  let rango;
  if (opts.desde && opts.hasta) {
    rango = sql`and fecha_contable >= ${opts.desde} and fecha_contable <= ${opts.hasta}`;
  } else {
    const mesClause =
      opts.mes && opts.mes !== 0 ? sql`and mes = ${opts.mes}` : sql``;
    rango = sql`and anio = ${opts.anio} ${mesClause}`;
  }
  const res = await db.execute(sql`
    select tipo_transaccion as tipo,
      coalesce(nullif(trim(subcategoria), ''), '(sin clasificar)') as subcategoria,
      max(categoria) as categoria,
      count(*)::int as n,
      coalesce(sum(abs(importe)), 0) as total
    from consolidated_entries
    where org_id = ${orgId} ${rango}
    group by tipo_transaccion, coalesce(nullif(trim(subcategoria), ''), '(sin clasificar)')
    order by tipo_transaccion, total desc
  `);
  const rows = ((res.rows ?? res) as Array<Record<string, unknown>>).map(
    (r) => ({
      tipo: String(r.tipo),
      subcategoria: String(r.subcategoria),
      categoria: (r.categoria as string) ?? null,
      n: Number(r.n),
      total: Number(r.total).toFixed(2),
    }),
  );
  const totalCR = rows
    .filter((r) => r.tipo === "CR")
    .reduce((a, r) => a + Number(r.total), 0);
  const totalDB = rows
    .filter((r) => r.tipo === "DB")
    .reduce((a, r) => a + Number(r.total), 0);
  return { rows, totalCR: totalCR.toFixed(2), totalDB: totalDB.toFixed(2) };
}

export type SaldoTendenciaMes = { mes: string; saldo: string };

/**
 * GET /saldo-tendencia del ERP (conciliacion.js:621-670): último saldo_final
 * por (cuenta, mes) desde las cabeceras de estados de cuenta; saldoActual =
 * suma del último saldo por cuenta.
 */
export async function saldoTendencia(
  db: Db,
  orgId: string,
  meses = 6,
): Promise<{ tendencia: SaldoTendenciaMes[]; saldoActual: string }> {
  const res = await db.execute(sql`
    with parsed as (
      select coalesce(cuenta_estandarizada, cuenta_interna, filename) as cuenta,
        to_date(fecha_fin, 'DD/MM/YYYY') as fin,
        saldo_final
      from statements
      where org_id = ${orgId}
        and fecha_fin is not null and fecha_fin != ''
        and saldo_final is not null
    ), ranked as (
      select cuenta, to_char(fin, 'YYYY-MM') as mes, saldo_final,
        row_number() over (
          partition by cuenta, to_char(fin, 'YYYY-MM') order by fin desc
        ) as rn,
        row_number() over (partition by cuenta order by fin desc) as rn_cuenta
      from parsed
    )
    select mes,
      sum(saldo_final) filter (where rn = 1) as saldo,
      sum(saldo_final) filter (where rn_cuenta = 1) as saldo_ultimo
    from ranked
    group by mes
    order by mes desc
    limit ${meses}
  `);
  const rows = (res.rows ?? res) as Array<Record<string, unknown>>;
  const tendencia = rows
    .map((r) => ({
      mes: String(r.mes),
      saldo: Number(r.saldo ?? 0).toFixed(2),
    }))
    .reverse();
  const saldoActual = rows.reduce((a, r) => a + Number(r.saldo_ultimo ?? 0), 0);
  return { tendencia, saldoActual: saldoActual.toFixed(2) };
}
