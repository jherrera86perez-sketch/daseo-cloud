"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { parseDecimalToCents } from "@/lib/money";
import { addRate } from "@/features/rates/queries";
import { createSale, confirmSale, cancelSale, addPayment } from "./queries";

export type ActionState = { error?: string } | null;

const CURRENCY = z.enum(["CUP", "USD", "BRL"]);

const saleFormSchema = z.object({
  customerId: z.string().uuid(),
  currency: CURRENCY,
  rateToBase: z.string().regex(/^\d+(?:[.,]\d{1,6})?$/),
  idempotencyKey: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid().optional(),
        description: z.string().min(1),
        qty: z.string().regex(/^\d+(?:[.,]\d{1,3})?$/),
        unitPrice: z.string().regex(/^\d+(?:[.,]\d{1,2})?$/),
      }),
    )
    .min(1),
});

export async function createSaleAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("payload")));
  } catch {
    return { error: "payload inválido" };
  }
  const parsed = saleFormSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const d = parsed.data;
  let sale;
  try {
    sale = await createSale(getDb(), orgId, userId, {
      customerId: d.customerId,
      currency: d.currency,
      rateToBase: d.rateToBase,
      idempotencyKey: d.idempotencyKey,
      items: d.items.map((i) => ({
        productId: i.productId,
        description: i.description,
        qty: i.qty,
        unitPriceCents: parseDecimalToCents(i.unitPrice),
      })),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/sales", "page");
  redirect({ href: `/sales/${sale.id}`, locale: await getLocale() });
  return null;
}

export async function confirmSaleAction(id: string): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await confirmSale(getDb(), orgId, userId, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath(`/[locale]/sales/${id}`, "page");
  return null;
}

export async function cancelSaleAction(id: string): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await cancelSale(getDb(), orgId, userId, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath(`/[locale]/sales/${id}`, "page");
  return null;
}

export async function addPaymentAction(
  saleId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    const amountCents = parseDecimalToCents(String(form.get("amount")));
    const appliedCents = parseDecimalToCents(String(form.get("applied")));
    const currency = CURRENCY.parse(form.get("currency"));
    const rate = String(form.get("rate") || "1");
    await addPayment(getDb(), orgId, userId, saleId, {
      amountCents,
      currency,
      rateFixed: rate,
      appliedCents,
      method: String(form.get("method") || "cash"),
      note: String(form.get("note") || "") || undefined,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath(`/[locale]/sales/${saleId}`, "page");
  return null;
}

export async function addRateAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    const currency = CURRENCY.parse(form.get("currency"));
    await addRate(getDb(), orgId, userId, {
      currency,
      rateToBase: String(form.get("rate")),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/settings", "page");
  return null;
}
