import { getTranslations, getFormatter } from "next-intl/server";
import { Pencil } from "lucide-react";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import {
  getOwnedProduct,
  getStock,
  listMovements,
} from "@/features/inventory/queries";
import { listLots } from "@/features/purchases/queries";
import { registerMovementAction } from "@/features/inventory/actions";
import { MovementForm } from "@/features/inventory/movement-form";
import { milliToQtyString } from "@/lib/qty";
import { centsToDecimalString } from "@/lib/money";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ProductDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { orgId } = await requireOrg();
  const { id } = await params;
  const t = await getTranslations("app.products");
  const format = await getFormatter();
  const db = getDb();
  const product = await getOwnedProduct(db, orgId, id);
  const [stock, movements, lots] = await Promise.all([
    getStock(db, orgId, id),
    listMovements(db, orgId, id),
    listLots(db, orgId, id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="t-display text-2xl tracking-[-0.025em]">
          {product.name}
        </h1>
        <Button asChild variant="outline" size="sm">
          <Link href={`/products/${id}/edit`}>
            <Pencil className="size-4" aria-hidden /> {t("edit")}
          </Link>
        </Button>
      </div>

      <div className="grid max-w-md grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("stock")}</p>
            <p className="t-num-display text-[22px]" data-numeric="">
              {milliToQtyString(stock.qtyMilli)}{" "}
              {t(`form.units.${product.unit}`)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("avgCost")}</p>
            <p className="t-num-display text-[22px]" data-numeric="">
              {centsToDecimalString(stock.avgCostCents)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("newMovement")}</CardTitle>
        </CardHeader>
        <CardContent>
          <MovementForm action={registerMovementAction.bind(null, id)} />
        </CardContent>
      </Card>

      {lots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("lots")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {lots.map((l) => {
                const expired =
                  l.expiryDate && new Date(l.expiryDate) < new Date();
                return (
                  <li key={l.id} className="flex justify-between py-2">
                    <span className="font-medium" data-numeric="">
                      {l.code}
                    </span>
                    <span
                      className={
                        expired ? "text-destructive" : "text-muted-foreground"
                      }
                      data-numeric=""
                    >
                      {l.expiryDate
                        ? `${t("expiry")}: ${l.expiryDate}${expired ? ` (${t("expired")})` : ""}`
                        : t("noExpiry")}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("kardex")}</CardTitle>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noMovements")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="bg-surface-100 text-left">
                  <tr>
                    <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                      {t("date")}
                    </th>
                    <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                      {t("qty")}
                    </th>
                    <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                      {t("unitCost")}
                    </th>
                    <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                      {t("balance")}
                    </th>
                    <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                      {t("avgCost")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 pr-3">
                        {format.dateTime(m.createdAt, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                        {m.note && (
                          <span className="block text-xs text-muted-foreground">
                            {m.note}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right" data-numeric="">
                        {m.qty}
                      </td>
                      <td className="py-2 pr-3 text-right" data-numeric="">
                        {m.unitCostBaseCents
                          ? centsToDecimalString(m.unitCostBaseCents)
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right" data-numeric="">
                        {m.balanceQty}
                      </td>
                      <td className="py-2 text-right" data-numeric="">
                        {centsToDecimalString(m.balanceAvgCostBaseCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
