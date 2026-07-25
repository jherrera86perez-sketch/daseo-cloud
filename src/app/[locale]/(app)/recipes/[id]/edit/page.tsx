import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { getRecipeDetail } from "@/features/recipes/queries";
import { listProducts } from "@/features/inventory/queries";
import { RecipeForm } from "@/features/recipes/recipe-form";
import { updateRecipeAction } from "@/features/recipes/actions";

export default async function EditRecipePage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { orgId } = await requireOrg();
  const { id } = await params;
  const t = await getTranslations("app.recipes");
  const db = getDb();
  const [{ recipe, items }, products] = await Promise.all([
    getRecipeDetail(db, orgId, id),
    listProducts(db, orgId, {}),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="t-display text-2xl tracking-[-0.025em]">{t("edit")}</h1>
      <RecipeForm
        producibles={products
          .filter((p) => p.isProducible)
          .map((p) => ({ id: p.id, name: p.name, unit: p.unit }))}
        components={products
          .filter((p) => p.isComponent)
          .map((p) => ({ id: p.id, name: p.name, unit: p.unit }))}
        action={updateRecipeAction.bind(null, id)}
        initial={{
          productId: recipe.productId,
          name: recipe.name,
          outputQty: recipe.outputQty,
          items: items.map((i) => ({ productId: i.productId, qty: i.qty })),
        }}
      />
    </div>
  );
}
