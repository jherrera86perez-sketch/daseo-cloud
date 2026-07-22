import { getTranslations, getFormatter } from "next-intl/server";
import { Pencil } from "lucide-react";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { getCustomerDetail } from "@/features/customers/queries";
import {
  addContactAction,
  addInteractionAction,
} from "@/features/customers/actions";
import { InlineForm } from "@/features/customers/inline-forms";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CustomerDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { orgId } = await requireOrg();
  const { id } = await params;
  const t = await getTranslations("app.customers");
  const format = await getFormatter();
  const { customer, contacts, interactions } = await getCustomerDetail(
    getDb(),
    orgId,
    id,
  );

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{customer.name}</h1>
        <Button asChild variant="outline" size="sm">
          <Link href={`/customers/${id}/edit`}>
            <Pencil className="size-4" aria-hidden /> {t("edit")}
          </Link>
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        {customer.phone && (
          <>
            <dt className="text-muted-foreground">{t("form.phone")}</dt>
            <dd data-numeric="">{customer.phone}</dd>
          </>
        )}
        {customer.email && (
          <>
            <dt className="text-muted-foreground">{t("form.email")}</dt>
            <dd>{customer.email}</dd>
          </>
        )}
        {customer.address && (
          <>
            <dt className="text-muted-foreground">{t("form.address")}</dt>
            <dd>{customer.address}</dd>
          </>
        )}
      </dl>

      <Card>
        <CardHeader>
          <CardTitle>{t("contacts")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noContacts")}</p>
          ) : (
            <ul className="divide-y text-sm">
              {contacts.map((c) => (
                <li key={c.id} className="flex justify-between py-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground" data-numeric="">
                    {c.phone ?? c.email ?? c.role ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <InlineForm kind="contact" action={addContactAction.bind(null, id)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("timeline")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <InlineForm
            kind="interaction"
            action={addInteractionAction.bind(null, id)}
          />
          {interactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noInteractions")}
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {interactions.map((i) => (
                <li key={i.id} className="rounded-md border p-3 text-sm">
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>{t(`types.${i.type}`)}</span>
                    <time dateTime={i.occurredAt.toISOString()}>
                      {format.dateTime(i.occurredAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                  {i.content}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
