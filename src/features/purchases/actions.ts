"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { parseDecimalToCents } from "@/lib/money";
import { documentAllowance, FREE_LIMIT_ERROR } from "@/features/admin/limits";
import {
  createSupplier,
  updateSupplier,
  softDeleteSupplier,
  createPurchase,
  confirmPurchase,
  cancelPurchase,
  addSupplierPayment,
  marcarSinDeuda,
} from "./queries";

export type ActionState = { error?: string } | null;

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  taxId: z.string().trim().max(50).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(500).optional(),
  bankAccount: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
});

function supplierFromForm(form: FormData) {
  const out: Record<string, string> = {};
  for (const k of [
    "name",
    "taxId",
    "email",
    "phone",
    "address",
    "bankAccount",
    "notes",
  ]) {
    const v = form.get(k);
    if (typeof v === "string" && v !== "") out[k] = v;
  }
  return out;
}

export async function createSupplierAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = supplierSchema.safeParse(supplierFromForm(form));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  await createSupplier(getDb(), orgId, userId, parsed.data);
  revalidatePath("/[locale]/suppliers", "page");
  redirect({ href: "/suppliers", locale: await getLocale() });
  return null;
}

export async function updateSupplierAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = supplierSchema.safeParse(supplierFromForm(form));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  await updateSupplier(getDb(), orgId, userId, id, parsed.data);
  revalidatePath("/[locale]/suppliers", "page");
  redirect({ href: "/suppliers", locale: await getLocale() });
  return null;
}

export async function deleteSupplierAction(id: string): Promise<void> {
  const { orgId, userId } = await requireOrg();
  await softDeleteSupplier(getDb(), orgId, userId, id);
  revalidatePath("/[locale]/suppliers", "page");
  redirect({ href: "/suppliers", locale: await getLocale() });
}

const purchaseFormSchema = z.object({
  supplierId: z.string().uuid(),
  currency: z.enum(["CUP", "USD", "BRL"]),
  rateToBase: z.string().regex(/^\d+(?:[.,]\d{1,6})?$/),
  idempotencyKey: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid().optional(),
        description: z.string().min(1),
        qty: z.string().regex(/^\d+(?:[.,]\d{1,3})?$/),
        unitCost: z.string().regex(/^\d+(?:[.,]\d{1,2})?$/),
        lotCode: z.string().trim().max(50).optional(),
        expiryDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .or(z.literal("")),
      }),
    )
    .min(1),
  // Paridad ERP: gastos, Contado/Crédito, factura del proveedor, fecha, notas
  mode: z.enum(["draft", "cash", "credit"]).default("draft"),
  transport: z
    .string()
    .regex(/^\d+(?:[.,]\d{1,2})?$/)
    .or(z.literal(""))
    .optional(),
  allowance: z
    .string()
    .regex(/^\d+(?:[.,]\d{1,2})?$/)
    .or(z.literal(""))
    .optional(),
  otherCosts: z
    .string()
    .regex(/^\d+(?:[.,]\d{1,2})?$/)
    .or(z.literal(""))
    .optional(),
  paymentTerms: z
    .enum(["Contado", "15 días", "30 días", "60 días", "90 días"])
    .optional(),
  supplierInvoice: z.string().max(100).optional(),
  note: z.string().max(1000).optional(),
  receivedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(""))
    .optional(),
});

const TERM_DAYS: Record<string, number> = {
  "15 días": 15,
  "30 días": 30,
  "60 días": 60,
  "90 días": 90,
};

/** ERP: fecha elegida + hora actual (retroactiva permitida). */
function receivedAtFromInput(dateStr?: string): Date | undefined {
  if (!dateStr) return undefined;
  const now = new Date();
  const hoy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (dateStr === hoy) return undefined;
  const d = new Date(`${dateStr}T12:00:00`);
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
  return d;
}

export async function createPurchaseAction(
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
  const parsed = purchaseFormSchema.safeParse({
    ...(payload as object),
    mode: String(form.get("mode") ?? "draft"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const d = parsed.data;
  const db = getDb();
  let purchase;
  try {
    const receivedAt = receivedAtFromInput(d.receivedAt || undefined);
    // Crédito: el vencimiento se autocalcula desde las condiciones (ERP)
    const baseFecha = receivedAt ?? new Date();
    const dueDate =
      d.paymentTerms && TERM_DAYS[d.paymentTerms]
        ? new Date(
            baseFecha.getTime() + TERM_DAYS[d.paymentTerms] * 24 * 3600 * 1000,
          )
        : undefined;

    purchase = await createPurchase(db, orgId, userId, {
      supplierId: d.supplierId,
      currency: d.currency,
      rateToBase: d.rateToBase,
      idempotencyKey: d.idempotencyKey,
      items: d.items.map((i) => ({
        productId: i.productId,
        description: i.description,
        qty: i.qty,
        unitCostCents: parseDecimalToCents(i.unitCost),
        lotCode: i.lotCode || undefined,
        expiryDate: i.expiryDate || undefined,
      })),
      transportCents: d.transport
        ? parseDecimalToCents(d.transport)
        : undefined,
      allowanceCents: d.allowance
        ? parseDecimalToCents(d.allowance)
        : undefined,
      otherCostsCents: d.otherCosts
        ? parseDecimalToCents(d.otherCosts)
        : undefined,
      paymentTerms: d.mode === "cash" ? "Contado" : d.paymentTerms,
      supplierInvoice: d.supplierInvoice || undefined,
      note: d.note || undefined,
      receivedAt,
      dueDate,
    });

    // ERP: "Confirmar Compra" recibe la mercancía al instante (contado o
    // crédito); solo "Guardar borrador" queda en draft
    if (d.mode !== "draft" && purchase.status === "draft") {
      const allowance = await documentAllowance(db, orgId);
      if (allowance.limited && !allowance.allowed) {
        return { error: FREE_LIMIT_ERROR };
      }
      purchase = await confirmPurchase(db, orgId, userId, purchase.id);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/purchases", "page");
  redirect({ href: `/purchases/${purchase.id}`, locale: await getLocale() });
  return null;
}

export async function marcarSinDeudaAction(id: string): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await marcarSinDeuda(getDb(), orgId, userId, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/payables", "page");
  return null;
}

export async function confirmPurchaseAction(id: string): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    // F7: el modo gratuito (trial vencido) tiene tope mensual de documentos
    const allowance = await documentAllowance(getDb(), orgId);
    if (allowance.limited && !allowance.allowed) {
      return { error: FREE_LIMIT_ERROR };
    }
    await confirmPurchase(getDb(), orgId, userId, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath(`/[locale]/purchases/${id}`, "page");
  return null;
}

export async function cancelPurchaseAction(id: string): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await cancelPurchase(getDb(), orgId, userId, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath(`/[locale]/purchases/${id}`, "page");
  return null;
}

export async function addSupplierPaymentAction(
  purchaseId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    const amountCents = parseDecimalToCents(String(form.get("amount")));
    const appliedCents = parseDecimalToCents(String(form.get("applied")));
    const currency = z.enum(["CUP", "USD", "BRL"]).parse(form.get("currency"));
    await addSupplierPayment(getDb(), orgId, userId, purchaseId, {
      amountCents,
      currency,
      rateFixed: String(form.get("rate") || "1"),
      appliedCents,
      method: String(form.get("method") || "cash"),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath(`/[locale]/purchases/${purchaseId}`, "page");
  return null;
}
