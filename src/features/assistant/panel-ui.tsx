"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { KPIs, Recomendacion } from "./analytics";
import { saveFollowupAction } from "./actions";

/**
 * Port fiel de PanelNegocio.tsx + TablaRecomendaciones.tsx del ERP:
 * grupos por categoría ordenados por urgencia máxima, badge Urgente(≥7)/
 * Importante(≥4)/Sugerencia, tabs por módulo y seguimiento con estados
 * PENDIENTE/EN_PROGRESO/COMPLETADA/DESCARTADA (upsert por recomendacion_id).
 */

export type FollowupDto = {
  recommendationId: string;
  status: string;
  notes: string | null;
};

type Periodo = "hoy" | "mes" | "todos";

const CATS = [
  "inventario",
  "produccion",
  "empleados",
  "precios",
  "clientes",
] as const;
type Cat = (typeof CATS)[number];

function urgenciaBadge(urgencia: number): {
  key: "urgent" | "important" | "suggestion";
  cls: string;
} {
  if (urgencia >= 7)
    return {
      key: "urgent",
      cls: "bg-destructive/10 text-destructive border-destructive/30",
    };
  if (urgencia >= 4)
    return {
      key: "important",
      cls: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
    };
  return {
    key: "suggestion",
    cls: "bg-secondary text-muted-foreground border-transparent",
  };
}

function impactoCls(impacto: string): string {
  if (impacto === "Alto") return "bg-destructive/10 text-destructive";
  if (impacto === "Medio")
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "bg-primary/10 text-primary";
}

