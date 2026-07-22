"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "./actions";

type ProductOpt = { id: string; name: string; unit: string };
type Item = { productId: string; qty: string };

export function RecipeForm({
  producibles,
  components,
  action,
  initial,
}: Readonly<{
  producibles: ProductOpt[];
  components: ProductOpt[];
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  initial?: {
    productId: string;
    name: string;
    outputQty: string;
    items: Item[];
  };
}>) {
  const t = useTranslations("app.recipes");
  const [state, formAction, pending] = useActionState(action, null);
  const [productId, setProductId] = useState(
    initial?.productId ?? producibles[0]?.id ?? "",
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [outputQty, setOutputQty] = useState(initial?.outputQty ?? "");
  const [items, setItems] = useState<Item[]>(
    initial?.items ?? [{ productId: components[0]?.id ?? "", qty: "" }],
  );

  const payload = JSON.stringify({
    productId,
    name,
    outputQty,
    items: items.filter((i) => i.productId && i.qty),
  });

  function setItem(i: number, patch: Partial<Item>) {
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <input type="hidden" name="payload" value={payload} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="r-product">{t("product")}</Label>
        <select
          id="r-product"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
          required
        >
          {producibles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="r-name">{t("name")}</Label>
          <Input
            id="r-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="r-output">{t("outputQty")}</Label>
          <Input
            id="r-output"
            inputMode="decimal"
            value={outputQty}
            onChange={(e) => setOutputQty(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t("components")}</Label>
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              aria-label={t("component")}
              value={item.productId}
              onChange={(e) => setItem(i, { productId: e.target.value })}
              className="border-input h-9 flex-1 rounded-md border bg-transparent px-2 text-sm"
            >
              {components.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.unit})
                </option>
              ))}
            </select>
            <Input
              aria-label={t("qty")}
              placeholder={t("qty")}
              inputMode="decimal"
              value={item.qty}
              onChange={(e) => setItem(i, { qty: e.target.value })}
              className="w-24"
              required
            />
            {items.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("removeComponent")}
                onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4 text-destructive" aria-hidden />
              </Button>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            setItems((xs) => [
              ...xs,
              { productId: components[0]?.id ?? "", qty: "" },
            ])
          }
        >
          <Plus className="size-4" aria-hidden /> {t("addComponent")}
        </Button>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending || !productId}>
        {pending ? "…" : t("save")}
      </Button>
    </form>
  );
}
