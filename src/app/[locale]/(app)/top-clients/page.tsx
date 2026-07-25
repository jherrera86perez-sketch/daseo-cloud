import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { TopClientsView } from "@/features/statements/top-clients-ui";

// Port fiel de la página "Top Clientes" del ERP CubaOne (F8-M3b).
export default async function TopClientsPage() {
  await requireOrg();
  const t = await getTranslations("app.topClients");
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="t-display text-2xl tracking-[-0.025em]">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <TopClientsView />
    </div>
  );
}