export function PanelNegocioView({
  kpis,
  recomendaciones,
  followups,
  periodo,
  y,
  m,
}: Readonly<{
  kpis: KPIs;
  recomendaciones: Recomendacion[];
  followups: FollowupDto[];
  periodo: Periodo;
  y: number;
  m: number;
}>) {
  const t = useTranslations("app.assistantPanel");
  const locale = useLocale();
  const router = useRouter();
  const [tab, setTab] = useState<"todos" | Cat>("todos");
  const mesLabel = new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : "es", {
    month: "long",
  }).format(new Date(y, m - 1, 1));

  const go = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    router.replace(`/assistant${qs ? `?${qs}` : ""}`);
  };
  const mesAnterior = () =>
    go(
      m === 1
        ? { y: String(y - 1), m: "12" }
        : { y: String(y), m: String(m - 1) },
    );
  const mesSiguiente = () =>
    go(
      m === 12
        ? { y: String(y + 1), m: "1" }
        : { y: String(y), m: String(m + 1) },
    );

  // Agrupar por categoría; grupos por urgencia máxima; dentro urgencia→score
  const grupos = useMemo(() => {
    const porCat = new Map<Cat, Recomendacion[]>();
    for (const r of recomendaciones) {
      const cat = r.categoria as Cat;
      if (!porCat.has(cat)) porCat.set(cat, []);
      porCat.get(cat)!.push(r);
    }
    for (const list of porCat.values()) {
      list.sort((a, b) => b.urgencia - a.urgencia || b.score - a.score);
    }
    return [...porCat.entries()].sort(
      (a, b) =>
        Math.max(...b[1].map((r) => r.urgencia)) -
        Math.max(...a[1].map((r) => r.urgencia)),
    );
  }, [recomendaciones]);

  const visibles = tab === "todos" ? grupos : grupos.filter(([c]) => c === tab);

  return (
    <div className="flex flex-col gap-4">
      {/* Selector de período: Hoy / ‹ mes año › / Todos */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={periodo === "hoy" ? "default" : "outline"}
          onClick={() => go({ periodo: "hoy" })}
        >
          {t("today")}
        </Button>
        <div className="flex items-center rounded-md border">
          <button
            type="button"
            aria-label={t("prevMonth")}
            className="px-2 py-1.5 hover:bg-accent"
            onClick={mesAnterior}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-sm capitalize ${periodo === "mes" ? "font-semibold" : "text-muted-foreground"}`}
            onClick={() => go({ y: String(y), m: String(m) })}
          >
            {mesLabel} {y}
          </button>
          <button
            type="button"
            aria-label={t("nextMonth")}
            className="px-2 py-1.5 hover:bg-accent"
            onClick={mesSiguiente}
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
        <Button
          size="sm"
          variant={periodo === "todos" ? "default" : "outline"}
          onClick={() => go({ periodo: "todos" })}
        >
          {t("allMonths")}
        </Button>
        <span className="ml-auto rounded-full bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive">
          {t("alertsBadge", { count: kpis.alertasTotal })}
        </span>
      </div>

      {/* KPIs por dominio (forma exacta de /kpis del ERP) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={t("cats.inventario")}
          items={[
            [t("kpi.stockBajo"), kpis.inventario.stockBajoCount],
            [t("kpi.obsoletos"), kpis.inventario.productosObsoletos],
            [
              t("kpi.inversionParalizada"),
              `$${kpis.inventario.inversionParalizada.toFixed(2)}`,
            ],
          ]}
        />
        <KpiCard
          title={t("cats.produccion")}
          items={[
            [t("kpi.ordenesPendientes"), kpis.produccion.ordenesPendientes],
            [
              t("kpi.costoPendiente"),
              `$${kpis.produccion.costoTotalPendiente.toFixed(2)}`,
            ],
            [t("kpi.merma"), kpis.produccion.mermaTotal],
          ]}
        />
        <KpiCard
          title={t("cats.empleados")}
          items={[
            [t("kpi.totalEmpleados"), kpis.empleados.totalEmpleados],
            [t("kpi.produccionPromedio"), kpis.empleados.produccionPromedio],
            [t("kpi.bajoRendimiento"), kpis.empleados.empleadosBajoRendimiento],
          ]}
        />
        <KpiCard
          title={t("cats.precios")}
          items={[
            [t("kpi.margenPromedio"), `${kpis.precios.margenPromedio}%`],
            [t("kpi.margenBajo"), kpis.precios.productosMargenBajo],
            [t("kpi.oportunidades"), kpis.precios.oportunidadesAumento],
          ]}
        />
      </div>

      {/* Tabs por módulo */}
      <div className="flex flex-wrap gap-1 border-b">
        {(["todos", ...CATS] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setTab(c)}
            className={`rounded-t-md px-3 py-2 text-sm ${
              tab === c
                ? "border border-b-0 bg-background font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {c === "todos" ? t("tabAll") : t(`cats.${c}`)}
          </button>
        ))}
      </div>

      {/* Acciones más urgentes */}
      {visibles.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
        </div>
      ) : (
        visibles.map(([cat, recs]) => (
          <section key={cat} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`cats.${cat}`)}
            </h2>
            <div className="grid gap-2">
              {recs.map((r) => {
                const badge = urgenciaBadge(r.urgencia);
                return (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-start gap-2 rounded-md border p-3"
                  >
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${badge.cls}`}
                    >
                      {t(`urgency.${badge.key}`)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{r.titulo}</p>
                      <p className="text-sm text-muted-foreground">
                        {r.descripcion}
                      </p>
                      <p className="mt-1 text-sm">
                        <span className="font-medium">{t("action")}:</span>{" "}
                        {r.accion}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${impactoCls(r.impacto)}`}
                    >
                      {t(`impact.${r.impacto}`)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      <SeguimientoTable
        recomendaciones={recomendaciones}
        followups={followups}
      />
    </div>
  );
}

function KpiCard({
  title,
  items,
}: Readonly<{ title: string; items: Array<[string, string | number]> }>) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-semibold" data-numeric="">
              {value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const ESTADO_CLS: Record<string, string> = {
  PENDIENTE: "border text-muted-foreground",
  EN_PROGRESO: "bg-primary/10 text-primary",
  COMPLETADA: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  DESCARTADA: "bg-secondary text-muted-foreground",
};

function SeguimientoTable({
  recomendaciones,
  followups,
}: Readonly<{ recomendaciones: Recomendacion[]; followups: FollowupDto[] }>) {
  const t = useTranslations("app.assistantPanel");
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = useMemo(
    () => new Map(followups.map((f) => [f.recommendationId, f])),
    [followups],
  );

  const save = (r: Recomendacion, status?: string, notes?: string) => {
    startTransition(async () => {
      const res = await saveFollowupAction({
        recommendationId: r.id,
        title: r.titulo,
        category: r.categoria,
        status: (status ?? byId.get(r.id)?.status ?? "PENDIENTE") as string,
        notes: notes ?? byId.get(r.id)?.notes ?? undefined,
      });
      if (res?.error) toast.error(res.error);
      else {
        toast.success(res?.ok ?? "");
        router.refresh();
      }
    });
  };

  if (recomendaciones.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("followupTitle")}
      </h2>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">{t("colImpact")}</th>
              <th className="px-3 py-2 font-medium">{t("colRec")}</th>
              <th className="px-3 py-2 font-medium">{t("colCat")}</th>
              <th className="px-3 py-2 font-medium">{t("colScore")}</th>
              <th className="px-3 py-2 font-medium">{t("colStatus")}</th>
              <th className="px-3 py-2 font-medium">{t("colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {recomendaciones.map((r) => {
              const estado = byId.get(r.id)?.status ?? "PENDIENTE";
              const isOpen = expanded === r.id;
              return [
                <tr key={r.id}>
                  <td className="px-3 py-2" data-numeric="">
                    {r.posicion}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${impactoCls(r.impacto)}`}
                    >
                      {t(`impact.${r.impacto}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-left font-medium hover:underline"
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                    >
                      <ChevronDown
                        className={`size-3 shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                        aria-hidden
                      />
                      {r.titulo}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {t(`cats.${r.categoria}`)}
                  </td>
                  <td className="px-3 py-2" data-numeric="">
                    {r.score}/10
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLS[estado] ?? ""}`}
                    >
                      {t(`status.${estado}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {estado !== "EN_PROGRESO" && estado !== "COMPLETADA" && (
                        <IconBtn
                          label={t("markInProgress")}
                          disabled={pending}
                          onClick={() => save(r, "EN_PROGRESO")}
                        >
                          <Clock className="size-4" aria-hidden />
                        </IconBtn>
                      )}
                      {estado !== "COMPLETADA" && (
                        <IconBtn
                          label={t("markDone")}
                          disabled={pending}
                          onClick={() => save(r, "COMPLETADA")}
                        >
                          <CheckCircle2 className="size-4" aria-hidden />
                        </IconBtn>
                      )}
                      {estado !== "DESCARTADA" && estado !== "COMPLETADA" && (
                        <IconBtn
                          label={t("markDiscarded")}
                          disabled={pending}
                          onClick={() => save(r, "DESCARTADA")}
                        >
                          <X className="size-4" aria-hidden />
                        </IconBtn>
                      )}
                      {(estado === "COMPLETADA" || estado === "DESCARTADA") && (
                        <IconBtn
                          label={t("reopen")}
                          disabled={pending}
                          onClick={() => save(r, "PENDIENTE")}
                        >
                          <RotateCcw className="size-4" aria-hidden />
                        </IconBtn>
                      )}
                    </div>
                  </td>
                </tr>,
                isOpen ? (
                  <tr key={`${r.id}-detail`} className="bg-muted/30">
                    <td colSpan={7} className="px-3 py-3">
                      <p className="text-sm">{r.descripcion}</p>
                      <p className="mt-1 text-sm">
                        <span className="font-medium">{t("recAction")}:</span>{" "}
                        {r.accion}
                      </p>
                      <label className="mt-2 block text-xs font-medium text-muted-foreground">
                        {t("notesLabel")}
                        <textarea
                          className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                          rows={2}
                          defaultValue={byId.get(r.id)?.notes ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value;
                            if (v !== (byId.get(r.id)?.notes ?? "")) {
                              save(r, undefined, v);
                            }
                          }}
                        />
                      </label>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IconBtn({
  label,
  disabled,
  onClick,
  children,
}: Readonly<{
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}>) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border p-1.5 hover:bg-accent disabled:opacity-50"
    >
      {children}
    </button>
  );
}
