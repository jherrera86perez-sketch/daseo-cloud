import { getTranslations } from "next-intl/server";
import { eq, and } from "drizzle-orm";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { suppliers } from "@/db/schema";
import { assertOwnedByOrg, notDeleted } from "@/lib/tenant";
import { SupplierForm } from "@/features/purchases/supplier-form";
import { updateSupplierAction } from "@/features/purchases/actions";

export default async function EditSupplierPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { orgId } = await requireOrg();
  const { id } = await params;
  const t = await getTranslations("app.suppliers");
  const [row] = await getDb()
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), notDeleted(suppliers)));
  const supplier = assertOwnedByOrg(row, orgId);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("edit")}</h1>
      <SupplierForm
        action={updateSupplierAction.bind(null, id)}
        initial={supplier}
      />
    </div>
  );
}
