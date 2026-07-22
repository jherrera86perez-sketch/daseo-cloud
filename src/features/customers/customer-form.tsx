"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "./actions";
import type { CustomerRow } from "./queries";

export function CustomerForm({
  action,
  initial,
}: Readonly<{
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  initial?: Partial<CustomerRow>;
}>) {
  const t = useTranslations("app.customers.form");
  const [state, formAction, pending] = useActionState(action, null);

  const fields = [
    { name: "name", label: t("name"), required: true },
    { name: "taxId", label: t("taxId") },
    { name: "email", label: t("email"), type: "email" },
    { name: "phone", label: t("phone"), type: "tel" },
    { name: "address", label: t("address") },
    { name: "notes", label: t("notes") },
  ] as const;

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-2">
          <Label htmlFor={f.name}>
            {f.label}
            {"required" in f && f.required ? " *" : ""}
          </Label>
          <Input
            id={f.name}
            name={f.name}
            type={"type" in f ? f.type : "text"}
            required={"required" in f && f.required}
            defaultValue={
              (initial?.[f.name as keyof CustomerRow] as string) ?? ""
            }
          />
        </div>
      ))}
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "…" : t("save")}
      </Button>
    </form>
  );
}
