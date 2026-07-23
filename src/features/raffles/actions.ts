"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import {
  raffleParticipants,
  createRaffle,
  deleteRaffle,
  type Participante,
} from "./queries";

export type ActionState = { error?: string; ok?: string } | null;

/** GET /sorteos/participantes del ERP. */
export async function raffleParticipantsAction(
  anio: number,
  mes: number,
): Promise<{ error?: string; participantes?: Participante[] }> {
  const { orgId } = await requireOrg();
  if (!anio || !mes) return { error: "Se requiere anio y mes" };
  try {
    return {
      participantes: await raffleParticipants(getDb(), orgId, anio, mes),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
}

const raffleSchema = z.object({
  nombre: z.string().max(200).optional().or(z.literal("")),
  mes: z.coerce.number().int().min(1).max(12),
  anio: z.coerce.number().int().min(2000),
  ganadorClientName: z.string().min(1),
  ganadorPan: z.string().nullish(),
  ganadorTelefono: z.string().nullish(),
  ganadorNumOps: z.coerce.number().int().min(0).default(0),
  ganadorTotalCreditos: z.coerce.number().min(0).default(0),
  numParticipantes: z.coerce.number().int().min(0).default(0),
});

export async function createRaffleAction(
  input: z.input<typeof raffleSchema>,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = raffleSchema.safeParse(input);
  if (!parsed.success) return { error: "Se requiere ganador, mes y anio" };
  try {
    await createRaffle(getDb(), orgId, userId, {
      ...parsed.data,
      nombre: parsed.data.nombre || undefined,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/raffles", "page");
  return null;
}

export async function deleteRaffleAction(id: string): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await deleteRaffle(getDb(), orgId, userId, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/raffles", "page");
  return null;
}
