"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { parseDecimalToCents } from "@/lib/money";
import { createOrder, confirmOrder, cancelOrder } from "./queries";

export type ActionState = { error?: string } | null;

export async function createOrderAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const recipeId = z.string().uuid().safeParse(form.get("recipeId"));
  if (!recipeId.success) {
    return { error: "receta inválida" };
  }
  let order;
  try {
    order = await createOrder(getDb(), orgId, userId, {
      recipeId: recipeId.data,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/production", "page");
  redirect({ href: `/production/${order.id}`, locale: await getLocale() });
  return null;
}

const confirmSchema = z.object({
  producedQty: z.string().regex(/^\d+(?:[.,]\d{1,3})?$/),
  labor: z
    .string()
    .regex(/^\d+(?:[.,]\d{1,2})?$/)
    .or(z.literal("")),
  overhead: z
    .string()
    .regex(/^\d+(?:[.,]\d{1,2})?$/)
    .or(z.literal("")),
  inputs: z
    .array(
      z.object({
        inputId: z.string().uuid(),
        actualQty: z.string().regex(/^\d+(?:[.,]\d{1,3})?$/),
      }),
    )
    .min(1),
  // ≈ merma_registrada del ERP (opcional)
  wasteQty: z
    .string()
    .regex(/^\d+(?:[.,]\d{1,3})?$/)
    .or(z.literal(""))
    .optional(),
  // mano de obra por empleado (produccion_mano_obra del ERP)
  laborLines: z
    .array(
      z.object({
        employeeId: z.string().uuid(),
        hours: z.string().regex(/^\d+(?:[.,]\d{1,2})?$/),
        costHour: z.string().regex(/^\d+(?:[.,]\d{1,2})?$/),
      }),
    )
    .optional(),
  // ≈ produccion_costos_adicionales del ERP ("Otros Gastos Adicionales")
  overheadLines: z
    .array(
      z.object({
        concept: z.string().trim().min(1).max(200),
        amount: z.string().regex(/^\d+(?:[.,]\d{1,2})?$/),
      }),
    )
    .optional(),
});

export async function confirmOrderAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  let parsed;
  try {
    parsed = confirmSchema.safeParse(JSON.parse(String(form.get("payload"))));
  } catch {
    return { error: "payload inválido" };
  }
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const d = parsed.data;
  try {
    await confirmOrder(getDb(), orgId, userId, id, {
      producedQty: d.producedQty,
      laborCostBaseCents: d.labor ? parseDecimalToCents(d.labor) : 0n,
      overheadBaseCents: d.overhead ? parseDecimalToCents(d.overhead) : 0n,
      inputs: d.inputs,
      wasteQty: d.wasteQty || undefined,
      labor: d.laborLines?.map((l) => ({
        employeeId: l.employeeId,
        hours: l.hours,
        costHourCents: parseDecimalToCents(l.costHour),
      })),
      overheadItems: d.overheadLines?.map((l) => ({
        concept: l.concept,
        amountCents: parseDecimalToCents(l.amount),
      })),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath(`/[locale]/production/${id}`, "page");
  return null;
}

export async function cancelOrderAction(id: string): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await cancelOrder(getDb(), orgId, userId, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/production", "page");
  redirect({ href: "/production", locale: await getLocale() });
  return null;
}
