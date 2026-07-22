import { getTranslations } from "next-intl/server";
import { CustomerForm } from "@/features/customers/customer-form";
import { createCustomerAction } from "@/features/customers/actions";

export default async function NewCustomerPage() {
  const t = await getTranslations("app.customers");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("new")}</h1>
      <CustomerForm action={createCustomerAction} />
    </div>
  );
}
