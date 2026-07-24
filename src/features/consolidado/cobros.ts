import { and, asc, eq, gte, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { payments, sales, customers, statementMovements } from "@/db/schema";
import { assertOwnedByOrg } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { centsToDecimalString } from "@/lib/money";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type CobroPendiente = {
  paymentId: string;
  saleId: string;
  saleLabel: string;
  clienteNombre: string;
  fecha: string; // YYYY-MM-DD
  metodo: string;
  monto: string; // decimal
  currency: string;
  bancoMovimientoId: string | null;
  bancoMatchScore: number | null;
};

export type Sugerencia = {
  movimientoId: string;
  fecha: string | null;
  referencia: string | null;
  importe: string;
  titular: string | null;
  observacion: string | null;
  score: number;
  matchReason: string | null;
};

type MovLite = {
  id: string;
  fechaIso: string | null;
  referencia: string | null;
  importe: string | null;
  clientName: string | null;
  observacion: string | null;
};

/**
 * puntuarMatch del ERP (cobros.js:82-116), portado línea a línea:
 * Monto (0–40) + Fecha (0–30) + Titular (0–30).
 */
export function puntuarMatch(
  cobro: { monto: number; fecha: string },
  mov: MovLite,
  contexto: { referenciaBancaria: string; clienteNombre: string },
): { score: number; reasons: string[] } {
  const monto = cobro.monto;
  if (monto <= 0) return { score: 0, reasons: [] };

  const diffPct = Math.abs(Number(mov.importe) - monto) / monto;
  const scoreMonto = Math.max(0, Math.round(40 * (1 - diffPct / 0.05)));

  const diffDays = Math.abs(
    (new Date(mov.fechaIso ?? cobro.fecha).getTime() -
      new Date(cobro.fecha).getTime()) /
      86400000,
  );
  const scoreFecha = Math.max(0, Math.round(30 * (1 - diffDays / 7)));

  const titular =
    String(mov.clientName ?? "")
      .toLowerCase()
      .trim() +
    " " +
    String(mov.observacion ?? "")
      .toLowerCase()
      .trim() +
    " " +
    String(mov.referencia ?? "")
      .toLowerCase()
      .trim();

  const { referenciaBancaria: ref, clienteNombre: cli } = contexto;
  let scoreNombre = 0;
  const reasons: string[] = [];
  if (ref && titular.includes(ref)) {
    scoreNombre = 30;
    reasons.push("Titular coincide con referencia bancaria");
  } else if (cli && titular.includes(cli)) {
    scoreNombre = 20;
    reasons.push("Titular coincide con nombre del cliente");
  } else if (cli) {
    const firstWord = cli.split(/\s+/).find((w) => w.length >= 4);
    if (firstWord && titular.includes(firstWord)) {
      scoreNombre = 10;
      reasons.push("Titular coincide parcialmente");
    }
  }
  if (diffPct < 0.001) reasons.unshift("Importe exacto");
  if (diffDays < 0.5) reasons.unshift("Mismo día");

  return { score: scoreMonto + scoreFecha + scoreNombre, reasons };
}

/**
 * extraerPagador del ERP (cobros.js:144-152): quien ORDENÓ la transferencia
 * — client_name o "Ordenada por:" de la observación, en lower-trim.
 */
export function extraerPagador(mov: {
  clientName: string | null;
  observacion: string | null;
}): string {
  let p = String(mov.clientName ?? "").trim();
  if (!p) {
    const m = String(mov.observacion ?? "").match(
      /ordenada por:\s*([^.]+?)(?:\s+pan\b|\.|$)/i,
    );
    if (m) p = m[1].trim();
  }
  return p
    .toLowerCase()
    .replace(/[.,;:\s]+$/, "")
    .trim();
}

/** getContextoVenta del ERP (cobros.js:122-135), normalizado lower-trim. */
async function getContextoVenta(
  db: Db,
  orgId: string,
  saleId: string,
): Promise<{ clienteNombre: string; referenciaBancaria: string }> {
  const [row] = await db
    .select({
      clienteNombre: customers.name,
      referenciaBancaria: customers.referenciaBancaria,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(and(eq(sales.id, saleId), eq(sales.orgId, orgId)));
  return {
    clienteNombre: String(row?.clienteNombre ?? "")
      .toLowerCase()
      .trim(),
    referenciaBancaria: String(row?.referenciaBancaria ?? "")
      .toLowerCase()
      .trim(),
  };
}

type CobroRow = {
  payment: typeof payments.$inferSelect;
  sale: typeof sales.$inferSelect;
  clienteNombre: string | null;
};

function toCobro(r: CobroRow): CobroPendiente {
  return {
    paymentId: r.payment.id,
    saleId: r.sale.id,
    saleLabel: `${r.sale.series}-${r.sale.number ?? "?"}/${r.sale.year}`,
    clienteNombre: r.clienteNombre ?? "—",
    fecha: r.payment.paidAt.toISOString().slice(0, 10),
    metodo: r.payment.method,
    monto: centsToDecimalString(r.payment.amountCents),
    currency: r.payment.currency,
    bancoMovimientoId: r.payment.bancoMovimientoId,
    bancoMatchScore: r.payment.bancoMatchScore,
  };
}

function cobrosBase(orgId: string) {
  return [
    eq(payments.orgId, orgId),
    eq(payments.method, "transfer"),
    ne(sales.status, "cancelled"),
  ];
}

function periodoPago(mes: number, anio: number) {
  const inicio = new Date(Date.UTC(anio, mes - 1, 1));
  const fin = new Date(Date.UTC(anio, mes, 1));
  return [gte(payments.paidAt, inicio), lt(payments.paidAt, fin)];
}

/** GET /api/cobros?sin_banco=1 del ERP: transferencias sin vincular. */
export async function listCobrosPendientes(
  db: Db,
  orgId: string,
  mes: number,
  anio: number,
): Promise<CobroPendiente[]> {
  const rows: CobroRow[] = await db
    .select({
      payment: payments,
      sale: sales,
      clienteNombre: customers.name,
    })
    .from(payments)
    .innerJoin(sales, eq(sales.id, payments.saleId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(
      and(
        ...cobrosBase(orgId),
        isNull(payments.bancoMovimientoId),
        ...periodoPago(mes, anio),
      ),
    )
    .orderBy(asc(payments.paidAt));
  return rows.map(toCobro);
}

/** Cobros del período ya vinculados al banco (sección colapsable del ERP). */
export async function listCobrosVinculados(
  db: Db,
  orgId: string,
  mes: number,
  anio: number,
): Promise<CobroPendiente[]> {
  const rows: CobroRow[] = await db
    .select({
      payment: payments,
      sale: sales,
      clienteNombre: customers.name,
    })
    .from(payments)
    .innerJoin(sales, eq(sales.id, payments.saleId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(
      and(
        ...cobrosBase(orgId),
        isNotNull(payments.bancoMovimientoId),
        ...periodoPago(mes, anio),
      ),
    )
    .orderBy(asc(payments.paidAt));
  return rows.map(toCobro);
}

async function getOwnedPayment(
  db: Db,
  orgId: string,
  id: string,
): Promise<typeof payments.$inferSelect> {
  const [row] = await db.select().from(payments).where(eq(payments.id, id));
  const owned = assertOwnedByOrg(row, orgId);
  if (!owned) throw new Error("Cobro no encontrado");
  return owned;
}

/**
 * Candidatos CR del banco (cobros.js:539-547): monto ±5%, fecha ±7 días,
 * no usados por otro cobro; LIMIT 40 → score → top 20.
 */
async function candidatosBanco(
  db: Db,
  orgId: string,
  monto: number,
  fecha: string,
): Promise<MovLite[]> {
  const res = await db.execute(sql`
    select id, fecha_iso, referencia, importe, client_name, observacion
    from statement_movements
    where org_id = ${orgId}
      and operacion = 'CR'
      and importe between ${monto * 0.95} and ${monto * 1.05}
      and id not in (
        select banco_movimiento_id from payments
        where banco_movimiento_id is not null and org_id = ${orgId}
      )
      and abs(fecha_iso - ${fecha}::date) <= 7
    limit 40
  `);
  return ((res.rows ?? res) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    fechaIso: (r.fecha_iso as string) ?? null,
    referencia: (r.referencia as string) ?? null,
    importe: (r.importe as string) ?? null,
    clientName: (r.client_name as string) ?? null,
    observacion: (r.observacion as string) ?? null,
  }));
}

/** GET /:id/sugerencias-banco del ERP. */
export async function sugerenciasBanco(
  db: Db,
  orgId: string,
  paymentId: string,
): Promise<Sugerencia[]> {
  const cobro = await getOwnedPayment(db, orgId, paymentId);
  const monto = Number(centsToDecimalString(cobro.amountCents));
  if (monto <= 0) return [];
  const fecha = cobro.paidAt.toISOString().slice(0, 10);
  const contexto = await getContextoVenta(db, orgId, cobro.saleId);
  const raw = await candidatosBanco(db, orgId, monto, fecha);
  const scored = raw.map((m) => {
    const { score, reasons } = puntuarMatch({ monto, fecha }, m, contexto);
    return {
      movimientoId: m.id,
      fecha: m.fechaIso,
      referencia: m.referencia,
      importe: Number(m.importe ?? 0).toFixed(2),
      titular: m.clientName,
      observacion: m.observacion,
      score,
      matchReason: reasons.join(" · ") || null,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 20);
}

/**
 * POST /:id/asignar-banco del ERP: vincula y "aprende" la referencia
 * bancaria del pagador si el cliente no la tiene (falla en silencio).
 */
export async function asignarBanco(
  db: Db,
  orgId: string,
  userId: UserId,
  paymentId: string,
  movimientoId: string,
  score?: number,
): Promise<void> {
  if (!movimientoId) throw new Error("banco_movimiento_id requerido");
  const cobro = await getOwnedPayment(db, orgId, paymentId);
  const [mov] = await db
    .select()
    .from(statementMovements)
    .where(eq(statementMovements.id, movimientoId));
  const owned = assertOwnedByOrg(mov, orgId);
  if (!owned) throw new Error("Movimiento bancario no encontrado");

  await db
    .update(payments)
    .set({
      bancoMovimientoId: movimientoId,
      bancoMatchScore:
        typeof score === "number" ? Math.round(score) : cobro.bancoMatchScore,
    })
    .where(eq(payments.id, paymentId));

  try {
    const pagador = extraerPagador({
      clientName: owned.clientName,
      observacion: owned.observacion,
    });
    if (pagador) {
      const [venta] = await db
        .select({ customerId: sales.customerId })
        .from(sales)
        .where(eq(sales.id, cobro.saleId));
      if (venta?.customerId) {
        await db
          .update(customers)
          .set({ referenciaBancaria: pagador })
          .where(
            and(
              eq(customers.id, venta.customerId),
              eq(customers.orgId, orgId),
              sql`(${customers.referenciaBancaria} is null or trim(${customers.referenciaBancaria}) = '')`,
            ),
          );
      }
    }
  } catch {
    // aprender nunca debe romper la vinculación (cobros.js:485-496)
  }

  await logAudit(db, {
    orgId,
    userId,
    entity: "payment",
    entityId: paymentId,
    action: "update",
    after: { bancoMovimientoId: movimientoId, score },
  });
}

/** POST /:id/desasignar-banco del ERP. */
export async function desasignarBanco(
  db: Db,
  orgId: string,
  userId: UserId,
  paymentId: string,
): Promise<void> {
  await getOwnedPayment(db, orgId, paymentId);
  await db
    .update(payments)
    .set({ bancoMovimientoId: null })
    .where(and(eq(payments.id, paymentId), eq(payments.orgId, orgId)));
  await logAudit(db, {
    orgId,
    userId,
    entity: "payment",
    entityId: paymentId,
    action: "update",
    after: { bancoMovimientoId: null },
  });
}

export type AutoVincularResultado = {
  procesados: number;
  vinculados: number;
  omitidos: number;
  threshold: number;
  dryRun: boolean;
  detalles: Array<{
    paymentId: string;
    resultado:
      "sin_candidatos" | "score_bajo" | "ambiguo" | "vinculado" | "vincularia";
    score?: number;
    scoreSegundo?: number;
    movimientoId?: string;
    matchReason?: string | null;
  }>;
};

/**
 * POST /auto-vincular del ERP (cobros.js:570-670) con su regla
 * anti-falsos-positivos: mejor<threshold → score_bajo; segundo>=threshold
 * y (mejor-segundo)<5 → ambiguo (no vincula).
 */
export async function autoVincular(
  db: Db,
  orgId: string,
  userId: UserId,
  opts: { mes: number; anio: number; minScore?: number; dryRun?: boolean },
): Promise<AutoVincularResultado> {
  if (!opts.mes || !opts.anio) {
    throw new Error("mes y anio son requeridos");
  }
  const threshold = Math.max(0, Math.min(100, Number(opts.minScore) || 85));
  const dryRun = Boolean(opts.dryRun);
  const pendientes = await listCobrosPendientes(db, orgId, opts.mes, opts.anio);

  const detalles: AutoVincularResultado["detalles"] = [];
  let vinculados = 0;
  let omitidos = 0;
  const yaUsados = new Set<string>();

  for (const cobro of pendientes) {
    const monto = Number(cobro.monto);
    if (monto <= 0) {
      omitidos++;
      continue;
    }
    const contexto = await getContextoVenta(db, orgId, cobro.saleId);
    const candidatos = (
      await candidatosBanco(db, orgId, monto, cobro.fecha)
    ).filter((m) => !yaUsados.has(m.id));
    const scored = candidatos
      .map((m) => ({
        mov: m,
        ...puntuarMatch({ monto, fecha: cobro.fecha }, m, contexto),
      }))
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      detalles.push({
        paymentId: cobro.paymentId,
        resultado: "sin_candidatos",
      });
      omitidos++;
      continue;
    }
    const mejor = scored[0];
    const segundo = scored[1];
    if (mejor.score < threshold) {
      detalles.push({
        paymentId: cobro.paymentId,
        resultado: "score_bajo",
        score: mejor.score,
      });
      omitidos++;
      continue;
    }
    if (
      segundo &&
      segundo.score >= threshold &&
      mejor.score - segundo.score < 5
    ) {
      detalles.push({
        paymentId: cobro.paymentId,
        resultado: "ambiguo",
        score: mejor.score,
        scoreSegundo: segundo.score,
      });
      omitidos++;
      continue;
    }

    if (!dryRun) {
      await db
        .update(payments)
        .set({ bancoMovimientoId: mejor.mov.id, bancoMatchScore: mejor.score })
        .where(eq(payments.id, cobro.paymentId));
    }
    yaUsados.add(mejor.mov.id);
    vinculados++;
    detalles.push({
      paymentId: cobro.paymentId,
      resultado: dryRun ? "vincularia" : "vinculado",
      movimientoId: mejor.mov.id,
      score: mejor.score,
      matchReason: mejor.reasons.join(" · ") || null,
    });
  }

  if (!dryRun) {
    await logAudit(db, {
      orgId,
      userId,
      entity: "payment",
      entityId: orgId,
      action: "update",
      after: {
        autoVincular: true,
        mes: opts.mes,
        anio: opts.anio,
        threshold,
        procesados: pendientes.length,
        vinculados,
        omitidos,
      },
    });
  }

  return {
    procesados: pendientes.length,
    vinculados,
    omitidos,
    threshold,
    dryRun,
    detalles,
  };
}
