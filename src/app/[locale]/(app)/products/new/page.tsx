import { getTranslations } from "next-intl/server";
import { ProductForm } from "@/features/inventory/product-form";
import { createProductAction } from "@/features/inventory/actions";

export default async function NewProductPage() {
  const t = await getTranslations("app.products");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("new")}</h1>
      <ProductForm action={createProductAction} />
    </div>
  );
}
