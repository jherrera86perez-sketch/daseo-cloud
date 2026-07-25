import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/layout/page-header";
import { PageLayout } from "@/components/ui/layout/page-layout";
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
import type { NotifySettings } from "@/features/platform/notify";
import { centsToDecimalString } from "@/lib/money";
import { AssistantCard } from "@/features/assistant/assistant-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { EmployeesSection } from "@/features/people/employees-section";
import { AuditSection } from "@/features/audit/audit-section";

/*
 * Configuracion como MODULO, igual que el ERP: una sub-nav con cinco secciones
 * (Empresa, Empleados, Usuarios, Auditoria, Sistema) en vez de una lista larga
 * de tarjetas. Empleados y Auditoria dejan de ser items del menu lateral y
 * pasan aqui dentro, que es donde el ERP los tiene.
 *
 * La seccion viaja por searchParams: sin estado de cliente, todo server.
 */
const SECCIONES = [
  "empresa",
  "empleados",
  "usuarios",
  "auditoria",
  "sistema",
] as const;
type Seccion = (typeof SECCIONES)[number];

export default async function SettingsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ seccion?: string }> }>) {
  const { orgId, role } = await requireOrg();
  const sp = await searchParams;
  const seccion: Seccion = (SECCIONES as readonly string[]).includes(
    sp.seccion ?? "",
  )
    ? (sp.seccion as Seccion)
    : "empresa";
  const t = await getTranslations("app.members");
  const tc = await getTranslations("app.settings");
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
  const notify = (settings?.notifySettings ?? {}) as NotifySettings;
  const ta = await getTranslations("app.assistant");

  return (
    <PageLayout
      header={<PageHeader title={tc("title")} subtitle={tc("subtitle")} />}
    >
      <div className="grid gap-5 lg:grid-cols-[236px_minmax(0,1fr)]">
        {/* Sub-nav de secciones ≈ Configuracion.tsx del ERP */}
        <nav className="flex flex-col gap-1">
          <p className="t-label mb-1 px-3">{tc("sections")}</p>
          {SECCIONES.map((id) => {
            const activa = seccion === id;
            return (
              <Link
                key={id}
                href={
                  id === "empresa" ? "/settings" : `/settings?seccion=${id}`
                }
                aria-current={activa ? "page" : undefined}
                className={cn(
                  "relative rounded-[6px] px-3 py-2.5 transition-colors",
                  activa
                    ? "bg-surface-100 text-foreground"
                    : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                )}
              >
                {activa ? (
                  <span
                    aria-hidden
                    className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-accent"
                  />
                ) : null}
                <span className="block text-sm font-medium">
                  {tc(`s_${id}`)}
                </span>
                <span className="t-label block normal-case">
                  {tc(`d_${id}`)}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex min-w-0 max-w-2xl flex-col gap-6">
          {/* ── Empresa: moneda base y tasas de cambio ── */}
          {seccion === "empresa" ? (
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
                  <ul className="divide-y divide-surface-100 text-sm">
                    {rates.slice(0, 10).map((r) => (
                      <li key={r.id} className="flex justify-between py-2">
                        <span data-numeric="">
                          1 {r.currency} = {r.rateToBase}{" "}
                          {settings?.baseCurrency}
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
          ) : null}

          {/* ── Empleados ── */}
          {seccion === "empleados" ? <EmployeesSection /> : null}

          {/* ── Usuarios: miembros, invitaciones y llaves de API ── */}
          {seccion === "usuarios" ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t("membersTitle")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col divide-y divide-surface-100">
                    {memberRows.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between py-2"
                      >
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
            </>
          ) : null}

          {/* ── Auditoría ── */}
          {seccion === "auditoria" ? <AuditSection /> : null}

          {/* ── Sistema: etapas, asistente y notificaciones ── */}
          {seccion === "sistema" && isAdmin ? (
            <>
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

              <Card>
                <CardHeader>
                  <CardTitle>{ta("title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <AssistantCard
                    baseCurrency={settings?.baseCurrency ?? "CUP"}
                    initial={{
                      salesGoal: notify.salesGoalBase ?? "",
                      overdueLimit: notify.overdueLimitBase ?? "",
                    }}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{tg("title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <TelegramCard
                    initial={{
                      botToken: notify.telegramBotToken ?? "",
                      chatId: notify.telegramChatId ?? "",
                      cobranzaDiasMin: notify.cobranzaDiasMin?.toString() ?? "",
                      cobranzaMontoMin: notify.cobranzaMontoMinCents
                        ? centsToDecimalString(
                            BigInt(notify.cobranzaMontoMinCents),
                          )
                        : "",
                    }}
                  />
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </PageLayout>
  );
}
