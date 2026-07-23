"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { orgSettings } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { createApiKey, revokeApiKey } from "./queries";
import { buildCollectionsSummary, sendTelegramMessage } from "./notify";

export type ActionState = {
  error?: string;
  plainKey?: string;
  ok?: string;
} | null;

export async function createApiKeyAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId, role } = await requireOrg();
  if (role !== "owner" && role !== "admin") {
    return { error: "Solo administradores" };
  }
  const name = z.string().trim().min(1).max(100).safeParse(form.get("name"));
  if (!name.success) return { error: "Nombre inválido" };
  const { plainKey } = await createApiKey(getDb(), orgId, userId, name.data);
  revalidatePath("/[locale]/settings", "page");
  return { plainKey };
}

export async function revokeApiKeyAction(id: string): Promise<ActionState> {
  const { orgId, userId, role } = await requireOrg();
  if (role !== "owner" && role !== "admin") {
    return { error: "Solo administradores" };
  }
  try {
    await revokeApiKey(getDb(), orgId, userId, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/settings", "page");
  return null;
}

export async function saveTelegramAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId, role } = await requireOrg();
  if (role !== "owner" && role !== "admin") {
    return { error: "Solo administradores" };
  }
  const parsed = z
    .object({
      botToken: z.string().trim().max(100),
      chatId: z.string().trim().max(50),
    })
    .safeParse({ botToken: form.get("botToken"), chatId: form.get("chatId") });
  if (!parsed.success) return { error: "Datos inválidos" };
  const db = getDb();
  // Merge: notify_settings también guarda los umbrales del asistente (F5).
  const [row] = await db
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.orgId, orgId));
  const current = (row?.notifySettings ?? {}) as Record<string, unknown>;
  await db
    .update(orgSettings)
    .set({
      notifySettings: {
        ...current,
        telegramBotToken: parsed.data.botToken || undefined,
        telegramChatId: parsed.data.chatId || undefined,
      },
      updatedAt: new Date(),
    })
    .where(eq(orgSettings.orgId, orgId));
  await logAudit(db, {
    orgId,
    userId,
    entity: "notify_settings",
    entityId: orgId,
    action: "update",
    after: { telegram: Boolean(parsed.data.botToken) },
  });
  revalidatePath("/[locale]/settings", "page");
  return { ok: "guardado" };
}

export async function sendSummaryNowAction(): Promise<ActionState> {
  const { orgId, role } = await requireOrg();
  if (role !== "owner" && role !== "admin") {
    return { error: "Solo administradores" };
  }
  const db = getDb();
  const [row] = await db
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.orgId, orgId));
  const notify = row?.notifySettings as {
    telegramBotToken?: string;
    telegramChatId?: string;
  } | null;
  if (!notify?.telegramBotToken || !notify?.telegramChatId) {
    return { error: "Configura el bot y el chat primero" };
  }
  const text = await buildCollectionsSummary(db, orgId);
  const ok = await sendTelegramMessage(
    notify.telegramBotToken,
    notify.telegramChatId,
    text,
  );
  return ok ? { ok: "enviado" } : { error: "Telegram rechazó el envío" };
}
