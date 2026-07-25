"use client";

import {
  useActionState,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  uploadStatementAction,
  deleteStatementAction,
  statementDetailAction,
  type ActionState,
  type MovementDto,
} from "./actions";

export type StatementDto = {
  id: string;
  filename: string;
  titular: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  saldoInicial: string;
  saldoFinal: string | null;
  totalCreditos: string;
  totalDebitos: string;
  numOperaciones: number;
  cuadrado: boolean;
};

const fmt = (v: string | null) => (v === null ? "—" : Number(v).toFixed(2));

/** DD/MM/YYYY → {mes, anio} para los filtros (como parseDMY del ERP). */
function parseDMY(s: string | null): { mes: number; anio: number } | null {
  if (!s || !/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return null;
  const [, mm, yyyy] = s.split("/");
  return { mes: parseInt(mm, 10), anio: parseInt(yyyy, 10) };
}

export function StatementsView({
  statements,
}: Readonly<{ statements: StatementDto[] }>) {
  const t = useTranslations("app.statements");
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [search, setSearch] = useState("");
  const [mesF, setMesF] = useState("");
  const [anioF, setAnioF] = useState("");
  const [cuentaF, setCuentaF] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [movs, setMovs] = useState<MovementDto[]>([]);
  const [movSearch, setMovSearch] = useState("");
  const [obsOpen, setObsOpen] = useState<Set<string>>(new Set());
  const [loadingDetail, startDetail] = useTransition();
  const [deleting, startDelete] = useTransition();

  const [, formAction, uploading] = useActionState(
    async (prev: ActionState, form: FormData) => {
      const res = await uploadStatementAction(prev, form);
      if (res?.error) toast.error(res.error);
      else if (res?.warn) toast.warning(res.warn);
      else if (res?.ok) toast.success(res.ok);
      if (fileRef.current) fileRef.current.value = "";
      return res;
    },
    null,
  );

  const cuentas = useMemo(
    () => [...new Set(statements.map((s) => s.titular || s.filename))],
    [statements],
  );
  const anios = useMemo(() => {
    const set = new Set<number>();
    for (const s of statements) {
      const d = parseDMY(s.fechaInicio) ?? parseDMY(s.fechaFin);
      if (d) set.add(d.anio);
    }
    return [...set].sort((a, b) => b - a);
  }, [statements]);

  const filtered = statements.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      const hay =
        `${s.titular ?? ""} ${s.filename} ${s.fechaInicio ?? ""} ${s.fechaFin ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (cuentaF && (s.titular || s.filename) !== cuentaF) return false;
    const d = parseDMY(s.fechaInicio) ?? parseDMY(s.fechaFin);
    if (mesF && d?.mes !== parseInt(mesF, 10)) return false;
    if (anioF && d?.anio !== parseInt(anioF, 10)) return false;
    return true;
  });

  function toggleExpand(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    setMovs([]);
    setMovSearch("");
    startDetail(async () => {
      const res = await statementDetailAction(id);
      if (res.error) toast.error(res.error);
      else setMovs(res.movements ?? []);
    });
  }

  function onDelete(id: string) {
    if (!window.confirm(t("deleteConfirm"))) return;
    startDelete(async () => {
      const res = await deleteStatementAction(id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success(t("deleted"));
        if (expanded === id) setExpanded(null);
      }
    });
  }

  const filteredMovs = movs.filter((m) => {
    if (!movSearch) return true;
    const q = movSearch.toLowerCase();
    return `${m.referencia ?? ""} ${m.observacion ?? ""} ${m.clientName ?? ""} ${m.fecha ?? ""}`
      .toLowerCase()
      .includes(q);
  });

  const hasFilters = Boolean(search || mesF || anioF || cuentaF);
  const months = t("months").split(",");

  return (
    <div className="flex flex-1 flex-col gap-4 lg:flex-row">
      <div className="flex flex-1 flex-col gap-4">
        {/* Toolbar de importación (una sola acción, arriba — como el ERP) */}
        <form
          ref={formRef}
          action={formAction}
          className="flex items-center gap-3"
        >
          <input
            ref={fileRef}
            type="file"
            name="file"
            accept=".pdf"
            className="hidden"
            onChange={() => formRef.current?.requestSubmit()}
          />
          <Button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" aria-hidden />
            {uploading ? t("processing") : t("import")}
          </Button>
          <span className="text-xs text-muted-foreground">{t("hint")}</span>
        </form>

        {statements.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            <p className="font-medium">{t("emptyTitle")}</p>
            <p>{t("emptyBody")}</p>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4" aria-hidden />
                {t("listTitle")} (
                {hasFilters
                  ? t("filteredCount", {
                      shown: filtered.length,
                      total: statements.length,
                    })
                  : filtered.length}
                )
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {/* Filtros */}
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="h-8 min-w-44 flex-1 text-sm"
                />
                {cuentas.length > 1 && (
                  <select
                    aria-label={t("account")}
                    value={cuentaF}
                    onChange={(e) => setCuentaF(e.target.value)}
                    className="border-input h-8 rounded-md border bg-transparent px-2 text-xs"
                  >
                    <option value="">{t("allAccounts")}</option>
                    {cuentas.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  aria-label={t("month")}
                  value={mesF}
                  onChange={(e) => setMesF(e.target.value)}
                  className="border-input h-8 rounded-md border bg-transparent px-2 text-xs"
                >
                  <option value="">{t("allMonths")}</option>
                  {months.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t("year")}
                  value={anioF}
                  onChange={(e) => setAnioF(e.target.value)}
                  className="border-input h-8 rounded-md border bg-transparent px-2 text-xs"
                >
                  <option value="">{t("allYears")}</option>
                  {anios.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                {hasFilters && (
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setMesF("");
                      setAnioF("");
                      setCuentaF("");
                    }}
                  >
                    {t("clear")}
                  </Button>
                )}
              </div>

              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-100 text-left">
                    <tr>
                      <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                        {t("account")}
                      </th>
                      <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                        {t("period")}
                      </th>
                      <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                        {t("ops")}
                      </th>
                      <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                        {t("credits")}
                      </th>
                      <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                        {t("debits")}
                      </th>
                      <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                        {t("finalBalance")}
                      </th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {filtered.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-3 py-6 text-center text-muted-foreground"
                        >
                          {t("noResults")}
                        </td>
                      </tr>
                    )}
                    {filtered.map((s) => (
                      <StatementRows
                        key={s.id}
                        s={s}
                        expanded={expanded === s.id}
                        onToggle={() => toggleExpand(s.id)}
                        onDelete={() => onDelete(s.id)}
                        deleting={deleting}
                        loadingDetail={loadingDetail && expanded === s.id}
                        movs={filteredMovs}
                        totalMovs={movs.length}
                        movSearch={movSearch}
                        setMovSearch={setMovSearch}
                        obsOpen={obsOpen}
                        setObsOpen={setObsOpen}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <SummaryPanel statements={filtered} />
    </div>
  );
}

function StatementRows({
  s,
  expanded,
  onToggle,
  onDelete,
  deleting,
  loadingDetail,
  movs,
  totalMovs,
  movSearch,
  setMovSearch,
  obsOpen,
  setObsOpen,
}: Readonly<{
  s: StatementDto;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  deleting: boolean;
  loadingDetail: boolean;
  movs: MovementDto[];
  totalMovs: number;
  movSearch: string;
  setMovSearch: (v: string) => void;
  obsOpen: Set<string>;
  setObsOpen: (s: Set<string>) => void;
}>) {
  const t = useTranslations("app.statements");
  const periodo =
    s.fechaInicio && s.fechaFin && s.fechaInicio !== s.fechaFin
      ? `${s.fechaInicio} → ${s.fechaFin}`
      : (s.fechaInicio ?? s.fechaFin ?? "—");

  return (
    <>
      <tr
        className="cursor-pointer transition-colors hover:bg-surface-hover"
        onClick={onToggle}
      >
        <td className="px-3 py-2 font-medium">
          {s.titular || s.filename}
          {!s.cuadrado && (
            <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600">
              {t("notBalanced")}
            </span>
          )}
        </td>
        <td className="px-3 py-2" data-numeric="">
          {periodo}
        </td>
        <td className="px-3 py-2 text-right" data-numeric="">
          {s.numOperaciones}
        </td>
        <td className="px-3 py-2 text-right text-success" data-numeric="">
          {fmt(s.totalCreditos)}
        </td>
        <td className="px-3 py-2 text-right text-destructive" data-numeric="">
          {fmt(s.totalDebitos)}
        </td>
        <td className="px-3 py-2 text-right" data-numeric="">
          {fmt(s.saldoFinal)}
        </td>
        <td className="px-3 py-2">
          <Button
            size="sm"
            variant="ghost"
            type="button"
            aria-label={t("delete")}
            disabled={deleting}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-muted/20 px-3 py-3">
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label={t("initialBalance")} value={fmt(s.saldoInicial)} />
              <Kpi
                label={t("credits")}
                value={fmt(s.totalCreditos)}
                tone="success"
              />
              <Kpi
                label={t("debits")}
                value={fmt(s.totalDebitos)}
                tone="destructive"
              />
              <Kpi label={t("finalBalance")} value={fmt(s.saldoFinal)} />
            </div>
            {loadingDetail ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="size-4 animate-spin" aria-hidden />
                {t("loadingDetail")}
              </p>
            ) : (
              <>
                <Input
                  value={movSearch}
                  onChange={(e) => setMovSearch(e.target.value)}
                  placeholder={t("movSearchPlaceholder")}
                  className="mb-2 h-8 text-sm"
                />
                <div className="max-h-96 overflow-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 border-b bg-muted text-left">
                      <tr>
                        <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                          {t("date")}
                        </th>
                        <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                          {t("reference")}
                        </th>
                        <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                          {t("type")}
                        </th>
                        <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                          {t("amount")}
                        </th>
                        <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                          {t("balance")}
                        </th>
                        <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                          {t("client")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {movs.map((m) => (
                        <MovRow
                          key={m.id}
                          m={m}
                          open={obsOpen.has(m.id)}
                          onToggle={() => {
                            const next = new Set(obsOpen);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            setObsOpen(next);
                          }}
                        />
                      ))}
                      {movs.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-2 py-4 text-center text-muted-foreground"
                          >
                            {t("noMovements")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {movSearch && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("movFiltered", { shown: movs.length, total: totalMovs })}
                  </p>
                )}
              </>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function MovRow({
  m,
  open,
  onToggle,
}: Readonly<{ m: MovementDto; open: boolean; onToggle: () => void }>) {
  const tipoBadge =
    m.tipoTransaccion === "BANCA_MOVIL"
      ? "BancaMovil"
      : m.tipoTransaccion === "SWITCH_CE"
        ? "Switch CE"
        : null;
  return (
    <tr
      className="cursor-pointer align-top transition-colors hover:bg-surface-hover"
      onClick={onToggle}
    >
      <td className="px-2 py-1.5 whitespace-nowrap" data-numeric="">
        {m.fecha ?? "—"}
      </td>
      <td className="px-2 py-1.5">
        <span className="font-mono">{m.referencia ?? "—"}</span>
        {tipoBadge && (
          <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-[10px]">
            {tipoBadge}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-center">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            m.operacion === "CR"
              ? "bg-success/15 text-success"
              : "bg-destructive/15 text-destructive"
          }`}
        >
          {m.operacion}
        </span>
      </td>
      <td
        className={`px-2 py-1.5 text-right font-semibold ${
          m.operacion === "CR" ? "text-success" : "text-destructive"
        }`}
        data-numeric=""
      >
        {fmt(m.importe)}
      </td>
      <td className="px-2 py-1.5 text-right" data-numeric="">
        {fmt(m.saldo)}
      </td>
      <td className="px-2 py-1.5">
        {m.clientName ?? (
          <span className="font-mono text-muted-foreground">
            {m.panOrigen ?? "—"}
          </span>
        )}
        {open && m.observacion && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {m.observacion}
          </p>
        )}
      </td>
    </tr>
  );
}

