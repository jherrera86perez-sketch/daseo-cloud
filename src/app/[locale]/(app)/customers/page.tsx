import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/layout/page-header";
import { PageLayout } from "@/components/ui/layout/page-layout";
import { CatalogTabs } from "@/components/catalog-tabs";
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
    <PageLayout
      header={
        <PageHeader
          title={t("title")}
          actions={
            <Button asChild size="sm">
              <Link href="/customers/new">
                <Plus className="size-4" aria-hidden /> {t("new")}
              </Link>
            </Button>
          }
        />
      }
    >
      <CatalogTabs active="customers" />
      <div className="flex flex-col gap-4">
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
          <div className="rounded-md border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            {q ? t("emptySearch", { q }) : t("empty")}
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {rows.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/customers/${c.id}`}
                  className="flex items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-surface-hover"
                >
                  <span className="font-medium">{c.name}</span>
                  <span
                    className="text-sm text-muted-foreground"
                    data-numeric=""
                  >
                    {c.phone ?? c.email ?? ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageLayout>
  );
}
