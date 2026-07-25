import { getTranslations, getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { listOrgsWithSubscriptions } from "@/features/admin/queries";
import {
  requireSuperAdmin,
  setSubscriptionAction,
} from "@/features/admin/actions";
import { Button } from "@/components/ui/button";

// Panel de plataforma (cobro manual CU): activar/suspender organizaciones.
// Ruta sin entrada en el nav para no-superadmins; el guard es el que manda.
export default async function AdminPage() {
  try {
    await requireSuperAdmin();
  } catch {
    redirect("/dashboard");
  }
  const t = await getTranslations("app.admin");
  const locale = await getLocale();
  const rows = await listOrgsWithSubscriptions(getDb());
  const fmtDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  const badge = (status: string | null) =>
    status === "active"
      ? "bg-success/15 text-success"
      : status === "suspended"
        ? "bg-destructive/15 text-destructive"
        : "bg-secondary text-secondary-foreground";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="t-display text-2xl tracking-[-0.025em]">{t("title")}</h1>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-surface-100 text-left">
            <tr>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {t("org")}
              </th>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {t("members")}
              </th>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {t("plan")}
              </th>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {t("status")}
              </th>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {t("trialEnds")}
              </th>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {t("actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((o) => (
              <tr key={o.id} className="hover:bg-accent">
                <td className="px-4 py-2">
                  <span className="font-medium">{o.name}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    ({o.slug})
                  </span>
                </td>
                <td className="px-4 py-2" data-numeric="">
                  {o.memberCount}
                </td>
                <td className="px-4 py-2">{o.plan ?? "—"}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${badge(o.status)}`}
                  >
                    {o.status ? t(`statuses.${o.status}`) : t("statuses.none")}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {o.trialEndsAt ? fmtDate.format(o.trialEndsAt) : "—"}
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    {o.status !== "active" && (
                      <form action={setSubscriptionAction}>
                        <input type="hidden" name="orgId" value={o.id} />
                        <input type="hidden" name="status" value="active" />
                        <Button size="sm" variant="outline" type="submit">
                          {t("activate")}
                        </Button>
                      </form>
                    )}
                    {o.status !== "suspended" && (
                      <form action={setSubscriptionAction}>
                        <input type="hidden" name="orgId" value={o.id} />
                        <input type="hidden" name="status" value="suspended" />
                        <Button size="sm" variant="outline" type="submit">
                          {t("suspend")}
                        </Button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