function Kpi({
  label,
  value,
  tone,
}: Readonly<{ label: string; value: string; tone?: string }>) {
  return (
    <div className="rounded-md border bg-card p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-sm font-semibold ${
          tone === "success"
            ? "text-success"
            : tone === "destructive"
              ? "text-destructive"
              : ""
        }`}
        data-numeric=""
      >
        {value}
      </p>
    </div>
  );
}

/** Panel lateral (port de EstadosCuentaSummaryPanel): sobre la lista filtrada. */
function SummaryPanel({
  statements,
}: Readonly<{ statements: StatementDto[] }>) {
  const t = useTranslations("app.statements");
  const totalCred = statements.reduce((a, s) => a + Number(s.totalCreditos), 0);
  const totalDeb = statements.reduce((a, s) => a + Number(s.totalDebitos), 0);
  const totalOps = statements.reduce((a, s) => a + s.numOperaciones, 0);
  const balance = totalCred - totalDeb;
  const top = [...statements]
    .sort((a, b) => Number(b.totalCreditos) - Number(a.totalCreditos))
    .slice(0, 3);
  const pct = (v: number) =>
    totalCred + totalDeb > 0 ? (v / (totalCred + totalDeb)) * 100 : 0;

  return (
    <aside className="flex w-full flex-col gap-4 lg:w-64">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-4 text-sm">
          <div>
            <p className="text-xs uppercase text-muted-foreground">
              {t("netBalance")}
            </p>
            <p
              className={`t-num-display text-2xl ${balance >= 0 ? "text-success" : "text-destructive"}`}
              data-numeric=""
            >
              {balance.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("panelMeta", { n: statements.length, ops: totalOps })}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase text-muted-foreground">
              {t("topCredits")}
            </p>
            {top.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noImports")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {top.map((s, i) => (
                  <li key={s.id} className="flex justify-between gap-2 text-xs">
                    <span className="truncate">
                      {i + 1}. {s.titular || s.filename}
                    </span>
                    <span data-numeric="">{fmt(s.totalCreditos)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs uppercase text-muted-foreground">
              CR vs DB
            </p>
            <BarRow
              label={t("credits")}
              value={totalCred}
              pctValue={pct(totalCred)}
              tone="success"
            />
            <BarRow
              label={t("debits")}
              value={totalDeb}
              pctValue={pct(totalDeb)}
              tone="destructive"
            />
          </div>
          <div>
            <p className="mb-1 text-xs uppercase text-muted-foreground">
              {t("metrics")}
            </p>
            <MetricRow label={t("totalCredits")} value={totalCred.toFixed(2)} />
            <MetricRow label={t("totalDebits")} value={totalDeb.toFixed(2)} />
            <MetricRow
              label={t("avgOperation")}
              value={
                totalOps > 0
                  ? ((totalCred + totalDeb) / totalOps).toFixed(2)
                  : "0.00"
              }
            />
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}

function BarRow({
  label,
  value,
  pctValue,
  tone,
}: Readonly<{ label: string; value: number; pctValue: number; tone: string }>) {
  return (
    <div className="mb-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span data-numeric="">{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 w-full rounded bg-muted">
        <div
          className={`h-1.5 rounded ${tone === "success" ? "bg-success" : "bg-destructive"}`}
          style={{ width: `${pctValue}%` }}
        />
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span data-numeric="">{value}</span>
    </div>
  );
}
