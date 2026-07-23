"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/session";
import { env } from "@/lib/env";
import { getDb } from "@/db";
import { setSubscription } from "./queries";

/** Solo los emails de SUPERADMIN_EMAILS (coma-separados) operan /admin. */
export async function requireSuperAdmin() {
  const ctx = await requireOrg();
  const allowed = (env.SUPERADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(ctx.user.email.toLowerCase())) {
    throw new Error("Solo super-admins");
  }
  return ctx;
}

const inputSchema = z.object({
  orgId: z.string().uuid(),
  status: z.enum(["trialing", "active", "suspended"]),
});

export async function setSubscriptionAction(form: FormData): Promise<void> {
  const { userId } = await requireSuperAdmin();
  const parsed = inputSchema.parse({
    orgId: form.get("orgId"),
    status: form.get("status"),
  });
  await setSubscription(getDb(), userId, parsed.orgId, {
    status: parsed.status,
  });
  revalidatePath("/[locale]/admin", "page");
}
