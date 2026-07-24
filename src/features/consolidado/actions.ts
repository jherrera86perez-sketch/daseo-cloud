"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import {
  resumenConciliacion,
  listBankMovements,
  listConsolidado,
  importarMovimiento,
  importarMasivo,
  crearEntradaManual,
  editarEntrada,
  eliminarEntrada,
  listSubcategorias,
} from "./queries";
import {
  listCobrosPendientes,
  listCobrosVinculados,
  sugerenciasBanco,
  asignarBanco,
  desasignarBanco,
  autoVincular,
} from "./cobros";

const PATH = "/[locale]/reconciliation";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "error";
}

export async function resumenAction(mes: number, anio: number) {
  const { orgId } = await requireOrg();
  try {
    return { resumen: await resumenConciliacion(getDb(), orgId, mes, anio) };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

const listSchema = z.object({
  mes: z.coerce.number().int().min(0).max(12),
  anio: z.coerce.number().int().min(2000),
  estado: z.enum(["todos", "pendientes", "conciliados"]).optional(),
  tipo: z.enum(["CR", "DB", ""]).optional(),
  search: z.string().optional(),
  orderBy: z.enum(["fecha", "importe"]).optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export async function bankMovementsAction(input: z.input<typeof listSchema>) {
  const { orgId } = await requireOrg();
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return { error: "parámetros inválidos" };
  try {
    const { rows, total } = await listBankMovements(
      getDb(),
      orgId,
      parsed.data,
    );
    return {
      total,
      rows: rows.map((m) => ({
        id: m.id,
        fecha: m.fechaIso,
        operacion: m.operacion,
        referencia: m.referencia,
        observacion: m.observacion,
        clientName: m.clientName,
        importe: m.importe,
        conciliado: m.conciliado,
        categoria: m.cbCategoria,
      })),
    };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function consolidadoAction(input: z.input<typeof listSchema>) {
  const { orgId } = await requireOrg();
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return { error: "parámetros inválidos" };
  try {
    const { rows, total, totalCR, totalDB } = await listConsolidado(
      getDb(),
      orgId,
      parsed.data,
    );
    return {
      total,
      totalCR,
      totalDB,
      rows: rows.map((r) => ({
        id: r.id,
        fecha: r.fechaContable,
        tipo: r.tipoTransaccion,
        importe: r.importe,
        categoria: r.categoria,
        subcategoria: r.subcategoria,
        detalle: r.detalle,
        observaciones: r.observaciones,
        clienteNombre: r.clienteNombre,
        referencia: r.referencia,
        origen: r.origen,
      })),
    };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

const registrarSchema = z.object({
  movimientoId: z.string().uuid(),
  categoria: z.string().nullish(),
  observaciones: z.string().nullish(),
  subcategoria: z.string().nullish(),
  detalle: z.string().nullish(),
});

export async function importarAction(
  input: z.input<typeof registrarSchema>,
): Promise<{ error?: string } | null> {
  const { orgId, userId } = await requireOrg();
  const parsed = registrarSchema.safeParse(input);
  if (!parsed.success) return { error: "movimiento_cuenta_id requerido" };
  try {
    await importarMovimiento(getDb(), orgId, userId, parsed.data);
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath(PATH, "page");
  return null;
}

export async function importarMasivoAction(
  mes: number,
  anio: number,
  operacion?: "CR" | "DB",
): Promise<{ error?: string; importados?: number }> {
  const { orgId, userId } = await requireOrg();
  try {
    const res = await importarMasivo(getDb(), orgId, userId, {
      mes,
      anio,
      operacion,
    });
    revalidatePath(PATH, "page");
    return { importados: res.importados };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

const manualSchema = z.object({
  fechaContable: z.string(),
  tipoTransaccion: z.string(),
  importe: z.string(),
  categoria: z.string().nullish(),
  observaciones: z.string().nullish(),
  clienteNombre: z.string().nullish(),
  referencia: z.string().nullish(),
  subcategoria: z.string().nullish(),
  detalle: z.string().nullish(),
});

export async function manualAction(
  input: z.input<typeof manualSchema>,
): Promise<{ error?: string } | null> {
  const { orgId, userId } = await requireOrg();
  const parsed = manualSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "fecha_contable, tipo_transaccion e importe son requeridos",
    };
  }
  try {
    await crearEntradaManual(getDb(), orgId, userId, parsed.data);
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath(PATH, "page");
  return null;
}

const editSchema = z.object({
  categoria: z.string().nullish(),
  observaciones: z.string().nullish(),
  clienteNombre: z.string().nullish(),
  subcategoria: z.string().nullish(),
  detalle: z.string().nullish(),
});

export async function editarEntradaAction(
  id: string,
  input: z.input<typeof editSchema>,
): Promise<{ error?: string } | null> {
  const { orgId, userId } = await requireOrg();
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { error: "Nada que actualizar" };
  try {
    await editarEntrada(getDb(), orgId, userId, id, parsed.data);
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath(PATH, "page");
  return null;
}

export async function eliminarEntradaAction(
  id: string,
): Promise<{ error?: string } | null> {
  const { orgId, userId } = await requireOrg();
  try {
    await eliminarEntrada(getDb(), orgId, userId, id);
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath(PATH, "page");
  return null;
}

export async function subcategoriasAction(tipo?: "CR" | "DB") {
  const { orgId } = await requireOrg();
  try {
    return { subcategorias: await listSubcategorias(getDb(), orgId, tipo) };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function cobrosAction(mes: number, anio: number) {
  const { orgId } = await requireOrg();
  try {
    const db = getDb();
    const [pendientes, vinculados] = await Promise.all([
      listCobrosPendientes(db, orgId, mes, anio),
      listCobrosVinculados(db, orgId, mes, anio),
    ]);
    return { pendientes, vinculados };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function sugerenciasAction(paymentId: string) {
  const { orgId } = await requireOrg();
  try {
    return { sugerencias: await sugerenciasBanco(getDb(), orgId, paymentId) };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function asignarBancoAction(
  paymentId: string,
  movimientoId: string,
  score?: number,
): Promise<{ error?: string } | null> {
  const { orgId, userId } = await requireOrg();
  try {
    await asignarBanco(getDb(), orgId, userId, paymentId, movimientoId, score);
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath(PATH, "page");
  return null;
}

export async function desasignarBancoAction(
  paymentId: string,
): Promise<{ error?: string } | null> {
  const { orgId, userId } = await requireOrg();
  try {
    await desasignarBanco(getDb(), orgId, userId, paymentId);
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath(PATH, "page");
  return null;
}

export async function autoVincularAction(opts: {
  mes: number;
  anio: number;
  minScore?: number;
  dryRun?: boolean;
}) {
  const { orgId, userId } = await requireOrg();
  try {
    const resultado = await autoVincular(getDb(), orgId, userId, opts);
    if (!opts.dryRun) revalidatePath(PATH, "page");
    return { resultado };
  } catch (e) {
    return { error: errMsg(e) };
  }
}
