"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { parseDecimalToCents } from "@/lib/money";
import {
  saveFiscalSettings,
  computeMonthObligations,
  markObligationPaid,
} from "./queries";

export type ActionState = { error?: string } | null;

export async function saveFiscalSettingsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = z
    .object({
      regime: z.enum(["TCP_GENERAL", "TCP_SIMPLIFICADO"]),
      nit: z.string().trim().max(30).optional(),
      payroll: z
        .string()
        .regex(/^\d+(?:[.,]\d{1,2})?$/)
        .or(z.literal("")),
      quota: z
        .string()
        .regex(/^\d+(?:[.,]\d{1,2})?$/)
        .or(z.literal("")),
      minExempt: z
        .string()
        .regex(/^\d+(?:[.,]\d{1,2})?$/)
        .or(z.literal("")),
      exentoFotovoltaico: z.coerce.boolean(),
    })
    .safeParse({
      regime: form.get("regime"),
      nit: String(form.get("nit") ?? "") || undefined,
      payroll: String(form.get("payroll") ?? ""),
      quota: String(form.get("quota") ?? ""),
      minExempt: String(form.get("minExempt") ?? ""),
      exentoFotovoltaico: form.get("exentoFotovoltaico") === "on",
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const d = parsed.data;
  await saveFiscalSettings(getDb(), orgId, userId, "CU", {
    regime: d.regime,
    nit: d.nit,
    monthlyPayrollCents: d.payroll
      ? parseDecimalToCents(d.payroll).toString()
      : "0",
    fixedQuotaCents: d.quota ? parseDecimalToCents(d.quota).toString() : "0",
    minExemptCents: d.minExempt
      ? parseDecimalToCents(d.minExempt).toString()
      : "0",
    exentoFotovoltaico: d.exentoFotovoltaico,
  });
  revalidatePath("/[locale]/fiscal", "page");
  return null;
}

export async function computeMonthAction(
  year: number,
  month: number,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await computeMonthObligations(getDb(), orgId, userId, year, month);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/fiscal", "page");
  return null;
}

export async function markPaidAction(id: string): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await markObligationPaid(getDb(), orgId, userId, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/fiscal", "page");
  return null;
}
