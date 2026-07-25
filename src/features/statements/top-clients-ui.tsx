"use client";

/**
 * Top Clientes — port fiel de TopClientes.tsx del ERP CubaOne (versión rica):
 * presets de período (default 1M), 4 KPIs, búsqueda, 5 tabs (Ranking,
 * Tendencias, Segmentación RFM, En riesgo, Patrones con Pareto + heatmap)
 * y ficha modal. Export PDF / Google Contacts: diferidos de la v1.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Trophy,
  Star,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  Search,
  X,
  Phone,
  Users,
  Crown,
  Heart,
  Sprout,
  Skull,
  Sparkles,
  LineChart,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { topClientesAction } from "./actions";
import type { ClienteRow, ClientesKpis, HeatmapDia } from "./analytics";
import { FichaModal } from "./ficha-modal";

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

const PRESETS: Array<{ id: string; label: string; days: number | null }> = [
  { id: "1d", label: "1D", days: 1 },
  { id: "7d", label: "1S", days: 7 },
  { id: "1m", label: "1M", days: 30 },
  { id: "3m", label: "3M", days: 90 },
  { id: "6m", label: "6M", days: 180 },
  { id: "1y", label: "1A", days: 365 },
  { id: "all", label: "Todo", days: null },
];

function presetToRange(id: string): { desde: string; hasta: string } {
  const p = PRESETS.find((x) => x.id === id);
  if (!p || p.days === null) return { desde: "", hasta: "" };
  const hoy = new Date();
  const hasta = hoy.toISOString().slice(0, 10);
  const d = new Date(hoy);
  d.setDate(d.getDate() - (p.days - 1));
  return { desde: d.toISOString().slice(0, 10), hasta };
}

// ---------- RFM (calculado en cliente, como el ERP) ----------

type Segment = "champions" | "loyal" | "at_risk" | "new" | "lost" | "regular";

function quintileScore(
  value: number,
  sorted: number[],
  invert = false,
): number {
  if (sorted.length === 0) return 3;
  let rank = sorted.findIndex((v) => v >= value);
  if (rank === -1) rank = sorted.length - 1;
  const q = Math.min(4, Math.floor((rank / sorted.length) * 5));
  return invert ? 5 - q : q + 1;
}

export type RfmRow = ClienteRow & {
  r: number;
  f: number;
  m: number;
  segment: Segment;
};

function computeRfm(rows: ClienteRow[]): RfmRow[] {
  const rec = rows
    .map((r) => r.dias_desde_ultima ?? 9999)
    .sort((a, b) => a - b);
  const freq = rows.map((r) => r.num_ops).sort((a, b) => a - b);
  const mon = rows.map((r) => r.total_creditos).sort((a, b) => a - b);
  return rows.map((row) => {
    // R: menos días = mejor (invertido)
    const r = quintileScore(row.dias_desde_ultima ?? 9999, rec, true);
    const f = quintileScore(row.num_ops, freq);
    const m = quintileScore(row.total_creditos, mon);
    let segment: Segment = "regular";
    if (row.es_nuevo) segment = "new";
    else if (r >= 4 && f >= 4 && m >= 4) segment = "champions";
    else if (r >= 3 && f >= 4) segment = "loyal";
    else if (r <= 2 && (f >= 3 || m >= 3)) segment = "at_risk";
    else if (r <= 1) segment = "lost";
    return { ...row, r, f, m, segment };
  });
}

const SEGMENT_META: Record<
  Segment,
  { label: string; Icon: typeof Crown; color: string }
> = {
  champions: { label: "Champions", Icon: Crown, color: "text-amber-500" },
  loyal: { label: "Leales", Icon: Heart, color: "text-pink-500" },
  at_risk: { label: "En riesgo", Icon: AlertTriangle, color: "text-amber-600" },
  new: { label: "Nuevos", Icon: Sprout, color: "text-success" },
  lost: { label: "Perdidos", Icon: Skull, color: "text-muted-foreground" },
  regular: { label: "Regulares", Icon: Sparkles, color: "text-foreground/70" },
};
const SEGMENT_ORDER: Segment[] = [
  "champions",
  "loyal",
  "at_risk",
  "new",
  "lost",
  "regular",
];

// ---------- En riesgo (como el ERP) ----------

type RiesgoRow = ClienteRow & {
  ratio: number;
  sev: "critical" | "high" | "medium";
};

function detectarEnRiesgo(rows: ClienteRow[]): RiesgoRow[] {
  return rows
    .filter(
      (r) =>
        r.dias_entre_ops_promedio !== null &&
        r.dias_desde_ultima !== null &&
        r.num_ops >= 2 &&
        r.dias_desde_ultima > r.dias_entre_ops_promedio * 2,
    )
    .map((r) => {
      const ratio = r.dias_desde_ultima! / r.dias_entre_ops_promedio!;
      return {
        ...r,
        ratio,
        sev:
          ratio >= 5
            ? ("critical" as const)
            : ratio >= 3
              ? ("high" as const)
              : ("medium" as const),
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

// ---------- Componente principal ----------

export function TopClientsView() {
  const t = useTranslations("app.topClients");
  const [preset, setPreset] = useState("1m");
  const [range, setRange] = useState(presetToRange("1m"));
  const [rows, setRows] = useState<ClienteRow[]>([]);
  const [kpis, setKpis] = useState<ClientesKpis | null>(null);
  const [dias, setDias] = useState<HeatmapDia[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("ranking");
  const [ficha, setFicha] = useState<{
    name: string;
    pan: string | null;
  } | null>(null);
  const [loading, startLoad] = useTransition();

  function load(r = range) {
    startLoad(async () => {
      const res = await topClientesAction({
        desde: r.desde || undefined,
        hasta: r.hasta || undefined,
      });
      if (res.error) toast.error(t("loadError"));
      else {
        setRows(res.rows ?? []);
        setKpis(res.kpis ?? null);
        setDias(res.dias ?? []);
      }
    });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load(), []);

  function onPreset(id: string) {
    setPreset(id);
    if (id !== "custom") {
      const r = presetToRange(id);
      setRange(r);
      load(r);
    }
  }

  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.client_name.toLowerCase().includes(q) ||
        (r.telefono ?? "").includes(query),
    );
  }, [rows, query]);

  const tendRows = filtered.filter(
    (r) => r.delta_pct !== null && r.total_mes_anterior > 0,
  );
  const riesgo = detectarEnRiesgo(filtered);
  const rfmRows = useMemo(() => computeRfm(filtered), [filtered]);

  const abrir = (r: ClienteRow) =>
    setFicha({ name: r.client_name, pan: r.pan_origen });

  return (
    <div className="flex flex-col gap-4">
      {/* Período */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("period")}
        </span>
        <div
          role="group"
          aria-label={t("quickPeriod")}
          className="flex flex-wrap gap-1"
        >
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              type="button"
              variant={preset === p.id ? "default" : "outline"}
              onClick={() => onPreset(p.id)}
            >
              {p.label}
            </Button>
          ))}
          <Button
            size="sm"
            type="button"
            variant={preset === "custom" ? "default" : "outline"}
            onClick={() => setPreset("custom")}
          >
            {t("custom")}
          </Button>
        </div>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          className="ml-auto"
          aria-label={t("refresh")}
          onClick={() => load()}
        >
          <RefreshCw
            className={`size-4 ${loading ? "animate-spin" : ""}`}
            aria-hidden
          />
        </Button>
      </div>
      {preset === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1">
            {t("from")}
            <input
              type="date"
              value={range.desde}
              onChange={(e) => setRange({ ...range, desde: e.target.value })}
              className="border-input h-8 rounded-md border bg-transparent px-2 text-xs"
            />
          </label>
          <label className="flex items-center gap-1">
            {t("to")}
            <input
              type="date"
              value={range.hasta}
              onChange={(e) => setRange({ ...range, hasta: e.target.value })}
              className="border-input h-8 rounded-md border bg-transparent px-2 text-xs"
            />
          </label>
          <Button size="sm" type="button" onClick={() => load()}>
            {t("apply")}
          </Button>
        </div>
      )}

      {/* KPIs */}
      {kpis && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label={t("kpiActive")}
            value={String(kpis.total_clientes)}
            sub={t("kpiIncome", { total: fmtMoney(kpis.total_ingresos) })}
          />
          <KpiCard
            label={t("kpiNew")}
            value={String(kpis.nuevos)}
            sub={t("kpiRecurrent", { n: kpis.recurrentes })}
            tone="success"
          />
          <KpiCard
            label={t("kpiTicket")}
            value={fmtMoney(kpis.ticket_promedio)}
            sub={t("kpiPerTransfer")}
          />
          <KpiCard
            label={t("kpiTop20")}
            value={`${kpis.top20_pct}%`}
            sub={
              kpis.top20_pct >= 80
                ? t("kpiHighDep")
                : kpis.top20_pct >= 60
                  ? t("kpiPareto")
                  : t("kpiWell")
            }
            tone={kpis.top20_pct >= 80 ? "warning" : undefined}
          />
        </div>
      )}

      {/* Búsqueda */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="absolute top-2 left-2 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("search")}
            className="h-8 pl-8 text-sm"
          />
          {query && (
            <button
              type="button"
              aria-label={t("clearSearch")}
              onClick={() => setQuery("")}
              className="absolute top-2 right-2"
            >
              <X className="size-4 text-muted-foreground" aria-hidden />
            </button>
          )}
        </div>
        {query && (
          <span className="text-xs text-muted-foreground">
            {t("results", { n: filtered.length })}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div role="tablist" className="flex flex-wrap gap-1 border-b">
        <TabBtn
          active={tab === "ranking"}
          onClick={() => setTab("ranking")}
          Icon={Trophy}
          label={t("tabRanking")}
        />
        <TabBtn
          active={tab === "tend"}
          onClick={() => setTab("tend")}
          Icon={TrendingUp}
          label={t("tabTrends")}
          badge={tendRows.length || undefined}
        />
        <TabBtn
          active={tab === "rfm"}
          onClick={() => setTab("rfm")}
          Icon={Star}
          label={t("tabRfm")}
        />
        <TabBtn
          active={tab === "riesgo"}
          onClick={() => setTab("riesgo")}
          Icon={AlertTriangle}
          label={t("tabRisk")}
          badge={riesgo.length || undefined}
          alert={riesgo.length > 0}
        />
        <TabBtn
          active={tab === "pat"}
          onClick={() => setTab("pat")}
          Icon={LineChart}
          label={t("tabPatterns")}
        />
      </div>

      {loading && rows.length === 0 ? (
        <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" aria-hidden />{" "}
          {t("loading")}
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 size-6" aria-hidden />
          <p className="font-medium">{t("emptyTitle")}</p>
          <p>{t("emptyBody")}</p>
        </div>
      ) : (
        <>
          {tab === "ranking" && <RankingTab rows={filtered} onSelect={abrir} />}
          {tab === "tend" && <TendenciasTab rows={tendRows} onSelect={abrir} />}
          {tab === "rfm" && <RfmTab rows={rfmRows} onSelect={abrir} />}
          {tab === "riesgo" && <RiesgoTab rows={riesgo} onSelect={abrir} />}
          {tab === "pat" && <PatronesTab rows={rows} dias={dias} />}
        </>
      )}

      {ficha && (
        <FichaModal
          key={`${ficha.name}|${ficha.pan}`}
          clientName={ficha.name}
          panOrigen={ficha.pan}
          onClose={() => setFicha(null)}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: Readonly<{ label: string; value: string; sub: string; tone?: string }>) {
  return (
    <Card className={tone === "warning" ? "border-amber-500/40" : ""}>
      <CardContent className="pt-4">
        <p
          className={`text-2xl font-bold ${tone === "success" ? "text-success" : ""}`}
          data-numeric=""
        >
          {value}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className="text-xs text-muted-foreground italic">{sub}</p>
      </CardContent>
    </Card>
  );
}

function TabBtn({
  active,
  onClick,
  Icon,
  label,
  badge,
  alert,
}: Readonly<{
  active: boolean;
  onClick: () => void;
  Icon: typeof Trophy;
  label: string;
  badge?: number;
  alert?: boolean;
}>) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-1 border-b-2 px-3 py-2 font-mono text-[11px] uppercase ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
      {badge !== undefined && (
        <span
          className={`rounded-full px-1.5 text-[10px] ${
            alert ? "bg-destructive/15 text-destructive" : "bg-secondary"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ---------- Tabs ----------

function ClienteCell({ r }: Readonly<{ r: ClienteRow }>) {
  return (
    <div>
      <span className="font-semibold">{r.client_name}</span>
      {r.es_nuevo && (
        <span className="ml-1 rounded bg-success/15 px-1 font-mono text-[8.5px] uppercase text-success">
          NUEVO
        </span>
      )}
      {r.pan_origen && (
        <p className="font-mono text-[10.5px] text-muted-foreground">
          {r.pan_origen}
        </p>
      )}
    </div>
  );
}

function TelCell({ tel }: Readonly<{ tel: string | null }>) {
  if (!tel) return <>—</>;
  return (
    <a
      href={`tel:${tel}`}
      onClick={(e) => e.stopPropagation()}
      className="text-primary underline-offset-4 hover:underline"
    >
      {tel}
    </a>
  );
}

function RankingTab({
  rows,
  onSelect,
}: Readonly<{ rows: ClienteRow[]; onSelect: (r: ClienteRow) => void }>) {
  const t = useTranslations("app.topClients");
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-surface-100 text-left">
          <tr>
            <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              #
            </th>
            <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {t("colClient")}
            </th>
            <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
              {t("colTransfers")}
            </th>
            <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
              {t("colTotal")}
            </th>
            <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
              {t("colTicket")}
            </th>
            <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {t("colFrequency")}
            </th>
            <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {t("colLastOp")}
            </th>
            <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {t("colPhone")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr
              key={`${r.client_name}|${r.pan_origen}`}
              onClick={() => onSelect(r)}
              className={`cursor-pointer hover:bg-accent ${i < 3 ? "bg-primary/5" : ""}`}
            >
              <td className="px-2 py-2 text-center">
                {i === 0 ? (
                  <Trophy className="mx-auto size-4 text-primary" aria-hidden />
                ) : i === 1 ? (
                  <Star className="mx-auto size-4 opacity-70" aria-hidden />
                ) : i === 2 ? (
                  <Star className="mx-auto size-4 opacity-40" aria-hidden />
                ) : (
                  <span className="font-mono text-muted-foreground">
                    {i + 1}
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                <ClienteCell r={r} />
              </td>
              <td className="px-3 py-2 text-right" data-numeric="">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                  {r.num_ops}
                </span>
              </td>
              <td
                className="px-3 py-2 text-right font-mono font-semibold text-success"
                data-numeric=""
              >
                {fmtMoney(r.total_creditos)}
              </td>
              <td className="px-3 py-2 text-right font-mono" data-numeric="">
                {fmtMoney(r.ticket_promedio)}
              </td>
              <td className="px-3 py-2" data-numeric="">
                {r.dias_entre_ops_promedio !== null
                  ? t("everyNDays", { n: r.dias_entre_ops_promedio.toFixed(0) })
                  : "—"}
              </td>
              <td className="px-3 py-2" data-numeric="">
                {fmtDate(r.ultima_op)}
              </td>
              <td className="px-3 py-2">
                <TelCell tel={r.telefono} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TendenciasTab({
  rows,
  onSelect,
}: Readonly<{ rows: ClienteRow[]; onSelect: (r: ClienteRow) => void }>) {
  const t = useTranslations("app.topClients");
  const up = rows
    .filter((r) => r.delta_pct! > 0)
    .sort((a, b) => b.delta_pct! - a.delta_pct!)
    .slice(0, 10);
  const down = rows
    .filter((r) => r.delta_pct! < 0)
    .sort((a, b) => a.delta_pct! - b.delta_pct!)
    .slice(0, 10);

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        <TrendingUp className="mx-auto mb-2 size-6" aria-hidden />
        <p className="font-medium">{t("trendsEmptyTitle")}</p>
        <p>{t("trendsEmptyBody")}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <TendTable
        list={up}
        title={t("grewMost")}
        Icon={TrendingUp}
        tone="text-success"
        empty={t("noneGrew")}
        onSelect={onSelect}
      />
      <TendTable
        list={down}
        title={t("fellMost")}
        Icon={TrendingDown}
        tone="text-destructive"
        empty={t("noneFell")}
        onSelect={onSelect}
      />
    </div>
  );
}

function TendTable({
  list,
  title,
  Icon,
  tone,
  empty,
  onSelect,
}: Readonly<{
  list: ClienteRow[];
  title: string;
  Icon: typeof TrendingUp;
  tone: string;
  empty: string;
  onSelect: (r: ClienteRow) => void;
}>) {
  const t = useTranslations("app.topClients");
  return (
    <Card>
      <CardContent className="pt-4">
        <p
          className={`mb-2 flex items-center gap-1 text-sm font-semibold ${tone}`}
        >
          <Icon className="size-4" aria-hidden /> {title}
        </p>
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground">{empty}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  #
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t("colClient")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                  {t("colPrevMonth")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                  {t("colThisMonth")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                  Δ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.map((r, i) => (
                <tr
                  key={`${r.client_name}|${r.pan_origen}`}
                  onClick={() => onSelect(r)}
                  className="cursor-pointer hover:bg-accent"
                >
                  <td className="py-1.5 pr-2 font-mono text-muted-foreground">
                    {i + 1}
                  </td>
                  <td className="py-1.5 pr-2">
                    <ClienteCell r={r} />
                  </td>
                  <td
                    className="py-1.5 pr-2 text-right font-mono"
                    data-numeric=""
                  >
                    {fmtMoney(r.total_mes_anterior)}
                  </td>
                  <td
                    className="py-1.5 pr-2 text-right font-mono"
                    data-numeric=""
                  >
                    {fmtMoney(r.total_creditos)}
                  </td>
                  <td
                    className={`py-1.5 text-right font-semibold ${r.delta_pct! > 0 ? "text-success" : "text-destructive"}`}
                    data-numeric=""
                  >
                    {r.delta_pct! > 0 ? `+${r.delta_pct}%` : `${r.delta_pct}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function RfmTab({
  rows,
  onSelect,
}: Readonly<{ rows: RfmRow[]; onSelect: (r: ClienteRow) => void }>) {
  const t = useTranslations("app.topClients");
  const [seg, setSeg] = useState<Segment | "all">("all");
  const counts = new Map<Segment, number>();
  for (const r of rows) counts.set(r.segment, (counts.get(r.segment) ?? 0) + 1);
  const shown = (
    seg === "all" ? rows : rows.filter((r) => r.segment === seg)
  ).sort(
    (a, b) =>
      SEGMENT_ORDER.indexOf(a.segment) - SEGMENT_ORDER.indexOf(b.segment) ||
      b.total_creditos - a.total_creditos,
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        <Star className="mx-auto mb-2 size-6" aria-hidden />
        <p className="font-medium">{t("rfmEmptyTitle")}</p>
        <p>{t("rfmEmptyBody")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          type="button"
          variant={seg === "all" ? "default" : "outline"}
          onClick={() => setSeg("all")}
        >
          {t("all")} ({rows.length})
        </Button>
        {SEGMENT_ORDER.map((s) => {
          const n = counts.get(s) ?? 0;
          if (s === "regular" && n === 0) return null;
          const { label, Icon, color } = SEGMENT_META[s];
          return (
            <Button
              key={s}
              size="sm"
              type="button"
              variant={seg === s ? "default" : "outline"}
              onClick={() => setSeg(s)}
            >
              <Icon className={`size-3.5 ${color}`} aria-hidden /> {label} ({n})
            </Button>
          );
        })}
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-surface-100 text-left">
            <tr>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {t("colSegment")}
              </th>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {t("colClient")}
              </th>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                {t("colOps")}
              </th>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                {t("colTotal")}
              </th>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                {t("colTicket")}
              </th>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {t("colLastOp")}
              </th>
              <th
                className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted"
                title={t("rfmTooltip")}
              >
                RFM
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((r) => {
              const { label, Icon, color } = SEGMENT_META[r.segment];
              return (
                <tr
                  key={`${r.client_name}|${r.pan_origen}`}
                  onClick={() => onSelect(r)}
                  className="cursor-pointer hover:bg-accent"
                >
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1 text-xs">
                      <Icon className={`size-3.5 ${color}`} aria-hidden />{" "}
                      {label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <ClienteCell r={r} />
                  </td>
                  <td className="px-3 py-2 text-right" data-numeric="">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                      {r.num_ops}
                    </span>
                  </td>
                  <td
                    className="px-3 py-2 text-right font-mono font-semibold text-success"
                    data-numeric=""
                  >
                    {fmtMoney(r.total_creditos)}
                  </td>
                  <td
                    className="px-3 py-2 text-right font-mono"
                    data-numeric=""
                  >
                    {fmtMoney(r.ticket_promedio)}
                  </td>
                  <td className="px-3 py-2" data-numeric="">
                    {fmtDate(r.ultima_op)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs" data-numeric="">
                    R{r.r} F{r.f} M{r.m}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RiesgoTab({
  rows,
  onSelect,
}: Readonly<{ rows: RiesgoRow[]; onSelect: (r: ClienteRow) => void }>) {
  const t = useTranslations("app.topClients");
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        <Heart className="mx-auto mb-2 size-6 text-success" aria-hidden />
        <p className="font-medium">{t("riskEmptyTitle")}</p>
        <p>{t("riskEmptyBody")}</p>
      </div>
    );
  }
  const sevMeta = {
    critical: {
      label: t("sevCritical"),
      cls: "bg-destructive/15 text-destructive",
      border: "border-l-destructive",
    },
    high: {
      label: t("sevHigh"),
      cls: "bg-orange-500/15 text-orange-600",
      border: "border-l-orange-500",
    },
    medium: {
      label: t("sevMedium"),
      cls: "bg-secondary",
      border: "border-l-primary",
    },
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
        <AlertTriangle className="mt-0.5 size-4" aria-hidden />
        <div>
          <p className="font-medium">{t("riskBanner", { n: rows.length })}</p>
          <p className="text-xs text-muted-foreground">{t("riskBannerBody")}</p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-surface-100 text-left">
            <tr>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {t("colClient")}
              </th>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {t("colNormalFreq")}
              </th>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                {t("colNoOpsSince")}
              </th>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                {t("colOps")}
              </th>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                {t("colTotal")}
              </th>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {t("colSeverity")}
              </th>
              <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {t("colAction")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr
                key={`${r.client_name}|${r.pan_origen}`}
                onClick={() => onSelect(r)}
                className={`cursor-pointer border-l-2 hover:bg-accent ${sevMeta[r.sev].border}`}
              >
                <td className="px-3 py-2">
                  <ClienteCell r={r} />
                </td>
                <td className="px-3 py-2" data-numeric="">
                  {r.dias_entre_ops_promedio !== null
                    ? t("everyNDays", {
                        n: r.dias_entre_ops_promedio.toFixed(0),
                      })
                    : "—"}
                </td>
                <td
                  className="px-3 py-2 text-right font-semibold text-destructive"
                  data-numeric=""
                >
                  {r.dias_desde_ultima} d
                </td>
                <td className="px-3 py-2 text-right" data-numeric="">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                    {r.num_ops}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono" data-numeric="">
                  {fmtMoney(r.total_creditos)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${sevMeta[r.sev].cls}`}
                  >
                    {sevMeta[r.sev].label}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {r.telefono ? (
                    <a
                      href={`tel:${r.telefono}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                    >
                      <Phone className="size-3.5" aria-hidden /> {t("call")}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PatronesTab({
  rows,
  dias,
}: Readonly<{ rows: ClienteRow[]; dias: HeatmapDia[] }>) {
  const t = useTranslations("app.topClients");

  // Curva de Pareto (memo: la acumulación muta locales, fuera del render)
  const pareto = useMemo(() => {
    const sorted = [...rows].sort(
      (a, b) => b.total_creditos - a.total_creditos,
    );
    const total = sorted.reduce((a, r) => a + r.total_creditos, 0);
    const points = sorted.map((r, i) => {
      const acc = sorted
        .slice(0, i + 1)
        .reduce((a, x) => a + x.total_creditos, 0);
      return {
        xPct: ((i + 1) / sorted.length) * 100,
        yPct: total > 0 ? (acc / total) * 100 : 0,
      };
    });
    const at80 = points.find((p) => p.yPct >= 80) ?? null;
    return {
      points,
      at80,
      xAt80: at80 ? Math.round(at80.xPct) : null,
      count: sorted.length,
    };
  }, [rows]);
  const { points, at80, xAt80 } = pareto;
  const W = 480;
  const H = 200;
  const px = (p: { xPct: number; yPct: number }) =>
    `${(p.xPct / 100) * (W - 60) + 50},${H - 30 - (p.yPct / 100) * (H - 50)}`;

  const maxDia = Math.max(1, ...dias.map((d) => d.num_ops));
  const topDia = dias.reduce(
    (best, d) => (d.num_ops > best.num_ops ? d : best),
    { num_ops: 0, label: "", dia_sem: 0, total: 0 } as HeatmapDia,
  );

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardContent className="pt-4">
          <p className="mb-1 flex items-center gap-1 text-sm font-semibold">
            <LineChart className="size-4" aria-hidden /> {t("paretoTitle")}
          </p>
          {xAt80 !== null && (
            <p className="mb-2 text-xs text-muted-foreground">
              {t("paretoInsight", { x: xAt80 })}
            </p>
          )}
          {pareto.count < 5 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {t("paretoEmpty")}
            </p>
          ) : (
            <>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
                {[20, 40, 60, 80, 100].map((g) => {
                  const y = H - 30 - (g / 100) * (H - 50);
                  return (
                    <g key={g}>
                      <line
                        x1={50}
                        x2={W - 10}
                        y1={y}
                        y2={y}
                        stroke="currentColor"
                        strokeOpacity={g === 80 ? 0.5 : 0.12}
                        strokeDasharray={g === 80 ? "4 3" : undefined}
                      />
                      <text
                        x={44}
                        y={y + 3}
                        textAnchor="end"
                        fontSize={8}
                        fill="currentColor"
                        opacity={0.6}
                      >
                        {g}
                      </text>
                    </g>
                  );
                })}
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="text-primary"
                  points={points.map(px).join(" ")}
                />
                {at80 && (
                  <circle
                    cx={px(at80).split(",")[0]}
                    cy={px(at80).split(",")[1]}
                    r={3.5}
                    className="fill-primary"
                  />
                )}
                <text
                  x={W / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize={8}
                  fill="currentColor"
                  opacity={0.6}
                >
                  {t("paretoX")}
                </text>
              </svg>
              <p className="mt-1 text-xs text-muted-foreground">
                {xAt80 !== null && xAt80 <= 20
                  ? t("paretoHigh")
                  : xAt80 !== null && xAt80 <= 40
                    ? t("paretoTypical")
                    : t("paretoHealthy")}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <p className="mb-2 flex items-center gap-1 text-sm font-semibold">
            <Calendar className="size-4" aria-hidden /> {t("heatmapTitle")}
          </p>
          <div className="grid h-48 grid-cols-7 items-end gap-2">
            {dias.map((d) => (
              <div
                key={d.dia_sem}
                className="flex h-full flex-col items-center"
              >
                <span className="text-[10px] text-muted-foreground">
                  {d.label}
                </span>
                <div className="flex w-full flex-1 items-end rounded bg-muted/60">
                  <div
                    className="w-full rounded bg-primary"
                    style={{
                      height: `${(d.num_ops / maxDia) * 100}%`,
                      opacity: 0.3 + (d.num_ops / maxDia) * 0.7,
                    }}
                  />
                </div>
                <span className="font-mono text-[10px]" data-numeric="">
                  {d.num_ops}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {topDia.num_ops === 0
              ? t("heatmapEmpty")
              : t("heatmapTop", { label: topDia.label, n: topDia.num_ops })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
