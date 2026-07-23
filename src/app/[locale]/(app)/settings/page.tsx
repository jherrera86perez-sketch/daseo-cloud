import { getTranslations } from "next-intl/server";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { members, users, invitations, orgSettings } from "@/db/schema";
import { InviteForm } from "@/features/auth/invite-form";
import { RateForm } from "@/features/rates/rate-form";
import { listRates } from "@/features/rates/queries";
import { listApiKeys } from "@/features/platform/queries";
import { listStagesWithDeals } from "@/features/pipeline/queries";
import { StagesEditor } from "@/features/pipeline/stages-ui";
import { ApiKeysCard, TelegramCard } from "@/features/platform/platform-ui";
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

  const rates = await listRates(db, orgId);
  const tr = await getTranslations("app.rates");
  const isAdmin = role === "owner" || role === "admin";
  const apiKeysRows = isAdmin ? await listApiKeys(db, orgId) : [];
  const tk = await getTranslations("app.apiKeys");
  const tg = await getTranslations("app.telegram");
  const ts = await getTranslations("app.stages");
  const board = isAdmin ? await listStagesWithDeals(db, orgId) : [];
  const notify = (settings?.notifySettings ?? {}) as {
    telegramBotToken?: string;
    telegramChatId?: string;
  };

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

      <Card>
        <CardHeader>
          <CardTitle>
            {tr("title")} ({t("baseCurrency")}: {settings?.baseCurrency})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isAdmin && <RateForm />}
          {rates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr("empty")}</p>
          ) : (
            <ul className="divide-y text-sm">
              {rates.slice(0, 10).map((r) => (
                <li key={r.id} className="flex justify-between py-2">
                  <span data-numeric="">
                    1 {r.currency} = {r.rateToBase} {settings?.baseCurrency}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.effectiveAt.toISOString().slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>{tk("title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ApiKeysCard
              keys={apiKeysRows.map((k) => ({
                id: k.id,
                name: k.name,
                prefix: k.prefix,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>{ts("title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <StagesEditor
              stages={board.map((b) => ({
                id: b.stage.id,
                name: b.stage.name,
                isWon: b.stage.isWon,
                isLost: b.stage.isLost,
                dealCount: b.deals.length,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>{tg("title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <TelegramCard
              initial={{
                botToken: notify.telegramBotToken ?? "",
                chatId: notify.telegramChatId ?? "",
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
