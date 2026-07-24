"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { parseDecimalToCents } from "@/lib/money";
import {
  createInternalOutflow,
  updateInternalOutflow,
  deleteInternalOutflow,
  TIPOS_SALIDA_INTERNA,
} from "./queries";

export type ActionState = { error?: string; ok?: string } | null;

const itemSchema = z.object({
  productId: z.string(),
  qty: z.string(),
});

const outflowSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z.enum(TIPOS_SALIDA_INTERNA),
  destinoNombre: z.string().max(300).nullish(),
  employeeId: z.string().uuid().nullish(),
  montoEfectivo: z.string().default("0"),
  bankAccountId: z.string().uuid().nullish(),
  motivo: z.string().max(500).nullish(),
  notas: z.string().max(1000).nullish(),
  items: z.array(itemSchema).default([]),
});

export type OutflowFormInput = z.input<typeof outflowSchema>;

function toQueryInput(data: z.output<typeof outflowSchema>) {
  return {
    ...data,
    montoEfectivoCents: data.montoEfectivo
      ? parseDecimalToCents(data.montoEfectivo)
      : 0n,
  };
}

export async function createOutflowAction(
  input: OutflowFormInput,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = outflowSchema.safeParse(input);
  if (!parsed.success) {
    // Mensaje del ERP para el caso más común de body inválido
    return {
      error: "tipo inválido (DONACION | REGALO | AUTOCONSUMO | TRABAJADORES)",
    };
  }
  try {
    await createInternalOutflow(
      getDb(),
      orgId,
      userId,
      toQueryInput(parsed.data),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/internal-outflows", "page");
  return null;
}

export async function updateOutflowAction(
  id: string,
  input: OutflowFormInput,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = outflowSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "tipo inválido (DONACION | REGALO | AUTOCONSUMO | TRABAJADORES)",
    };
  }
  try {
    await updateInternalOutflow(
      getDb(),
      orgId,
      userId,
      id,
      toQueryInput(parsed.data),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/internal-outflows", "page");
  return null;
}

export async function deleteOutflowAction(id: string): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await deleteInternalOutflow(getDb(), orgId, userId, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/internal-outflows", "page");
  return null;
}
