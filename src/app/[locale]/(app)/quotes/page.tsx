import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listQuotes } from "@/features/quotes/queries";
import { centsToDecimalString } from "@/lib/money";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default async function QuotesPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.quotes");
  const rows = await listQuotes(getDb(), orgId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button asChild>
          <Link href="/quotes/new">
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
          {rows.map((q) => (
            <li key={q.id}>
              <Link
                href={`/quotes/${q.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-accent"
              >
                <span className="font-medium" data-numeric="">
                  {q.series}-{q.number} · {q.customerName}
                </span>
                <span className="flex items-center gap-3">
                  <span data-numeric="">
                    {centsToDecimalString(q.totalCents)} {q.currency}
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                    {t(`statuses.${q.status}`)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
