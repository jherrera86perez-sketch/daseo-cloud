"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { parseDecimalToCents } from "@/lib/money";
import { createQuote, sendQuote, acceptQuote, rejectQuote } from "./queries";

export type ActionState = { error?: string } | null;

const quoteFormSchema = z.object({
  customerId: z.string().uuid(),
  dealId: z.string().uuid().optional(),
  currency: z.enum(["CUP", "USD", "BRL"]),
  rateToBase: z.string().regex(/^\d+(?:[.,]\d{1,6})?$/),
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

export async function createQuoteAction(
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
  const parsed = quoteFormSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const d = parsed.data;
  let quote;
  try {
    quote = await createQuote(getDb(), orgId, userId, {
      customerId: d.customerId,
      dealId: d.dealId,
      currency: d.currency,
      rateToBase: d.rateToBase,
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
  revalidatePath("/[locale]/quotes", "page");
  redirect({ href: `/quotes/${quote.id}`, locale: await getLocale() });
  return null;
}

async function transition(
  id: string,
  fn: typeof sendQuote,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await fn(getDb(), orgId, userId, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath(`/[locale]/quotes/${id}`, "page");
  return null;
}

export async function sendQuoteAction(id: string) {
  return transition(id, sendQuote);
}

export async function rejectQuoteAction(id: string) {
  return transition(id, rejectQuote);
}

export async function acceptQuoteAction(id: string): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  let saleId: string;
  try {
    ({ saleId } = await acceptQuote(getDb(), orgId, userId, id));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  redirect({ href: `/sales/${saleId}`, locale: await getLocale() });
  return null;
}
