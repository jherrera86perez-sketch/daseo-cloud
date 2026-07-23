"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { parseDecimalToCents } from "@/lib/money";
import {
  createDeal,
  moveDeal,
  createStage,
  renameStage,
  deleteStage,
} from "./queries";

export type ActionState = { error?: string } | null;

const dealSchema = z.object({
  customerId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  amount: z
    .string()
    .regex(/^\d+(?:[.,]\d{1,2})?$/)
    .optional()
    .or(z.literal("")),
  currency: z.enum(["CUP", "USD", "BRL"]),
});

export async function createDealAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = dealSchema.safeParse({
    customerId: form.get("customerId"),
    title: form.get("title"),
    amount: form.get("amount"),
    currency: form.get("currency"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  try {
    await createDeal(getDb(), orgId, userId, {
      customerId: parsed.data.customerId,
      title: parsed.data.title,
      amountCents: parsed.data.amount
        ? parseDecimalToCents(parsed.data.amount)
        : 0n,
      currency: parsed.data.currency,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/pipeline", "page");
  return null;
}

export async function createStageAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await createStage(getDb(), orgId, userId, String(form.get("name") ?? ""));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/settings", "page");
  revalidatePath("/[locale]/pipeline", "page");
  return null;
}

export async function renameStageAction(
  stageId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await renameStage(
      getDb(),
      orgId,
      userId,
      stageId,
      String(form.get("name") ?? ""),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/settings", "page");
  revalidatePath("/[locale]/pipeline", "page");
  return null;
}

export async function deleteStageAction(stageId: string): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await deleteStage(getDb(), orgId, userId, stageId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/settings", "page");
  revalidatePath("/[locale]/pipeline", "page");
  return null;
}

export async function moveDealAction(
  dealId: string,
  stageId: string,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await moveDeal(getDb(), orgId, userId, dealId, stageId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/pipeline", "page");
  return null;
}
