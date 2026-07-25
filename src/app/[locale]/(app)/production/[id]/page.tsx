import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { getOrderDetail } from "@/features/production/queries";
import { getRecipeDetail } from "@/features/recipes/queries";
import { listEmployees } from "@/features/people/queries";
import { ConfirmOrderForm } from "@/features/production/confirm-form";
import { centsToDecimalString } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ProductionOrderPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { orgId } = await requireOrg();
  const { id } = await params;
  const t = await getTranslations("app.production");
  const db = getDb();
  const { order, inputs } = await getOrderDetail(db, orgId, id);
  const recipe = await getRecipeDetail(db, orgId, order.recipeId);
  const employees =
    order.status === "draft" ? await listEmployees(db, orgId) : [];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="t-display text-2xl tracking-[-0.025em]">
        {order.recipeName} → {order.productName}
        <span className="ml-3 align-middle rounded-full bg-secondary px-2 py-0.5 text-xs font-normal">
          {t(`statuses.${order.status}`)}
        </span>
      </h1>

      {order.status === "draft" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("confirmTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ConfirmOrderForm
              orderId={id}
              inputs={inputs.map((i) => ({
                id: i.id,
                componentName: i.componentName,
                componentUnit: i.componentUnit,
                plannedQty: i.plannedQty,
              }))}
              defaultOutput={recipe.recipe.outputQty}
              employees={employees
                .filter((e) => e.active === "yes")
                .map((e) => ({ id: e.id, name: e.name }))}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("resultTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {inputs.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2 pr-2">{i.componentName}</td>
                    <td className="py-2 pr-2 text-right" data-numeric="">
                      {i.actualQty ?? i.plannedQty} {i.componentUnit}
                    </td>
                    <td className="py-2 text-right" data-numeric="">
                      {i.unitCostBaseCents
                        ? `× ${centsToDecimalString(i.unitCostBaseCents)}`
                        : ""}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 pr-2">{t("labor")}</td>
                  <td />
                  <td className="py-2 text-right" data-numeric="">
                    {centsToDecimalString(order.laborCostBaseCents)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-2">{t("overhead")}</td>
                  <td />
                  <td className="py-2 text-right" data-numeric="">
                    {centsToDecimalString(order.overheadBaseCents)}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td className="py-2 font-medium">{t("produced")}</td>
                  <td className="py-2 text-right font-bold" data-numeric="">
                    {order.producedQty}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("kardexNote")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
