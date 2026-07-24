"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { parseDecimalToCents } from "@/lib/money";
import { addRate } from "@/features/rates/queries";
import { documentAllowance, FREE_LIMIT_ERROR } from "@/features/admin/limits";
import { orgSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  createSale,
  createCashSale,
  confirmSale,
  cancelSale,
  addPayment,
} from "./queries";
import { PAYMENT_METHODS } from "./constants";

export type ActionState = { error?: string } | null;

const CURRENCY = z.enum(["CUP", "USD", "BRL"]);

const decimalOpt = z
  .string()
  .regex(/^\d+(?:[.,]\d{1,2})?$/)
  .or(z.literal(""));

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
  // Paridad ERP: borrador / crédito (confirma sin cobrar) / contado (cobra ya)
  mode: z.enum(["draft", "credit", "cash"]).default("draft"),
  discount: decimalOpt.optional(),
  soldAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(""))
    .optional(),
  poNumber: z.string().max(100).optional(),
  note: z.string().max(1000).optional(),
  payments: z
    .array(
      z.object({
        method: z.enum(PAYMENT_METHODS),
        amount: decimalOpt,
      }),
    )
    .optional(),
});

/** ERP: fecha elegida + hora actual (retroactiva permitida, max hoy). */
function soldAtFromInput(dateStr?: string): Date | undefined {
  if (!dateStr) return undefined;
  const now = new Date();
  const hoy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (dateStr === hoy) return undefined; // hoy = comportamiento actual (now)
  const d = new Date(`${dateStr}T12:00:00`);
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
  return d;
}

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
  // el modo llega en el botón de submit (Guardar borrador / Cobrar Ahora /
  // Guardar Crédito) — el submitter viaja en el FormData
  const parsed = saleFormSchema.safeParse({
    ...(payload as object),
    mode: String(form.get("mode") ?? "draft"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const d = parsed.data;
  const db = getDb();
  let sale;
  try {
    // IVA global del ERP (config.impuesto): vive en fiscal_settings de la org
    const [settings] = await db
      .select({ fiscal: orgSettings.fiscalSettings })
      .from(orgSettings)
      .where(eq(orgSettings.orgId, orgId));
    const taxPct = (settings?.fiscal as { salesTaxPct?: string } | null)
      ?.salesTaxPct;

    const input = {
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
      discountCents: d.discount ? parseDecimalToCents(d.discount) : undefined,
      taxPct,
      soldAt: soldAtFromInput(d.soldAt || undefined),
      poNumber: d.poNumber || undefined,
      note: d.note || undefined,
    };

    if (d.mode === "cash" || d.mode === "credit") {
      // ambos confirman → respetar el tope del plan gratuito (F7)
      const allowance = await documentAllowance(db, orgId);
      if (allowance.limited && !allowance.allowed) {
        return { error: FREE_LIMIT_ERROR };
      }
    }
    if (d.mode === "cash") {
      sale = await createCashSale(db, orgId, userId, {
        ...input,
        payments: (d.payments ?? [])
          .filter((p) => p.amount)
          .map((p) => ({
            method: p.method,
            amountCents: parseDecimalToCents(p.amount),
          })),
      });
    } else {
      sale = await createSale(db, orgId, userId, input);
      if (d.mode === "credit" && sale.status === "draft") {
        // ERP: "Guardar Crédito" = venta confirmada con saldo abierto
        sale = await confirmSale(db, orgId, userId, sale.id);
      }
    }
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
    // F7: el modo gratuito (trial vencido) tiene tope mensual de documentos
    const allowance = await documentAllowance(getDb(), orgId);
    if (allowance.limited && !allowance.allowed) {
      return { error: FREE_LIMIT_ERROR };
    }
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
