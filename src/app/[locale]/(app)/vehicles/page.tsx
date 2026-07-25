import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/layout/page-header";
import { PageLayout } from "@/components/ui/layout/page-layout";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listVehicles } from "@/features/vehicles/queries";
import { VehicleForm, VehiclesTable } from "@/features/vehicles/vehicles-ui";

export default async function VehiclesPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.vehicles");
  const vehicles = await listVehicles(getDb(), orgId);

  return (
    <PageLayout header={<PageHeader title={t("title")} subtitle={t("hint")} />}>
      <div className="flex flex-col gap-4">
        <VehicleForm />
        <VehiclesTable vehicles={vehicles} />
      </div>
    </PageLayout>
  );
}
