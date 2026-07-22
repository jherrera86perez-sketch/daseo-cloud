import { getTranslations } from "next-intl/server";
import { Plus, Search, TriangleAlert } from "lucide-react";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import {
  listProductsWithStock,
  lowStockProducts,
} from "@/features/inventory/queries";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function ProductsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string }> }>) {
  const { orgId } = await requireOrg();
  const { q } = await searchParams;
  const t = await getTranslations("app.products");
  const db = getDb();
  const [rows, low] = await Promise.all([
    listProductsWithStock(db, orgId, { search: q }),
    lowStockProducts(db, orgId),
  ]);
  const lowIds = new Set(low.map((p) => p.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button asChild>
          <Link href="/products/new">
            <Plus className="size-4" aria-hidden /> {t("new")}
          </Link>
        </Button>
      </div>

      {low.length > 0 && (
        <p className="flex items-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm">
          <TriangleAlert className="size-4 text-warning" aria-hidden />
          {t("lowStockAlert", { count: low.length })}
        </p>
      )}

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

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">{t("form.name")}</th>
                <th className="px-4 py-2 font-medium">{t("form.sku")}</th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("stock")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-accent">
                  <td className="px-4 py-2">
                    <Link
                      href={`/products/${p.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {p.name}
                    </Link>
                    {lowIds.has(p.id) && (
                      <TriangleAlert
                        className="ml-2 inline size-3.5 text-warning"
                        aria-label={t("lowStock")}
                      />
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {p.sku ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right" data-numeric="">
                    {p.balance} {t(`form.units.${p.unit}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
