"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { orgSettings } from "@/db/schema";
import { logAudit } from "@/lib/audit";

export type ActionState = { error?: string; ok?: string } | null;

const decimal = z
  .string()
  .trim()
  .regex(/^\d+(?:[.,]\d{1,2})?$/)
  .or(z.literal(""));

/** Guarda los umbrales del asistente fusionando con notify_settings. */
export async function saveAssistantAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId, role } = await requireOrg();
  if (role !== "owner" && role !== "admin") {
    return { error: "Solo administradores" };
  }
  const parsed = z
    .object({ salesGoal: decimal, overdueLimit: decimal })
    .safeParse({
      salesGoal: form.get("salesGoal"),
      overdueLimit: form.get("overdueLimit"),
    });
  if (!parsed.success) return { error: "Datos inválidos" };
  const db = getDb();
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
        salesGoalBase: parsed.data.salesGoal || undefined,
        overdueLimitBase: parsed.data.overdueLimit || undefined,
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
    after: {
      salesGoal: parsed.data.salesGoal,
      overdueLimit: parsed.data.overdueLimit,
    },
  });
  revalidatePath("/[locale]/settings", "page");
  revalidatePath("/[locale]/dashboard", "page");
  return { ok: "guardado" };
}
