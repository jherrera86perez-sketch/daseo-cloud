import { getTranslations } from "next-intl/server";
import { Plus, Pencil } from "lucide-react";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listSuppliers } from "@/features/purchases/queries";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default async function SuppliersPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.suppliers");
  const rows = await listSuppliers(getDb(), orgId, {});

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="t-display text-2xl tracking-[-0.025em]">{t("title")}</h1>
        <Button asChild>
          <Link href="/suppliers/new">
            <Plus className="size-4" aria-hidden /> {t("new")}
          </Link>
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {rows.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 px-4 py-3"
            >
              <span>
                <span className="font-medium">{s.name}</span>{" "}
                <span className="text-sm text-muted-foreground" data-numeric="">
                  {s.phone ?? s.email ?? ""}
                </span>
              </span>
              <Link
                href={`/suppliers/${s.id}/edit`}
                aria-label={t("edit")}
                className="rounded p-1 hover:bg-accent"
              >
                <Pencil className="size-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
