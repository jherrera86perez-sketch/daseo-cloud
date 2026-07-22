"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { orgSettings } from "@/db/schema";
import { logAudit } from "@/lib/audit";

const currencySchema = z.enum(["CUP", "USD", "BRL"]);

/** Fija la moneda base de la org activa (solo en onboarding: inmutable después). */
export async function setBaseCurrency(input: string): Promise<void> {
  const { orgId, userId } = await requireOrg();
  const currency = currencySchema.parse(input);
  const db = getDb();
  await db
    .update(orgSettings)
    .set({ baseCurrency: currency, updatedAt: new Date() })
    .where(eq(orgSettings.orgId, orgId));
  await logAudit(db, {
    orgId,
    userId,
    entity: "org_settings",
    entityId: orgId,
    action: "update",
    after: { baseCurrency: currency },
  });
}
