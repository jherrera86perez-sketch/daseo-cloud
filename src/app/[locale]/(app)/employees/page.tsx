import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/layout/page-header";
import { PageLayout } from "@/components/ui/layout/page-layout";
import { EmployeesSection } from "@/features/people/employees-section";

export default async function EmployeesPage() {
  const t = await getTranslations("app.employees");
  return (
    <PageLayout header={<PageHeader title={t("title")} />}>
      <EmployeesSection />
    </PageLayout>
  );
}
