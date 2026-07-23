import { and, eq, gte, lte, isNotNull, ne, sql, desc } from "drizzle-orm";
import { statementMovements } from "@/db/schema";

// Cualquier instancia drizzle (Neon en prod, PGlite en tests)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Analytics de estados de cuenta — port fiel de /analytics/* del ERP.
 * SQLite→Postgres: julianday(a)-julianday(b) → (a::date - b::date);
 * strftime('%w') → EXTRACT(DOW) (0=domingo en ambos);
 * anio||'-'||printf('%02d',mes) → COUNT(DISTINCT (anio, mes)).
 */

const num = (expr: ReturnType<typeof sql<number>>) => expr.mapWith(Number);

function baseClientFilter(orgId: string) {
  return and(
    eq(statementMovements.orgId, orgId),
    isNotNull(statementMovements.clientName),
    ne(statementMovements.clientName, ""),
  );
}

export type ResumenRow = {
  periodo: number | string;
  periodo2: number | null;
  total_creditos: number;
  total_debitos: number;
  num_operaciones: number;
  clientes_distintos: number;
};

/** GET /analytics/resumen — agrupación anio | mes (anio,mes) | dia. */
export async function analyticsResumen(
  db: Db,
  orgId: string,
  opts: { agrupacion?: "anio" | "mes" | "dia"; anio?: number; mes?: number },
): Promise<ResumenRow[]> {
  const agrupacion = opts.agrupacion ?? "mes";
  const where = [eq(statementMovements.orgId, orgId)];
  if (opts.anio) where.push(eq(statementMovements.anio, opts.anio));
  if (opts.mes) where.push(eq(statementMovements.mes, opts.mes));

  const totals = {
    total_creditos: num(
      sql<number>`sum(case when ${statementMovements.operacion} = 'CR' then ${statementMovements.importe} else 0 end)`,
    ),
    total_debitos: num(
      sql<number>`sum(case when ${statementMovements.operacion} = 'DB' then ${statementMovements.importe} else 0 end)`,
    ),
    num_operaciones: num(sql<number>`count(*)`),
    clientes_distintos: num(
      sql<number>`count(distinct ${statementMovements.clientName})`,
    ),
  };

  if (agrupacion === "anio") {
    const rows = await db
      .select({ periodo: statementMovements.anio, ...totals })
      .from(statementMovements)
      .where(and(...where))
      .groupBy(statementMovements.anio)
      .orderBy(statementMovements.anio);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => ({ ...r, periodo2: null }));
  }
  if (agrupacion === "dia") {
    const rows = await db
      .select({ periodo: statementMovements.fechaIso, ...totals })
      .from(statementMovements)
      .where(and(...where))
      .groupBy(statementMovements.fechaIso)
      .orderBy(statementMovements.fechaIso);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => ({ ...r, periodo2: null }));
  }
  const rows = await db
    .select({
      periodo: statementMovements.anio,
      periodo2: statementMovements.mes,
      ...totals,
    })
    .from(statementMovements)
    .where(and(...where))
    .groupBy(statementMovements.anio, statementMovements.mes)
    .orderBy(statementMovements.anio, statementMovements.mes);
  return rows;
}

export type ClienteRow = {
  client_name: string;
  pan_origen: string | null;
  telefono: string | null;
  num_ops: number;
  total_creditos: number;
  total_debitos: number;
  primera_op: string | null;
  ultima_op: string | null;
  ticket_promedio: number;
  meses_activo: number;
  dias_desde_ultima: number | null;
  dias_entre_ops_promedio: number | null;
  total_mes_anterior: number;
  delta_pct: number | null;
  es_nuevo: boolean;
};

export type ClientesKpis = {
  total_clientes: number;
  total_ingresos: number;
  nuevos: number;
  recurrentes: number;
  ticket_promedio: number;
  top20_pct: number;
};

function isoAddDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** GET /analytics/clientes — ranking por (client_name, pan) con comparativa. */
export async function analyticsClientes(
  db: Db,
  orgId: string,
  opts: {
    desde?: string;
    hasta?: string;
    anio?: number;
    mes?: number;
    limit?: number;
  } = {},
): Promise<{ rows: ClienteRow[]; kpis: ClientesKpis }> {
  const limit = opts.limit ?? 100;
  const usaRango = Boolean(opts.desde && opts.hasta);

  const periodWhere = [baseClientFilter(orgId)];
  if (usaRango) {
    periodWhere.push(gte(statementMovements.fechaIso, opts.desde!));
    periodWhere.push(lte(statementMovements.fechaIso, opts.hasta!));
  } else {
    if (opts.anio) periodWhere.push(eq(statementMovements.anio, opts.anio));
    if (opts.mes) periodWhere.push(eq(statementMovements.mes, opts.mes));
  }

  // fechaRef para dias_desde_ultima (como el ERP)
  let fechaRef: string;
  if (usaRango) fechaRef = opts.hasta!;
  else if (opts.anio && opts.mes) {
    const last = new Date(Date.UTC(opts.anio, opts.mes, 0));
    fechaRef = last.toISOString().slice(0, 10);
  } else {
    fechaRef = new Date().toISOString().slice(0, 10);
  }

  const main = await db
    .select({
      client_name: statementMovements.clientName,
      pan_origen: statementMovements.panOrigen,
      telefono: sql<string | null>`max(${statementMovements.telefono})`,
      num_ops: num(sql<number>`count(*)`),
      total_creditos: num(
        sql<number>`sum(case when ${statementMovements.operacion} = 'CR' then ${statementMovements.importe} else 0 end)`,
      ),
      total_debitos: num(
        sql<number>`sum(case when ${statementMovements.operacion} = 'DB' then ${statementMovements.importe} else 0 end)`,
      ),
      primera_op: sql<string | null>`min(${statementMovements.fechaIso})::text`,
      ultima_op: sql<string | null>`max(${statementMovements.fechaIso})::text`,
      ticket_promedio: num(
        sql<number>`avg(case when ${statementMovements.operacion} = 'CR' then ${statementMovements.importe} end)`,
      ),
      meses_activo: num(
        sql<number>`count(distinct (${statementMovements.anio}, ${statementMovements.mes}))`,
      ),
      dias_desde_ultima: num(
        sql<number>`(${fechaRef}::date - max(${statementMovements.fechaIso}))`,
      ),
      dias_entre_ops_promedio: sql<number | null>`case when count(*) > 1
        then (max(${statementMovements.fechaIso}) - min(${statementMovements.fechaIso}))::numeric / (count(*) - 1)
        else null end`.mapWith((v: string | null) =>
        v === null ? null : Number(v),
      ),
    })
    .from(statementMovements)
    .where(and(...periodWhere))
    .groupBy(statementMovements.clientName, statementMovements.panOrigen)
    .orderBy(
      desc(
        sql`sum(case when ${statementMovements.operacion} = 'CR' then ${statementMovements.importe} else 0 end)`,
      ),
    )
    .limit(limit);

  // Período anterior (para delta_pct): mismo largo antes de `desde`, o mes anterior
  let prevWhere: ReturnType<typeof and> | null = null;
  let nuevosStart: string | null = null;
  let nuevosEnd: string | null = null;
  if (usaRango) {
    const dur =
      (new Date(opts.hasta! + "T00:00:00Z").getTime() -
        new Date(opts.desde! + "T00:00:00Z").getTime()) /
      86400000;
    const prevEnd = isoAddDays(opts.desde!, -1);
    const prevStart = isoAddDays(prevEnd, -dur);
    prevWhere = and(
      baseClientFilter(orgId),
      gte(statementMovements.fechaIso, prevStart),
      lte(statementMovements.fechaIso, prevEnd),
    );
    nuevosStart = opts.desde!;
    nuevosEnd = opts.hasta!;
  } else if (opts.anio && opts.mes) {
    const prevMes = opts.mes === 1 ? 12 : opts.mes - 1;
    const prevAnio = opts.mes === 1 ? opts.anio - 1 : opts.anio;
    prevWhere = and(
      baseClientFilter(orgId),
      eq(statementMovements.anio, prevAnio),
      eq(statementMovements.mes, prevMes),
    );
    nuevosStart = `${opts.anio}-${String(opts.mes).padStart(2, "0")}-01`;
    nuevosEnd = fechaRef;
  }

  const prevMap = new Map<string, number>();
  if (prevWhere) {
    const prevRows = await db
      .select({
        client_name: statementMovements.clientName,
        pan_origen: statementMovements.panOrigen,
        total: num(
          sql<number>`sum(case when ${statementMovements.operacion} = 'CR' then ${statementMovements.importe} else 0 end)`,
        ),
      })
      .from(statementMovements)
      .where(prevWhere)
      .groupBy(statementMovements.clientName, statementMovements.panOrigen);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of prevRows as any[]) {
      prevMap.set(`${r.client_name}|${r.pan_origen}`, r.total);
    }
  }

  // es_nuevo: su primera operación GLOBAL cae dentro del período
  const nuevosSet = new Set<string>();
  if (nuevosStart && nuevosEnd) {
    const nuevos = await db
      .select({
        client_name: statementMovements.clientName,
        pan_origen: statementMovements.panOrigen,
      })
      .from(statementMovements)
      .where(baseClientFilter(orgId))
      .groupBy(statementMovements.clientName, statementMovements.panOrigen)
      .having(
        sql`min(${statementMovements.fechaIso}) between ${nuevosStart}::date and ${nuevosEnd}::date`,
      );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of nuevos as any[]) {
      nuevosSet.add(`${r.client_name}|${r.pan_origen}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: ClienteRow[] = (main as any[]).map((r) => {
    const key = `${r.client_name}|${r.pan_origen}`;
    const totalPrev = prevMap.get(key) ?? 0;
    return {
      ...r,
      ticket_promedio: Math.round((r.ticket_promedio ?? 0) * 100) / 100,
      dias_entre_ops_promedio:
        r.dias_entre_ops_promedio === null
          ? null
          : Math.round(r.dias_entre_ops_promedio * 10) / 10,
      total_mes_anterior: totalPrev,
      delta_pct:
        totalPrev > 0
          ? Math.round(((r.total_creditos - totalPrev) / totalPrev) * 100)
          : null,
      es_nuevo: nuevosSet.has(key),
    };
  });

  const totalIngresos = rows.reduce((a, r) => a + r.total_creditos, 0);
  const totalOps = rows.reduce((a, r) => a + r.num_ops, 0);
  const nuevosCount = rows.filter((r) => r.es_nuevo).length;
  const top20Count = Math.max(1, Math.ceil(rows.length * 0.2));
  const top20Sum = rows
    .slice(0, top20Count)
    .reduce((a, r) => a + r.total_creditos, 0);

  const kpis: ClientesKpis = {
    total_clientes: rows.length,
    total_ingresos: totalIngresos,
    nuevos: nuevosCount,
    recurrentes: rows.length - nuevosCount,
    ticket_promedio:
      totalOps > 0 ? Math.round((totalIngresos / totalOps) * 100) / 100 : 0,
    top20_pct:
      totalIngresos > 0 ? Math.round((top20Sum / totalIngresos) * 100) : 0,
  };

  return { rows, kpis };
}

export type FichaResult = {
  cliente: {
    client_name: string;
    pan_origen: string | null;
    telefono: string | null;
  } | null;
  ops: Array<{
    id: string;
    fecha: string | null;
    fechaIso: string | null;
    operacion: string | null;
    importe: number;
    observacion: string | null;
  }>;
  stats: {
    total_creditos: number;
    num_creditos: number;
    ticket_promedio: number;
    primera_op: string | null;
    ultima_op: string | null;
    dias_relacion: number;
    dias_desde_ultima: number;
    frecuencia_promedio_dias: number | null;
    meses_activo: number;
  } | null;
  por_mes: Array<{ mes: string; total: number }>;
};

/** GET /analytics/clientes/ficha — timeline + stats + por_mes de un cliente. */
export async function clienteFicha(
  db: Db,
  orgId: string,
  clientName: string,
  panOrigen?: string,
): Promise<FichaResult> {
  const where = [
    eq(statementMovements.orgId, orgId),
    eq(statementMovements.clientName, clientName),
  ];
  if (panOrigen) where.push(eq(statementMovements.panOrigen, panOrigen));
  const ops = await db
    .select({
      id: statementMovements.id,
      fecha: statementMovements.fecha,
      fechaIso: sql<string | null>`${statementMovements.fechaIso}::text`,
      operacion: statementMovements.operacion,
      importe: num(sql<number>`coalesce(${statementMovements.importe}, 0)`),
      observacion: statementMovements.observacion,
      panOrigen: statementMovements.panOrigen,
      telefono: statementMovements.telefono,
    })
    .from(statementMovements)
    .where(and(...where))
    .orderBy(desc(statementMovements.fechaIso));

  if (ops.length === 0) {
    return { cliente: null, ops: [], stats: null, por_mes: [] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = ops as any[];
  const creditos = list.filter((o) => o.operacion === "CR");
  const totalCreditos = creditos.reduce((a, o) => a + o.importe, 0);
  const porMesMap = new Map<string, number>();
  for (const o of creditos) {
    if (!o.fechaIso) continue;
    const key = o.fechaIso.slice(0, 7);
    porMesMap.set(key, (porMesMap.get(key) ?? 0) + o.importe);
  }
  const ultima = list[0].fechaIso ? new Date(list[0].fechaIso) : null;
  const primera = list[list.length - 1].fechaIso
    ? new Date(list[list.length - 1].fechaIso)
    : null;
  const now = new Date();
  const credFechas = creditos
    .map((o) => o.fechaIso)
    .filter(Boolean)
    .sort();
  let frecuencia: number | null = null;
  if (credFechas.length > 1) {
    const range =
      (new Date(credFechas[credFechas.length - 1]).getTime() -
        new Date(credFechas[0]).getTime()) /
      86400000;
    frecuencia = Math.round((range / (credFechas.length - 1)) * 10) / 10;
  }

  return {
    cliente: {
      client_name: clientName,
      pan_origen: panOrigen ?? list[0].panOrigen,
      telefono: list.find((o) => o.telefono)?.telefono ?? null,
    },
    ops: list.map((o) => ({
      id: o.id,
      fecha: o.fecha,
      fechaIso: o.fechaIso,
      operacion: o.operacion,
      importe: o.importe,
      observacion: o.observacion,
    })),
    stats: {
      total_creditos: totalCreditos,
      num_creditos: creditos.length,
      ticket_promedio:
        creditos.length > 0
          ? Math.round((totalCreditos / creditos.length) * 100) / 100
          : 0,
      primera_op: list[list.length - 1].fechaIso,
      ultima_op: list[0].fechaIso,
      dias_relacion:
        primera && ultima
          ? Math.floor((ultima.getTime() - primera.getTime()) / 86400000)
          : 0,
      dias_desde_ultima: ultima
        ? Math.floor((now.getTime() - ultima.getTime()) / 86400000)
        : 0,
      frecuencia_promedio_dias: frecuencia,
      meses_activo: porMesMap.size,
    },
    por_mes: [...porMesMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, total]) => ({ mes, total })),
  };
}

export type HeatmapDia = {
  dia_sem: number;
  label: string;
  num_ops: number;
  total: number;
};

const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DOW_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** GET /analytics/heatmap-dia-semana — créditos por día Lun→Dom. */
export async function heatmapDiaSemana(
  db: Db,
  orgId: string,
  opts: { desde?: string; hasta?: string; anio?: number; mes?: number } = {},
): Promise<HeatmapDia[]> {
  const where = [
    eq(statementMovements.orgId, orgId),
    eq(statementMovements.operacion, "CR"),
    isNotNull(statementMovements.fechaIso),
  ];
  if (opts.desde) where.push(gte(statementMovements.fechaIso, opts.desde));
  if (opts.hasta) where.push(lte(statementMovements.fechaIso, opts.hasta));
  if (opts.anio) where.push(eq(statementMovements.anio, opts.anio));
  if (opts.mes) where.push(eq(statementMovements.mes, opts.mes));

  const rows = await db
    .select({
      dia_sem: num(
        sql<number>`extract(dow from ${statementMovements.fechaIso})::int`,
      ),
      num_ops: num(sql<number>`count(*)`),
      total: num(sql<number>`sum(${statementMovements.importe})`),
    })
    .from(statementMovements)
    .where(and(...where))
    .groupBy(sql`extract(dow from ${statementMovements.fechaIso})`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byDow = new Map((rows as any[]).map((r) => [r.dia_sem, r]));
  return DOW_ORDER.map((d, i) => ({
    dia_sem: d,
    label: DOW_LABELS[i],
    num_ops: byDow.get(d)?.num_ops ?? 0,
    total: byDow.get(d)?.total ?? 0,
  }));
}
