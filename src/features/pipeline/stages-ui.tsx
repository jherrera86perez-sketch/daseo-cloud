"use client";

import { useActionState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createStageAction,
  renameStageAction,
  deleteStageAction,
  type ActionState,
} from "./actions";

type StageItem = {
  id: string;
  name: string;
  isWon: boolean;
  isLost: boolean;
  dealCount: number;
};

export function StagesEditor({ stages }: Readonly<{ stages: StageItem[] }>) {
  const t = useTranslations("app.stages");
  const [deletePending, startDelete] = useTransition();

  function onDelete(id: string) {
    startDelete(async () => {
      const res = await deleteStageAction(id);
      if (res?.error) toast.error(res.error);
      else toast.success(t("deleted"));
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {stages.map((s) => (
        <StageRow
          key={s.id}
          stage={s}
          onDelete={onDelete}
          deletePending={deletePending}
        />
      ))}
      <AddStageForm />
    </div>
  );
}

function StageRow({
  stage,
  onDelete,
  deletePending,
}: Readonly<{
  stage: StageItem;
  onDelete: (id: string) => void;
  deletePending: boolean;
}>) {
  const t = useTranslations("app.stages");
  const [, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await renameStageAction(stage.id, prev, form);
      if (res?.error) toast.error(res.error);
      else toast.success(t("renamed"));
      return res;
    },
    null,
  );
  const terminal = stage.isWon || stage.isLost;

  return (
    <form action={formAction} className="flex items-center gap-2">
      <Input
        name="name"
        defaultValue={stage.name}
        aria-label={t("name")}
        className="h-8 flex-1 text-sm"
        required
      />
      <span className="w-14 text-right text-xs text-muted-foreground">
        {t("deals", { count: stage.dealCount })}
      </span>
      <Button size="sm" variant="outline" type="submit" disabled={pending}>
        {pending ? "…" : t("save")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        type="button"
        aria-label={t("delete")}
        title={terminal ? t("protected") : t("delete")}
        disabled={terminal || stage.dealCount > 0 || deletePending}
        onClick={() => onDelete(stage.id)}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </form>
  );
}

function AddStageForm() {
  const t = useTranslations("app.stages");
  const [, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await createStageAction(prev, form);
      if (res?.error) toast.error(res.error);
      else toast.success(t("added"));
      return res;
    },
    null,
  );

  return (
    <form
      action={formAction}
      className="mt-2 flex items-center gap-2 border-t pt-3"
    >
      <Input
        name="name"
        placeholder={t("newPlaceholder")}
        aria-label={t("newPlaceholder")}
        className="h-8 flex-1 text-sm"
        required
      />
      <Button size="sm" type="submit" disabled={pending}>
        {pending ? "…" : t("add")}
      </Button>
    </form>
  );
}
