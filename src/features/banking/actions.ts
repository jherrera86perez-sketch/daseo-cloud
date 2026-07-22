"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { parseBankCsv } from "@/lib/bank-csv";
import {
  createBankAccount,
  importMovements,
  linkMovement,
  ignoreMovement,
} from "./queries";

export type ActionState = { error?: string; ok?: string } | null;

export async function createBankAccountAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(200),
      currency: z.enum(["CUP", "USD", "BRL"]),
      bank: z.string().trim().max(100).optional(),
      accountNumber: z.string().trim().max(50).optional(),
    })
    .safeParse({
      name: form.get("name"),
      currency: form.get("currency"),
      bank: String(form.get("bank") ?? "") || undefined,
      accountNumber: String(form.get("accountNumber") ?? "") || undefined,
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const acc = await createBankAccount(getDb(), orgId, userId, parsed.data);
  revalidatePath("/[locale]/banking", "page");
  redirect({ href: `/banking/${acc.id}`, locale: await getLocale() });
  return null;
}

export async function importCsvAction(
  accountId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const csv = String(form.get("csv") ?? "");
  const rows = parseBankCsv(csv);
  if (rows.length === 0) {
    return {
      error:
        "El CSV no tiene filas válidas (cabecera: fecha,descripcion,monto[,referencia])",
    };
  }
  try {
    const res = await importMovements(getDb(), orgId, userId, accountId, rows);
    revalidatePath(`/[locale]/banking/${accountId}`, "page");
    return {
      ok: `${res.inserted} importados · ${res.duplicates} duplicados omitidos`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
}

export async function linkMovementAction(
  movementId: string,
  kind: string,
  paymentId: string,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await linkMovement(
      getDb(),
      orgId,
      userId,
      movementId,
      kind === "supplier_payment"
        ? { supplierPaymentId: paymentId }
        : { paymentId },
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/banking/[id]", "page");
  return null;
}

export async function ignoreMovementAction(
  movementId: string,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await ignoreMovement(getDb(), orgId, userId, movementId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/banking/[id]", "page");
  return null;
}
