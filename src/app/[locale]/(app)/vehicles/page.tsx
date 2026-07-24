import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listVehicles } from "@/features/vehicles/queries";
import { VehicleForm, VehiclesTable } from "@/features/vehicles/vehicles-ui";

export default async function VehiclesPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.vehicles");
  const vehicles = await listVehicles(getDb(), orgId);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <VehicleForm />
      <VehiclesTable vehicles={vehicles} />
    </div>
  );
}
