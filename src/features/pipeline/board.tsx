"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { centsToDecimalString } from "@/lib/money";
import { createDealAction, moveDealAction, type ActionState } from "./actions";

type Stage = {
  id: string;
  name: string;
  isWon: boolean;
  isLost: boolean;
};
type Deal = {
  id: string;
  title: string;
  customerName?: string;
  amountCents: string; // serializado
  currency: string;
  stageId: string;
};
type CustomerOpt = { id: string; name: string };

export function PipelineBoard({
  stages,
  dealsByStage,
  customers,
}: Readonly<{
  stages: Stage[];
  dealsByStage: Record<string, Deal[]>;
  customers: CustomerOpt[];
}>) {
  const t = useTranslations("app.pipeline");
  const [movePending, startMove] = useTransition();
  // Columna bajo el cursor durante un arrastre (DnD nativo: 0 KB extra;
  // en táctil no existe dragstart, ahí queda el select como vía oficial).
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  function onMove(dealId: string, stageId: string) {
    startMove(async () => {
      const res = await moveDealAction(dealId, stageId);
      if (res?.error) toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <NewDealForm customers={customers} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stages.map((stage) => (
          <section
            key={stage.id}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOverStage(stage.id);
            }}
            onDragLeave={(e) => {
              // Solo al salir de la sección, no al pasar sobre sus hijos.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverStage(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverStage(null);
              const dealId = e.dataTransfer.getData("text/plain");
              const current = dealsByStage[stage.id]?.some(
                (d) => d.id === dealId,
              );
              if (dealId && !current) onMove(dealId, stage.id);
            }}
            className={`rounded-md border p-2 transition-shadow ${
              dragOverStage === stage.id ? "ring-2 ring-primary/60" : ""
            } ${
              stage.isWon
                ? "border-success/40 bg-success/5"
                : stage.isLost
                  ? "border-destructive/30 bg-destructive/5"
                  : "bg-muted/30"
            }`}
          >
            <h2 className="mb-2 px-1 text-sm font-semibold">
              {stage.name}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                ({dealsByStage[stage.id]?.length ?? 0})
              </span>
            </h2>
            <ul className="flex flex-col gap-2">
              {(dealsByStage[stage.id] ?? []).map((deal) => (
                <li
                  key={deal.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", deal.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDragOverStage(null)}
                  className="cursor-grab rounded-md border bg-card p-2 text-sm shadow-xs active:cursor-grabbing"
                >
                  <p className="font-medium">{deal.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {deal.customerName}
                    {deal.amountCents !== "0" && (
                      <span className="float-right" data-numeric="">
                        {centsToDecimalString(BigInt(deal.amountCents))}{" "}
                        {deal.currency}
                      </span>
                    )}
                  </p>
                  <div className="mt-2 flex items-center gap-1">
                    <select
                      aria-label={t("moveTo")}
                      className="border-input h-7 flex-1 rounded border bg-transparent px-1 text-xs"
                      value={deal.stageId}
                      disabled={movePending}
                      onChange={(e) => onMove(deal.id, e.target.value)}
                    >
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <Link
                      href={`/quotes/new?dealId=${deal.id}&customerId=${encodeURIComponent(
                        deal.customerName ?? "",
                      )}`}
                      aria-label={t("quoteIt")}
                      title={t("quoteIt")}
                      className="rounded p-1 transition-colors hover:bg-surface-hover"
                    >
                      <FileText className="size-4" aria-hidden />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function NewDealForm({ customers }: Readonly<{ customers: CustomerOpt[] }>) {
  const t = useTranslations("app.pipeline");
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await createDealAction(prev, form);
      if (!res?.error) {
        ref.current?.reset();
        toast.success(t("created"));
      }
      return res;
    },
    null,
  );

  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form
      ref={ref}
      action={formAction}
      className="flex flex-wrap items-center gap-2"
    >
      <Input
        name="title"
        placeholder={t("dealTitle")}
        required
        className="min-w-40 flex-1"
      />
      <select
        name="customerId"
        className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
        required
      >
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Input
        name="amount"
        inputMode="decimal"
        placeholder={t("amount")}
        className="w-28"
      />
      <select
        name="currency"
        className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
        defaultValue="CUP"
      >
        {["CUP", "USD", "BRL"].map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={pending}>
        {pending ? "…" : t("addDeal")}
      </Button>
    </form>
  );
}
