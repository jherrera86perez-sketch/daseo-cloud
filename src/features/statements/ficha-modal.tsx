"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { X, Phone, CreditCard, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clienteFichaAction } from "./actions";
import type { FichaResult } from "./analytics";

const fmtMoney = (n: number) =>
  "$" +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const MESES_CORTO = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")} ${MESES_CORTO[d.getMonth()]} ${d.getFullYear()}`;
}

/** Ficha modal de cliente — port de FichaModal del ERP (TopClientes.tsx). */
export function FichaModal({
  clientName,
  panOrigen,
  onClose,
}: Readonly<{
  clientName: string;
  panOrigen: string | null;
  onClose: () => void;
}>) {
  const t = useTranslations("app.topClients");
  const [ficha, setFicha] = useState<FichaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anioF, setAnioF] = useState("");
  const [mesF, setMesF] = useState("");
  const [tipoF, setTipoF] = useState("");
  const [loading, startLoad] = useTransition();

  function load() {
    startLoad(async () => {
      setError(null);
      const res = await clienteFichaAction(clientName, panOrigen ?? undefined);
      if (res.error) setError(res.error);
      else setFicha(res.ficha ?? null);
    });
  }

  // El padre remonta el modal con key={name|pan}: el estado nace limpio aquí.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientName, panOrigen]);

  const ops = useMemo(() => ficha?.ops ?? [], [ficha]);
  const anios = useMemo(
    () =>
      [
        ...new Set(ops.map((o) => o.fechaIso?.slice(0, 4)).filter(Boolean)),
      ].sort((a, b) => b!.localeCompare(a!)) as string[],
    [ops],
  );
  const meses = useMemo(
    () =>
      [
        ...new Set(
          ops
            .filter((o) => !anioF || o.fechaIso?.startsWith(anioF))
            .map((o) => o.fechaIso?.slice(5, 7))
            .filter(Boolean),
        ),
      ].sort() as string[],
    [ops, anioF],
  );

  const filtradas = ops.filter((o) => {
    if (anioF && !o.fechaIso?.startsWith(anioF)) return false;
    if (mesF && o.fechaIso?.slice(5, 7) !== mesF) return false;
    if (tipoF && o.operacion !== tipoF) return false;
    return true;
  });
  const totCR = filtradas
    .filter((o) => o.operacion === "CR")
    .reduce((a, o) => a + o.importe, 0);
  const nCR = filtradas.filter((o) => o.operacion === "CR").length;
  const totDB = filtradas
    .filter((o) => o.operacion === "DB")
    .reduce((a, o) => a + o.importe, 0);

  const maxMes = Math.max(1, ...(ficha?.por_mes ?? []).map((m) => m.total));
  const hasFilters = Boolean(anioF || mesF || tipoF);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("fichaEyebrow")}
            </p>
            <h2 className="text-xl font-bold">{clientName}</h2>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {ficha?.cliente?.telefono && (
                <a
                  href={`tel:${ficha.cliente.telefono}`}
                  className="flex items-center gap-1 text-primary"
                >
                  <Phone className="size-3.5" aria-hidden />
                  {ficha.cliente.telefono}
                </a>
              )}
              {ficha?.cliente?.pan_origen && (
                <span className="flex items-center gap-1 font-mono">
                  <CreditCard className="size-3.5" aria-hidden />
                  {ficha.cliente.pan_origen}
                </span>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            aria-label={t("close")}
            onClick={onClose}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>

        {loading && !ficha ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("fichaLoading", { name: clientName })}
          </p>
        ) : error ? (
          <div className="py-6 text-center text-sm">
            <p className="mb-2 text-destructive">
              {t("fichaError", { error })}
            </p>
            <Button size="sm" variant="outline" type="button" onClick={load}>
              <RefreshCw className="size-4" aria-hidden /> {t("retry")}
            </Button>
          </div>
        ) : !ficha?.cliente ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("fichaEmpty")}
          </p>
        ) : (
          <>
            {/* Stats */}
            {ficha.stats && (
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <FichaStat
                  value={fmtMoney(ficha.stats.total_creditos)}
                  label={t("statTotal")}
                />
                <FichaStat
                  value={String(ficha.stats.num_creditos)}
                  label={t("statTransfers")}
                />
                <FichaStat
                  value={fmtMoney(ficha.stats.ticket_promedio)}
                  label={t("statTicket")}
                />
                <FichaStat
                  value={
                    ficha.stats.frecuencia_promedio_dias !== null
                      ? `${ficha.stats.frecuencia_promedio_dias.toFixed(0)} d`
                      : "—"
                  }
                  label={t("statFrequency")}
                />
                <FichaStat
                  value={`${ficha.stats.dias_relacion}d`}
                  label={t("statRelation")}
                  sub={fmtDate(ficha.stats.primera_op)}
                />
                <FichaStat
                  value={`${ficha.stats.dias_desde_ultima}d`}
                  label={t("statSinceLast")}
                  sub={fmtDate(ficha.stats.ultima_op)}
                  warn={ficha.stats.dias_desde_ultima > 60}
                />
              </div>
            )}

            {/* Distribución mensual */}
            {ficha.por_mes.length > 1 && (
              <div className="mb-4">
                <p className="mb-1 text-sm font-semibold">{t("monthlyDist")}</p>
                <div className="flex h-24 items-end gap-1 overflow-x-auto">
                  {ficha.por_mes.map((m) => {
                    const [y, mm] = m.mes.split("-");
                    return (
                      <div
                        key={m.mes}
                        className="flex min-w-10 flex-1 flex-col items-center"
                      >
                        <div
                          className="w-full rounded-t bg-primary"
                          style={{ height: `${(m.total / maxMes) * 80}px` }}
                        />
                        <span className="text-[9px] text-muted-foreground">
                          {MESES_CORTO[parseInt(mm, 10) - 1]} {y.slice(2)}
                        </span>
                        <span className="font-mono text-[9px]" data-numeric="">
                          {fmtMoney(m.total)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Operaciones */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-sm font-semibold">{t("operations")}</p>
                <span className="text-xs text-muted-foreground">
                  {t("opsCount", {
                    shown: filtradas.length,
                    total: ops.length,
                  })}
                </span>
              </div>
              <div className="mb-2 flex flex-wrap gap-1">
                <select
                  aria-label={t("year")}
                  value={anioF}
                  onChange={(e) => {
                    setAnioF(e.target.value);
                    setMesF("");
                  }}
                  className="border-input h-7 rounded border bg-transparent px-1 text-xs"
                >
                  <option value="">{t("allYears")}</option>
                  {anios.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t("month")}
                  value={mesF}
                  onChange={(e) => setMesF(e.target.value)}
                  className="border-input h-7 rounded border bg-transparent px-1 text-xs"
                >
                  <option value="">{t("allMonths")}</option>
                  {meses.map((m) => (
                    <option key={m} value={m}>
                      {MESES_CORTO[parseInt(m, 10) - 1]}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t("type")}
                  value={tipoF}
                  onChange={(e) => setTipoF(e.target.value)}
                  className="border-input h-7 rounded border bg-transparent px-1 text-xs"
                >
                  <option value="">{t("allTypes")}</option>
                  <option value="CR">{t("incomeCR")}</option>
                  <option value="DB">{t("expenseDB")}</option>
                </select>
                {hasFilters && (
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    aria-label={t("clearFilters")}
                    onClick={() => {
                      setAnioF("");
                      setMesF("");
                      setTipoF("");
                    }}
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                )}
              </div>

              {hasFilters && (
                <div className="mb-2 grid grid-cols-2 gap-1 text-xs sm:grid-cols-5">
                  <MiniStat
                    label={t("operations")}
                    value={String(filtradas.length)}
                  />
                  <MiniStat
                    label={t("incomeCR")}
                    value={fmtMoney(totCR)}
                    cls="text-success"
                  />
                  <MiniStat
                    label={t("expenseDB")}
                    value={fmtMoney(totDB)}
                    cls="text-destructive"
                  />
                  <MiniStat label={t("net")} value={fmtMoney(totCR - totDB)} />
                  <MiniStat
                    label={t("ticketCR")}
                    value={nCR > 0 ? fmtMoney(totCR / nCR) : "—"}
                  />
                </div>
              )}

              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {filtradas.slice(0, 100).map((o) => (
                  <div
                    key={o.id}
                    className={`grid grid-cols-[100px_auto_1fr] items-center gap-2 rounded border-l-2 bg-muted/30 px-2 py-1 text-xs ${
                      o.operacion === "CR"
                        ? "border-l-success"
                        : "border-l-destructive"
                    }`}
                  >
                    <span data-numeric="">{fmtDate(o.fechaIso)}</span>
                    <span
                      className={`font-mono font-semibold ${o.operacion === "CR" ? "text-success" : "text-destructive"}`}
                      data-numeric=""
                    >
                      {o.operacion === "CR" ? "+" : "−"}
                      {fmtMoney(o.importe)}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {o.observacion ?? "—"}
                    </span>
                  </div>
                ))}
                {filtradas.length > 100 && (
                  <p className="py-1 text-center text-xs text-muted-foreground">
                    {t("moreOps", { n: filtradas.length - 100 })}
                  </p>
                )}
                {filtradas.length === 0 && (
                  <p className="py-3 text-center text-xs text-muted-foreground">
                    {t("noOpsFiltered")}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FichaStat({
  value,
  label,
  sub,
  warn,
}: Readonly<{ value: string; label: string; sub?: string; warn?: boolean }>) {
  return (
    <div className="rounded-md border bg-card p-2">
      <p
        className={`text-sm font-bold ${warn ? "text-amber-600" : ""}`}
        data-numeric=""
      >
        {value}
      </p>
      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function MiniStat({
  label,
  value,
  cls,
}: Readonly<{ label: string; value: string; cls?: string }>) {
  return (
    <div className="rounded border bg-card px-2 py-1">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className={`font-mono font-semibold ${cls ?? ""}`} data-numeric="">
        {value}
      </p>
    </div>
  );
}
