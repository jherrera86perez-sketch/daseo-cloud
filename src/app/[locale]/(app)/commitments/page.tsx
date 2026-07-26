import { getTranslations } from "next-intl/server";

import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listCommitmentsWithStatus } from "@/features/people/queries";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
 * ≈ "Compromisos" del ERP, que lo tiene como item propio del menú.
 *
 * En Cloud los compromisos se creaban y veían dentro de la ficha del cliente;
 * esa vía se mantiene. Esta pantalla es la lista GLOBAL que el ERP ofrece, sin
 * query nueva: reutiliza `listCommitmentsWithStatus`, la misma que ya alimenta
 * el aviso del panel.
 */
export default async function CommitmentsPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.commitments");
  const rows = await listCommitmentsWithStatus(getDb(), orgId);

  return (
    <PageLayout
      header={<PageHeader title={t("title")} subtitle={t("subtitle")} />}
      filters={<DensityToggle className="ml-auto" />}
    >
      {rows.length === 0 ? (
        <Card>
          <EmptyState title={t("empty")} />
        </Card>
      ) : (
        <DataTable>
          <THead>
            <TRow className="hover:bg-transparent">
              <TH>{t("customer")}</TH>
              <TH>{t("description")}</TH>
              <TH>{t("frequency")}</TH>
              <TH>{t("status")}</TH>
            </TRow>
          </THead>
          <TBody>
            {rows.map((c) => (
              <TRow key={c.id}>
                <TD>
                  <Link
                    href={`/customers/${c.customerId}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {c.customerName}
                  </Link>
                </TD>
                <TD>{c.description}</TD>
                <TD className="text-muted-foreground">
                  {t(`frequencies.${c.frequency}`)}
                </TD>
                <TD>
                  <Badge tone={c.fulfilled ? "success" : "warning"}>
                    {c.fulfilled ? t("fulfilled") : t("pending")}
                  </Badge>
                </TD>
              </TRow>
            ))}
          </TBody>
        </DataTable>
      )}
    </PageLayout>
  );
}
