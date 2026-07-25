import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/layout/page-header";
import { PageLayout } from "@/components/ui/layout/page-layout";
import { requireOrg } from "@/lib/session";
import { ControlCajaView } from "@/features/consolidado/conciliacion-ui";

// Port fiel de "Control de Caja" (Conciliación) del ERP CubaOne.
export default async function ReconciliationPage() {
  await requireOrg();
  const t = await getTranslations("app.reconciliation");
  return (
    <PageLayout
      header={<PageHeader title={t("title")} subtitle={t("subtitle")} />}
    >
      <ControlCajaView />
    </PageLayout>
  );
}
