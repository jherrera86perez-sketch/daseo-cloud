"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { extractLayoutText } from "./extract";
import {
  uploadStatement,
  deleteStatement,
  getStatementDetail,
  type StatementMovementRow,
} from "./queries";

export type ActionState = {
  error?: string;
  ok?: string;
  warn?: string;
} | null;

const fmt = (v: string | number | null) =>
  v === null ? "0.00" : Number(v).toFixed(2);

/** Sube un estado de cuenta BPA (PDF). Mensajes = los del ERP. */
export async function uploadStatementAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Se requiere un archivo" };
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return { error: "Solo se aceptan archivos PDF" };
  }
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const rawText = await extractLayoutText(data);
    const res = await uploadStatement(getDb(), orgId, userId, {
      rawText,
      filename: file.name,
    });
    revalidatePath("/[locale]/statements", "page");
    if (!res.resumen.validacion.cuadrado) {
      return {
        warn: `El estado de cuenta NO cuadra. ${res.numOperaciones} operaciones procesadas. Revise el PDF antes de conciliar.`,
      };
    }
    return {
      ok: `Importado: ${res.numOperaciones} ops · Créditos ${fmt(res.resumen.totalCreditos)} · Débitos ${fmt(res.resumen.totalDebitos)}`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
}

export async function deleteStatementAction(id: string): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await deleteStatement(getDb(), orgId, userId, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/statements", "page");
  return { ok: "Estado de cuenta eliminado" };
}

export type MovementDto = {
  id: string;
  fecha: string | null;
  referencia: string | null;
  operacion: string | null;
  importe: string | null;
  saldo: string | null;
  observacion: string | null;
  clientName: string | null;
  panOrigen: string | null;
  tipoTransaccion: string | null;
};

/** Detalle bajo demanda al expandir una fila (como el GET /:id del ERP). */
export async function statementDetailAction(id: string): Promise<{
  error?: string;
  movements?: MovementDto[];
}> {
  const { orgId } = await requireOrg();
  try {
    const { movements } = await getStatementDetail(getDb(), orgId, id);
    return {
      movements: movements.map((m: StatementMovementRow) => ({
        id: m.id,
        fecha: m.fecha,
        referencia: m.referencia,
        operacion: m.operacion,
        importe: m.importe,
        saldo: m.saldo,
        observacion: m.observacion,
        clientName: m.clientName,
        panOrigen: m.panOrigen,
        tipoTransaccion: m.tipoTransaccion,
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
}

// ---------- F8-M3b: Top Clientes ----------

export async function topClientesAction(opts: {
  desde?: string;
  hasta?: string;
}): Promise<{
  error?: string;
  rows?: import("./analytics").ClienteRow[];
  kpis?: import("./analytics").ClientesKpis;
  dias?: import("./analytics").HeatmapDia[];
}> {
  const { orgId } = await requireOrg();
  try {
    const { analyticsClientes, heatmapDiaSemana } = await import("./analytics");
    const [clientes, dias] = await Promise.all([
      analyticsClientes(getDb(), orgId, { ...opts, limit: 500 }),
      heatmapDiaSemana(getDb(), orgId, opts),
    ]);
    return { rows: clientes.rows, kpis: clientes.kpis, dias };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
}

export async function clienteFichaAction(
  clientName: string,
  panOrigen?: string,
): Promise<{
  error?: string;
  ficha?: import("./analytics").FichaResult;
}> {
  const { orgId } = await requireOrg();
  try {
    const { clienteFicha } = await import("./analytics");
    return { ficha: await clienteFicha(getDb(), orgId, clientName, panOrigen) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
}
