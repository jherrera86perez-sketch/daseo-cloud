import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { centsToDecimalString } from "@/lib/money";
import { listInternalOutflows } from "@/features/internal-outflows/queries";
import { listProductsWithStock } from "@/features/inventory/queries";
import { listBankAccounts } from "@/features/banking/queries";
import {
  OutflowsView,
  type OutflowDto,
  type ProductOpt,
  type AccountOpt,
} from "@/features/internal-outflows/outflows-ui";

// Port fiel de la página "Salidas Internas" del ERP CubaOne.
export default async function InternalOutflowsPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.internalOutflows");
  const db = getDb();
  const [outflows, productRows, accountRows] = await Promise.all([
    listInternalOutflows(db, orgId, {}),
    listProductsWithStock(db, orgId, {}),
    listBankAccounts(db, orgId),
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
    bankAccountId: s.bankAccountId,
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

  const accounts: AccountOpt[] = accountRows.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <OutflowsView rows={rows} products={products} accounts={accounts} />
    </div>
  );
}
