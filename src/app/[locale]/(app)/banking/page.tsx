import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listBankAccounts } from "@/features/banking/queries";
import { NewAccountForm } from "@/features/banking/banking-ui";
import { Link } from "@/i18n/navigation";

export default async function BankingPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.banking");
  const accounts = await listBankAccounts(getDb(), orgId);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="t-display text-2xl tracking-[-0.025em]">{t("title")}</h1>
      <NewAccountForm />
      {accounts.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {accounts.map((a) => (
            <li key={a.id}>
              <Link
                href={`/banking/${a.id}`}
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-surface-hover"
              >
                <span className="font-medium">{a.name}</span>
                <span className="text-sm text-muted-foreground">
                  {a.currency}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
