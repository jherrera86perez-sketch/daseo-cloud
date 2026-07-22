import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listProducts } from "@/features/inventory/queries";
import { RecipeForm } from "@/features/recipes/recipe-form";
import { createRecipeAction } from "@/features/recipes/actions";

export default async function NewRecipePage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.recipes");
  const products = await listProducts(getDb(), orgId, {});
  const producibles = products.filter((p) => p.isProducible);
  const components = products.filter((p) => p.isComponent);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("new")}</h1>
      {producibles.length === 0 || components.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("needProducts")}
        </p>
      ) : (
        <RecipeForm
          producibles={producibles.map((p) => ({
            id: p.id,
            name: p.name,
            unit: p.unit,
          }))}
          components={components.map((p) => ({
            id: p.id,
            name: p.name,
            unit: p.unit,
          }))}
          action={createRecipeAction}
        />
      )}
    </div>
  );
}
