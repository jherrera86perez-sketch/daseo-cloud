import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/layout/page-header";
import { PageLayout } from "@/components/ui/layout/page-layout";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { centsToDecimalString } from "@/lib/money";
import { listInternalOutflows } from "@/features/internal-outflows/queries";
import { listProductsWithStock } from "@/features/inventory/queries";
import {
  OutflowsView,
  type OutflowDto,
  type ProductOpt,
} from "@/features/internal-outflows/outflows-ui";

// Port fiel de la página "Salidas Internas" del ERP CubaOne.
export default async function InternalOutflowsPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.internalOutflows");
  const db = getDb();
  const [outflows, productRows] = await Promise.all([
    listInternalOutflows(db, orgId, {}),
    listProductsWithStock(db, orgId, {}),
  ]);

  const rows: OutflowDto[] = outflows.map((s) => ({
    id: s.id,
    fecha: s.fecha,
    tipo: s.tipo,
    destino: s.empleadoNombre ?? s.destinoNombre,
    motivo: s.motivo,
    notas: s.notas,
    montoEfectivo: centsToDecimalString(s.montoEfectivoCents),
    valorProductos: centsToDecimalString(s.valorProductosCents),
    items: s.items.map((i) => ({
      productId: i.productId,
      productName: i.productName,
      qty: i.qty,
      unit: i.unit,
      totalCost: centsToDecimalString(i.totalCostCents),
    })),
  }));

  const products: ProductOpt[] = productRows.map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    balance: p.balance,
    avgCost: centsToDecimalString(BigInt(p.avg_cost_cents)),
  }));

  return (
    <PageLayout
      header={<PageHeader title={t("title")} subtitle={t("subtitle")} />}
    >
      <OutflowsView rows={rows} products={products} />
    </PageLayout>
  );
}
