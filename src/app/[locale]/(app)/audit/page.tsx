import { getTranslations, getFormatter } from "next-intl/server";
import { desc, eq } from "drizzle-orm";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { auditLogs, users } from "@/db/schema";

export default async function AuditPage() {
  const { orgId, role } = await requireOrg();
  const t = await getTranslations("app.audit");
  const format = await getFormatter();
  const isAdmin = role === "owner" || role === "admin";

  const rows = isAdmin
    ? await getDb()
        .select({
          log: auditLogs,
          userEmail: users.email,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .where(eq(auditLogs.orgId, orgId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(100)
    : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {!isAdmin ? (
        <p className="text-sm text-muted-foreground">{t("adminOnly")}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">{t("date")}</th>
                <th className="px-4 py-2 font-medium">{t("user")}</th>
                <th className="px-4 py-2 font-medium">{t("entity")}</th>
                <th className="px-4 py-2 font-medium">{t("action")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(({ log, userEmail }) => (
                <tr key={log.id}>
                  <td className="px-4 py-2 whitespace-nowrap" data-numeric="">
                    {format.dateTime(log.createdAt, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {userEmail ?? "—"}
                  </td>
                  <td className="px-4 py-2">{log.entity}</td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                      {log.action}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
