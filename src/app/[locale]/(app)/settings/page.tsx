import { getTranslations } from "next-intl/server";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { members, users, invitations, orgSettings } from "@/db/schema";
import { InviteForm } from "@/features/auth/invite-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const { orgId, role } = await requireOrg();
  const t = await getTranslations("app.members");
  const db = getDb();

  const memberRows = await db
    .select({
      id: members.id,
      role: members.role,
      name: users.name,
      email: users.email,
    })
    .from(members)
    .innerJoin(users, eq(members.userId, users.id))
    .where(eq(members.organizationId, orgId));

  const pending = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, orgId),
        eq(invitations.status, "pending"),
        or(
          isNull(invitations.expiresAt),
          gt(invitations.expiresAt, new Date()),
        ),
      ),
    );

  const [settings] = await db
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.orgId, orgId));

  const isAdmin = role === "owner" || role === "admin";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("membersTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y">
            {memberRows.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-medium">{m.name}</span>{" "}
                  <span className="text-sm text-muted-foreground">
                    {m.email}
                  </span>
                </span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>{t("inviteTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <InviteForm />
            {pending.length > 0 && (
              <div className="text-sm text-muted-foreground">
                {t("pendingCount", { count: pending.length })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">
        {t("baseCurrency")}: <strong>{settings?.baseCurrency}</strong>
      </p>
    </div>
  );
}
