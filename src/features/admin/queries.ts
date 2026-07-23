import { eq, sql } from "drizzle-orm";
import { organizations, subscriptions } from "@/db/schema";
import { logAudit } from "@/lib/audit";

// Cualquier instancia drizzle (Neon en prod, PGlite en tests)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export type SubscriptionRow = typeof subscriptions.$inferSelect;

const TRIAL_DAYS = 14;

/**
 * Suscripción de la org, aprovisionando el trial por defecto si no existe
 * (las orgs anteriores a F7 no tienen fila). El cobro CU es manual: un
 * super-admin la pasa a active/suspended desde /admin.
 */
export async function getSubscription(
  db: Db,
  orgId: string,
): Promise<SubscriptionRow> {
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.orgId, orgId));
  if (existing) return existing;
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 3600 * 1000);
  const [row] = await db
    .insert(subscriptions)
    .values({ orgId, trialEndsAt })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  // Carrera: otro request la creó entre el select y el insert.
  const [again] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.orgId, orgId));
  return again;
}

export type AdminOrgRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  memberCount: number;
  plan: string | null;
  status: string | null;
  trialEndsAt: Date | null;
};

/** Vista del panel /admin: todas las orgs con su suscripción y nº de miembros. */
export async function listOrgsWithSubscriptions(
  db: Db,
): Promise<AdminOrgRow[]> {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      createdAt: organizations.createdAt,
      memberCount:
        sql<number>`(select count(*) from member m where m.organization_id = ${organizations.id})`.mapWith(
          Number,
        ),
      plan: subscriptions.plan,
      status: subscriptions.status,
      trialEndsAt: subscriptions.trialEndsAt,
    })
    .from(organizations)
    .leftJoin(subscriptions, eq(subscriptions.orgId, organizations.id))
    .orderBy(organizations.createdAt);
  return rows;
}

/**
 * Activación/suspensión manual (super-admin). Upsert: aprovisiona la fila
 * si la org aún no tenía suscripción. `activatedAt` se fija la primera vez
 * que pasa a active.
 */
export async function setSubscription(
  db: Db,
  actorUserId: UserId,
  orgId: string,
  input: {
    status: "trialing" | "active" | "suspended";
    plan?: "trial" | "pro";
    notes?: string;
  },
): Promise<SubscriptionRow> {
  const current = await getSubscription(db, orgId);
  const activatedAt =
    input.status === "active"
      ? (current.activatedAt ?? new Date())
      : current.activatedAt;
  const [row] = await db
    .update(subscriptions)
    .set({
      status: input.status,
      plan: input.plan ?? (input.status === "active" ? "pro" : current.plan),
      notes: input.notes ?? current.notes,
      activatedAt,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.orgId, orgId))
    .returning();
  await logAudit(db, {
    orgId,
    userId: actorUserId,
    entity: "subscription",
    entityId: orgId,
    action: "update",
    after: { status: input.status },
  });
  return row;
}
