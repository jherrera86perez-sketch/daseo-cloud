import { getTranslations } from "next-intl/server";
import { Pencil } from "lucide-react";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { getRecipeDetail } from "@/features/recipes/queries";
import { centsToDecimalString } from "@/lib/money";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function RecipeDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { orgId } = await requireOrg();
  const { id } = await params;
  const t = await getTranslations("app.recipes");
  const { recipe, items, batchCostCents, unitCostCents } =
    await getRecipeDetail(getDb(), orgId, id);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="t-display text-2xl tracking-[-0.025em]">
          {recipe.name}
        </h1>
        <Button asChild variant="outline" size="sm">
          <Link href={`/recipes/${id}/edit`}>
            <Pencil className="size-4" aria-hidden /> {t("edit")}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {t("theoreticalCost")} ({t("perBatch", { qty: recipe.outputQty })})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="py-2 pr-2">{i.componentName}</td>
                  <td className="py-2 pr-2 text-right" data-numeric="">
                    {i.qty} {i.componentUnit}
                  </td>
                  <td className="py-2 pr-2 text-right" data-numeric="">
                    × {centsToDecimalString(i.avgCostCents)}
                  </td>
                  <td className="py-2 text-right font-medium" data-numeric="">
                    {centsToDecimalString(i.lineCostCents)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t">
                <td colSpan={3} className="py-2 text-right font-medium">
                  {t("batchCost")}
                </td>
                <td
                  className="py-2 text-right text-lg font-bold"
                  data-numeric=""
                >
                  {centsToDecimalString(batchCostCents)}
                </td>
              </tr>
              <tr>
                <td
                  colSpan={3}
                  className="text-right text-sm text-muted-foreground"
                >
                  {t("unitCost")}
                </td>
                <td className="text-right text-sm font-medium" data-numeric="">
                  {centsToDecimalString(unitCostCents)}
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("theoreticalNote")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
