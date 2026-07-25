import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { orgSettings } from "@/db/schema";
import { listCustomers } from "@/features/customers/queries";
import { listProducts } from "@/features/inventory/queries";
import { listRates } from "@/features/rates/queries";
import { centsToDecimalString } from "@/lib/money";
import { SaleForm } from "@/features/sales/sale-form";
import { createQuoteAction } from "@/features/quotes/actions";

export default async function NewQuotePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ dealId?: string }> }>) {
  const { orgId } = await requireOrg();
  const { dealId } = await searchParams;
  const t = await getTranslations("app.quotes");
  const db = getDb();
  const [customers, products, rates, [settings]] = await Promise.all([
    listCustomers(db, orgId, {}),
    listProducts(db, orgId, {}),
    listRates(db, orgId),
    db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)),
  ]);

  const rateMap: Record<string, string> = {};
  for (const r of rates) {
    rateMap[r.currency] ??= r.rateToBase
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "");
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="t-display text-2xl tracking-[-0.025em]">{t("new")}</h1>
      {customers.length === 0 ? (
        <p className="rounded-md border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {t("needCustomer")}
        </p>
      ) : (
        <SaleForm
          customers={customers.map((c) => ({ id: c.id, name: c.name }))}
          products={products
            .filter((p) => p.isSellable)
            .map((p) => ({
              id: p.id,
              name: p.name,
              price: centsToDecimalString(p.priceCents),
            }))}
          rates={rateMap}
          baseCurrency={settings?.baseCurrency ?? "CUP"}
          action={createQuoteAction}
          submitLabel={t("save")}
          dealId={dealId}
        />
      )}
    </div>
  );
}
