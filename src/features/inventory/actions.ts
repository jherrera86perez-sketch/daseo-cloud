"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { parseDecimalToCents } from "@/lib/money";
import { productInputSchema, movementInputSchema } from "./schemas";
import {
  createProduct,
  updateProduct,
  softDeleteProduct,
  registerMovement,
  InsufficientStockError,
} from "./queries";

export type ActionState = { error?: string } | null;

function productFromForm(form: FormData) {
  return {
    name: String(form.get("name") ?? ""),
    sku: String(form.get("sku") ?? "") || undefined,
    description: String(form.get("description") ?? "") || undefined,
    unit: String(form.get("unit") ?? "unit"),
    isSellable: form.get("isSellable") === "on",
    isComponent: form.get("isComponent") === "on",
    isProducible: form.get("isProducible") === "on",
    stockMin: String(form.get("stockMin") ?? "") || undefined,
  };
}

export async function createProductAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = productInputSchema.safeParse(productFromForm(form));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const row = await createProduct(getDb(), orgId, userId, parsed.data);
  revalidatePath("/[locale]/products", "page");
  redirect({ href: `/products/${row.id}`, locale: await getLocale() });
  return null;
}

export async function updateProductAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = productInputSchema.safeParse(productFromForm(form));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  await updateProduct(getDb(), orgId, userId, id, parsed.data);
  revalidatePath(`/[locale]/products/${id}`, "page");
  redirect({ href: `/products/${id}`, locale: await getLocale() });
  return null;
}

export async function deleteProductAction(id: string): Promise<void> {
  const { orgId, userId } = await requireOrg();
  await softDeleteProduct(getDb(), orgId, userId, id);
  revalidatePath("/[locale]/products", "page");
  redirect({ href: "/products", locale: await getLocale() });
}

export async function registerMovementAction(
  productId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const kind = String(form.get("kind"));
  const costRaw = String(form.get("unitCost") ?? "");
  let unitCostCents: bigint | undefined;
  if (costRaw) {
    try {
      unitCostCents = parseDecimalToCents(costRaw);
    } catch {
      return { error: `Costo inválido: ${costRaw}` };
    }
  }
  const parsed = movementInputSchema.safeParse({
    productId,
    kind,
    qty: String(form.get("qty") ?? ""),
    unitCostCents,
    note: String(form.get("note") ?? "") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  try {
    await registerMovement(getDb(), orgId, userId, parsed.data);
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      return { error: e.message };
    }
    if (e instanceof Error && /costo unitario/.test(e.message)) {
      return { error: e.message };
    }
    throw e;
  }
  revalidatePath(`/[locale]/products/${productId}`, "page");
  return null;
}
