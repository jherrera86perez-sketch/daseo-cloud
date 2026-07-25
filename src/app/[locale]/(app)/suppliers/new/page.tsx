import { getTranslations } from "next-intl/server";
import { SupplierForm } from "@/features/purchases/supplier-form";
import { createSupplierAction } from "@/features/purchases/actions";

export default async function NewSupplierPage() {
  const t = await getTranslations("app.suppliers");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="t-display text-2xl tracking-[-0.025em]">{t("new")}</h1>
      <SupplierForm action={createSupplierAction} />
    </div>
  );
}
