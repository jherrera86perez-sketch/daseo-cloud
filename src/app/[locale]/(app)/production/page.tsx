import { getTranslations, getFormatter } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listOrders } from "@/features/production/queries";
import { listRecipes } from "@/features/recipes/queries";
import { NewOrderForm } from "@/features/production/new-order-form";
import { Link } from "@/i18n/navigation";

export default async function ProductionPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.production");
  const format = await getFormatter();
  const db = getDb();
  const [orders, recipes] = await Promise.all([
    listOrders(db, orgId),
    listRecipes(db, orgId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {recipes.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("needRecipe")}
        </p>
      ) : (
        <NewOrderForm
          recipes={recipes.map((r) => ({ id: r.id, name: r.name }))}
        />
      )}

      {orders.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/production/${o.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-accent"
              >
                <span className="font-medium">
                  {o.recipeName} → {o.productName}
                </span>
                <span className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {format.dateTime(o.createdAt, { dateStyle: "medium" })}
                  </span>
                  {o.producedQty && (
                    <span data-numeric="">{o.producedQty}</span>
                  )}
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                    {t(`statuses.${o.status}`)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
