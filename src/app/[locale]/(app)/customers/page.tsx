import { getTranslations } from "next-intl/server";
import { Plus, Search } from "lucide-react";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listCustomers } from "@/features/customers/queries";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function CustomersPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string }> }>) {
  const { orgId } = await requireOrg();
  const { q } = await searchParams;
  const t = await getTranslations("app.customers");
  const rows = await listCustomers(getDb(), orgId, { search: q });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button asChild>
          <Link href="/customers/new">
            <Plus className="size-4" aria-hidden /> {t("new")}
          </Link>
        </Button>
      </div>

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
          {q ? t("emptySearch", { q }) : t("empty")}
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                href={`/customers/${c.id}`}
                className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-accent"
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-sm text-muted-foreground" data-numeric="">
                  {c.phone ?? c.email ?? ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
