import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { ControlCajaView } from "@/features/consolidado/conciliacion-ui";

// Port fiel de "Control de Caja" (Conciliación) del ERP CubaOne.
export default async function ReconciliationPage() {
  await requireOrg();
  const t = await getTranslations("app.reconciliation");
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <ControlCajaView />
    </div>
  );
}
