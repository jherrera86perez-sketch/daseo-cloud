import { getTranslations } from "next-intl/server";
import { Search } from "lucide-react";

import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listAllLots } from "@/features/purchases/queries";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/feedback/empty-state";
import { PageHeader } from "@/components/ui/layout/page-header";
import { PageLayout } from "@/components/ui/layout/page-layout";
import { DensityToggle } from "@/components/ui/atoms/density-toggle";
import {
  DataTable,
  THead,
  TBody,
  TRow,
  TH,
  TD,
} from "@/components/ui/data-table";

/*
 * ≈ "Trazabilidad por Lote" del ERP, item propio de su menú.
 *
 * En Cloud los lotes sólo se veían dentro de la ficha del producto. Esta es la
 * búsqueda global que el ERP ofrece: por código de lote o por producto.
 */
export default async function TraceabilityPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string }> }>) {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.traceability");
  const { q } = await searchParams;
  const rows = await listAllLots(getDb(), orgId, q?.trim() || undefined);

  const hoy = new Date();

  return (
    <PageLayout
      header={<PageHeader title={t("title")} subtitle={t("subtitle")} />}
      filters={
        <>
          <form method="get" className="relative max-w-sm">
            <Search
              className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              name="q"
              defaultValue={q ?? ""}
              placeholder={t("searchPlaceholder")}
              className="pl-8"
            />
          </form>
          <DensityToggle className="ml-auto" />
        </>
      }
    >
      {rows.length === 0 ? (
        <Card>
          <EmptyState title={q ? t("emptyFiltered") : t("empty")} />
        </Card>
      ) : (
        <DataTable>
          <THead>
            <TRow className="hover:bg-transparent">
              <TH>{t("code")}</TH>
              <TH>{t("product")}</TH>
              <TH>{t("expiry")}</TH>
            </TRow>
          </THead>
          <TBody>
            {rows.map((l) => {
              const vencido = l.expiryDate
                ? new Date(l.expiryDate) < hoy
                : false;
              return (
                <TRow key={l.id}>
                  <TD className="t-num font-medium">{l.code}</TD>
                  <TD>
                    <Link
                      href={`/products/${l.productId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {l.productName}
                    </Link>
                  </TD>
                  <TD className={vencido ? "text-destructive" : ""}>
                    {l.expiryDate
                      ? String(l.expiryDate).slice(0, 10)
                      : t("noExpiry")}
                  </TD>
                </TRow>
              );
            })}
          </TBody>
        </DataTable>
      )}
    </PageLayout>
  );
}
