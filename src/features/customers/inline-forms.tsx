"use client";

import { useActionState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INTERACTION_TYPES } from "./schemas";
import type { ActionState } from "./actions";

/** Formularios inline de la ficha (contacto / interacción). */
export function InlineForm({
  kind,
  action,
}: Readonly<{
  kind: "contact" | "interaction";
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
}>) {
  const t = useTranslations("app.customers");
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await action(prev, form);
      if (!res?.error) {
        ref.current?.reset();
        toast.success(t("saved"));
      }
      return res;
    },
    null,
  );

  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  if (kind === "contact") {
    return (
      <form
        ref={ref}
        action={formAction}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <Input name="name" placeholder={t("form.name")} required />
        <Input name="phone" type="tel" placeholder={t("form.phone")} />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "…" : t("addContact")}
        </Button>
      </form>
    );
  }

  return (
    <form
      ref={ref}
      action={formAction}
      className="flex flex-col gap-2 sm:flex-row"
    >
      <select
        name="type"
        className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
        defaultValue="note"
      >
        {INTERACTION_TYPES.map((tp) => (
          <option key={tp} value={tp}>
            {t(`types.${tp}`)}
          </option>
        ))}
      </select>
      <Input
        name="content"
        placeholder={t("interactionPlaceholder")}
        required
        className="flex-1"
      />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "…" : t("addInteraction")}
      </Button>
    </form>
  );
}
