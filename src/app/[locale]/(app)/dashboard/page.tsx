import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";

export default async function DashboardPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.dashboard");
  const [org] = await getDb()
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted-foreground">
        {t("welcome", { org: org?.name ?? "" })}
      </p>
      <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        {t("empty")}
      </p>
    </div>
  );
}
