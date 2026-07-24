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

// ─── Seguimiento de recomendaciones (asistente_seguimiento del ERP) ───

const followupSchema = z.object({
  recommendationId: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  category: z.string().trim().max(50).optional(),
  status: z
    .enum(["PENDIENTE", "EN_PROGRESO", "COMPLETADA", "DESCARTADA"])
    .optional(),
  notes: z.string().max(2000).optional(),
});

export async function saveFollowupAction(input: {
  recommendationId: string;
  title: string;
  category?: string;
  status?: string;
  notes?: string;
}): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = followupSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos" };
  try {
    const { upsertFollowup } = await import("./followups");
    await upsertFollowup(getDb(), orgId, userId, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/assistant", "page");
  return { ok: "Seguimiento actualizado" };
}
