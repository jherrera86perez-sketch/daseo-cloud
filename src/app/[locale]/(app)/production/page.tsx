import { getTranslations, getFormatter } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DensityToggle } from "@/components/ui/atoms/density-toggle";
import { EmptyState } from "@/components/ui/feedback/empty-state";
import { PageHeader } from "@/components/ui/layout/page-header";
import { PageLayout } from "@/components/ui/layout/page-layout";
import {
  DataTable,
  THead,
  TBody,
  TRow,
  TH,
  TD,
} from "@/components/ui/data-table";
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
    <PageLayout
      header={<PageHeader title={t("title")} />}
      filters={<DensityToggle className="ml-auto" />}
    >
      <div className="flex flex-col gap-4">
        {recipes.length === 0 ? (
          <Card>
            <EmptyState title={t("needRecipe")} />
          </Card>
        ) : (
          <NewOrderForm
            recipes={recipes.map((r) => ({ id: r.id, name: r.name }))}
          />
        )}

        {orders.length === 0 ? (
          <Card>
            <EmptyState title={t("empty")} />
          </Card>
        ) : (
          /*
           * El ERP muestra además Costo total y Costo unitario por orden, pero
           * esos valores no están en `productionOrders`: el costo real se
           * calcula al confirmar y vive en el kardex. Traerlos exigiría una
           * query nueva y este trabajo no toca queries. Diferido.
           */
          <DataTable>
            <THead>
              <TRow className="hover:bg-transparent">
                <TH>{t("order")}</TH>
                <TH>{t("date")}</TH>
                <TH numeric>{t("quantity")}</TH>
                <TH>{t("status")}</TH>
              </TRow>
            </THead>
            <TBody>
              {orders.map((o) => (
                <TRow key={o.id}>
                  <TD>
                    <Link
                      href={`/production/${o.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {o.recipeName} → {o.productName}
                    </Link>
                  </TD>
                  <TD className="text-muted-foreground">
                    {format.dateTime(o.createdAt, { dateStyle: "medium" })}
                  </TD>
                  <TD numeric data-numeric="">
                    {o.producedQty ?? "—"}
                  </TD>
                  <TD>
                    <Badge
                      tone={o.status === "confirmed" ? "success" : "neutral"}
                    >
                      {t(`statuses.${o.status}`)}
                    </Badge>
                  </TD>
                </TRow>
              ))}
            </TBody>
          </DataTable>
        )}
      </div>
    </PageLayout>
  );
}
