import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { getOwnedProduct } from "@/features/inventory/queries";
import { ProductForm } from "@/features/inventory/product-form";
import { updateProductAction } from "@/features/inventory/actions";

export default async function EditProductPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { orgId } = await requireOrg();
  const { id } = await params;
  const t = await getTranslations("app.products");
  const product = await getOwnedProduct(getDb(), orgId, id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("edit")}</h1>
      <ProductForm
        action={updateProductAction.bind(null, id)}
        initial={product}
      />
    </div>
  );
}
