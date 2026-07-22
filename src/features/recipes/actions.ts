"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { createRecipe, updateRecipe, softDeleteRecipe } from "./queries";

export type ActionState = { error?: string } | null;

const recipeFormSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  outputQty: z.string().regex(/^\d+(?:[.,]\d{1,3})?$/),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.string().regex(/^\d+(?:[.,]\d{1,3})?$/),
      }),
    )
    .min(1),
});

function parsePayload(form: FormData) {
  const payload = JSON.parse(String(form.get("payload")));
  return recipeFormSchema.safeParse(payload);
}

export async function createRecipeAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  let parsed;
  try {
    parsed = parsePayload(form);
  } catch {
    return { error: "payload inválido" };
  }
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  let recipe;
  try {
    recipe = await createRecipe(getDb(), orgId, userId, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/recipes", "page");
  redirect({ href: `/recipes/${recipe.id}`, locale: await getLocale() });
  return null;
}

export async function updateRecipeAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  let parsed;
  try {
    parsed = parsePayload(form);
  } catch {
    return { error: "payload inválido" };
  }
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  try {
    await updateRecipe(getDb(), orgId, userId, id, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath(`/[locale]/recipes/${id}`, "page");
  redirect({ href: `/recipes/${id}`, locale: await getLocale() });
  return null;
}

export async function deleteRecipeAction(id: string): Promise<void> {
  const { orgId, userId } = await requireOrg();
  await softDeleteRecipe(getDb(), orgId, userId, id);
  revalidatePath("/[locale]/recipes", "page");
  redirect({ href: "/recipes", locale: await getLocale() });
}
