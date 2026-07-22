import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getAuth } from "./auth";
import { getDb } from "@/db";
import { members } from "@/db/schema";

/**
 * Regla "BD manda": el JWT/cookie solo identifica; el rol y la membresía se
 * verifican contra la tabla member en CADA request (cacheado por request con
 * React.cache). Expulsiones y cambios de rol surten efecto inmediato.
 */
export const requireOrg = cache(async () => {
  const session = await getAuth().api.getSession({
    headers: await headers(),
  });
  if (!session) {
    redirect("/login");
  }
  const orgId = session.session.activeOrganizationId;
  if (!orgId) {
    redirect("/onboarding");
  }
  const db = getDb();
  const [membership] = await db
    .select()
    .from(members)
    .where(
      and(
        eq(members.userId, session.user.id),
        eq(members.organizationId, orgId),
      ),
    );
  if (!membership) {
    redirect("/login");
  }
  return {
    orgId,
    userId: session.user.id,
    role: membership.role,
    user: session.user,
  };
});
