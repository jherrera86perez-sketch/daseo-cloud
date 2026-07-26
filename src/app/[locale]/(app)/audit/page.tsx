import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/layout/page-header";
import { PageLayout } from "@/components/ui/layout/page-layout";
import { AuditSection } from "@/features/audit/audit-section";

export default async function AuditPage() {
  const t = await getTranslations("app.audit");
  return (
    <PageLayout header={<PageHeader title={t("title")} />}>
      <AuditSection />
    </PageLayout>
  );
}
