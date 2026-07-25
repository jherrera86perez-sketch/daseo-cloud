import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listRecipes } from "@/features/recipes/queries";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default async function RecipesPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.recipes");
  const rows = await listRecipes(getDb(), orgId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="t-display text-2xl tracking-[-0.025em]">{t("title")}</h1>
        <Button asChild>
          <Link href="/recipes/new">
            <Plus className="size-4" aria-hidden /> {t("new")}
          </Link>
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/recipes/${r.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-surface-hover"
              >
                <span className="font-medium">{r.name}</span>
                <span className="text-sm text-muted-foreground" data-numeric="">
                  {r.productName} · {r.outputQty} {r.productUnit}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
