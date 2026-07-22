import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { getCustomerDetail } from "@/features/customers/queries";
import { CustomerForm } from "@/features/customers/customer-form";
import { DeleteCustomerButton } from "@/features/customers/delete-button";
import { updateCustomerAction } from "@/features/customers/actions";

export default async function EditCustomerPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { orgId } = await requireOrg();
  const { id } = await params;
  const t = await getTranslations("app.customers");
  const { customer } = await getCustomerDetail(getDb(), orgId, id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("edit")}</h1>
      <CustomerForm
        action={updateCustomerAction.bind(null, id)}
        initial={customer}
      />
      <DeleteCustomerButton id={id} />
    </div>
  );
}
