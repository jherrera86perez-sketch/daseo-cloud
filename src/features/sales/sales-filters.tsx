"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Filtros de "Ventas y Facturación" del ERP: búsqueda, estado, rango, limpiar. */
export function SalesFilters({
  q,
  estado,
  desde,
  hasta,
}: Readonly<{ q: string; estado: string; desde: string; hasta: string }>) {
  const t = useTranslations("app.sales");
  const router = useRouter();
  const [search, setSearch] = useState(q);

  const go = (params: Record<string, string>) => {
    const merged = { q: search, estado, desde, hasta, ...params };
    const qs = new URLSearchParams(
      Object.entries(merged).filter(([, v]) => v !== ""),
    ).toString();
    router.replace(`/sales${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        aria-label={t("searchPlaceholder")}
        placeholder={t("searchPlaceholder")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") go({ q: e.currentTarget.value });
        }}
        onBlur={(e) => {
          if (e.target.value !== q) go({ q: e.target.value });
        }}
        className="w-56"
      />
      <select
        aria-label={t("statusFilter")}
        value={estado}
        onChange={(e) => go({ estado: e.target.value })}
        className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
      >
        <option value="">{t("allStatuses")}</option>
        <option value="PAGADA">{t("filterPaid")}</option>
        <option value="PENDIENTE">{t("filterPending")}</option>
        <option value="PARCIAL">{t("filterPartial")}</option>
        <option value="CANCELADA">{t("filterCancelled")}</option>
        <option value="BORRADOR">{t("filterDraft")}</option>
      </select>
      <Input
        aria-label={t("from")}
        type="date"
        value={desde}
        onChange={(e) => go({ desde: e.target.value })}
        className="w-36"
      />
      <span className="text-muted-foreground">→</span>
      <Input
        aria-label={t("to")}
        type="date"
        value={hasta}
        onChange={(e) => go({ hasta: e.target.value })}
        className="w-36"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setSearch("");
          router.replace("/sales");
        }}
      >
        {t("clearFilters")}
      </Button>
    </div>
  );
}
