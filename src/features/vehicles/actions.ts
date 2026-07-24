"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { vehicleInputSchema } from "./schemas";
import { createVehicle, retireVehicle } from "./queries";

export type ActionState = { error?: string } | null;

function fromForm(form: FormData) {
  const out: Record<string, string> = {};
  for (const k of [
    "plate",
    "brand",
    "model",
    "categoryCode",
    "acquisitionDate",
    "status",
  ]) {
    const v = form.get(k);
    if (typeof v === "string" && v !== "") out[k] = v;
  }
  return out;
}

export async function createVehicleAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = vehicleInputSchema.safeParse(fromForm(form));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  try {
    await createVehicle(getDb(), orgId, userId, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/vehicles", "page");
  return null;
}

export async function retireVehicleAction(id: string): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await retireVehicle(getDb(), orgId, userId, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/vehicles", "page");
  return null;
}
