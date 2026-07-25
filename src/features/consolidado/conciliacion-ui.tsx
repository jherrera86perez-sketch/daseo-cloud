"use client";

/**
 * Control de Caja — port fiel de Conciliacion/index.tsx + CobrosPanel.tsx
 * del ERP CubaOne: banco vs libros con 6 KPIs y diferencia, tabs
 * Banco/Libros/Cobros, importación individual y masiva al consolidado,
 * entradas manuales, edición/borrado con desvinculación, y conciliación
 * de cobros por transferencia con score 40/30/30 y auto-vinculación.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Landmark,
  BookOpenCheck,
  CreditCard,
  PencilLine,
  Trash2,
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
  NON_OPERATING_INCOME_CATEGORIES,
  NON_OPERATING_EXPENSE_CATEGORIES,
  SALES_CATEGORIES,
  DEDUCTIBLE_EXPENSE_CATEGORIES,
} from "@/lib/fiscal-categories";
import {
  resumenAction,
  bankMovementsAction,
  consolidadoAction,
  importarAction,
  importarMasivoAction,
  manualAction,
  editarEntradaAction,
  eliminarEntradaAction,
  cobrosAction,
  sugerenciasAction,
  asignarBancoAction,
  desasignarBancoAction,
  autoVincularAction,
} from "./actions";
import type { CobroPendiente, Sugerencia } from "./cobros";

const fmtMoney = (n: number | string) =>
  "$" +
  Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

type Resumen = Awaited<ReturnType<typeof resumenAction>>["resumen"];
type BancoRow = NonNullable<
  Awaited<ReturnType<typeof bankMovementsAction>>["rows"]
>[number];
type LibroRow = NonNullable<
  Awaited<ReturnType<typeof consolidadoAction>>["rows"]
>[number];

/**
 * sugerirCategoria del ERP (Conciliacion/index.tsx:141-209): primero los
 * patrones NO operativos, luego los operativos.
 */
function sugerirCategoria(mov: {
  operacion: string | null;
  observacion: string | null;
}): string {
  const obs = (mov.observacion ?? "").toUpperCase();
  const esCR = mov.operacion === "CR";
  if (obs.includes("PRESTAMO") || obs.includes("PRÉSTAMO")) {
    return esCR ? "Préstamo recibido" : "Préstamo otorgado";
  }
  if (obs.includes("TRANSFERENCIA ENTRE") || obs.includes("CUENTAS PROPIAS")) {
    return "Transferencia entre cuentas propias";
  }
  if (obs.includes("APORTE")) {
    return esCR ? "Aporte de capital" : "Retiro de capital";
  }
  if (obs.includes("REEMBOLSO")) {
    return esCR ? "Reembolso recibido" : "Devolución a cliente";
  }
  if (obs.includes("AJUSTE")) {
    return esCR ? "Ajuste bancario (a favor)" : "Ajuste bancario (en contra)";
  }
  if (esCR) {
    if (
      obs.includes("BANCAMOVIL") ||
      obs.includes("BANCA MOVIL") ||
      obs.includes("SWITCH")
    ) {
      return "Ventas Minoristas";
    }
    return "Otros Ingresos";
  }
  if (obs.includes("SALARIO") || obs.includes("NOMINA")) return "Salarios";
  if (obs.includes("IMPUESTO") || obs.includes("ONAT")) return "Impuestos";
  if (obs.includes("ELECTRIC") || obs.includes("UNE")) return "Electricidad";
  if (obs.includes("ETECSA")) return "Teléfono e Internet";
  if (obs.includes("CUPET")) return "Combustibles";
  if (obs.includes("ALQUILER")) return "Alquiler";
  if (obs.includes("MANTENIMIENTO")) return "Mantenimiento";
  return "Otros Gastos";
}

/** Select de categoría agrupado por impacto fiscal (index.tsx:46-70). */
function CategoriaSelect({
  tipo,
  value,
  onChange,
  labels,
}: Readonly<{
  tipo: "CR" | "DB";
  value: string;
  onChange: (v: string) => void;
  labels: { operativas: string; otras: string; noOperativas: string };
}>) {
  const grupos =
    tipo === "CR"
      ? ([
          [labels.operativas, SALES_CATEGORIES],
          [labels.otras, ["Otros Ingresos"]],
          [labels.noOperativas, NON_OPERATING_INCOME_CATEGORIES],
        ] as const)
      : ([
          [labels.operativas, DEDUCTIBLE_EXPENSE_CATEGORIES],
          [labels.otras, ["Impuestos", "General", "Otros Gastos"]],
          [labels.noOperativas, NON_OPERATING_EXPENSE_CATEGORIES],
        ] as const);
  const conocidas = new Set(
    tipo === "CR" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES,
  );
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-input h-8 w-full rounded-md border bg-transparent px-2 text-sm"
    >
      {value && !conocidas.has(value as never) && (
        <option value={value}>{value}</option>
      )}
      {grupos.map(([label, cats]) => (
        <optgroup key={label} label={label}>
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function ControlCajaView() {
  const t = useTranslations("app.reconciliation");
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [tab, setTab] = useState<"banco" | "libros" | "cobros">("banco");
  const [estado, setEstado] = useState<"todos" | "pendientes" | "conciliados">(
    "todos",
  );
  const [tipo, setTipo] = useState<"" | "CR" | "DB">("");
  const [search, setSearch] = useState("");

  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [banco, setBanco] = useState<{ rows: BancoRow[]; total: number }>({
    rows: [],
    total: 0,
  });
  const [libros, setLibros] = useState<{
    rows: LibroRow[];
    total: number;
    totalCR: string;
    totalDB: string;
  }>({ rows: [], total: 0, totalCR: "0.00", totalDB: "0.00" });
  const [cobros, setCobros] = useState<{
    pendientes: CobroPendiente[];
    vinculados: CobroPendiente[];
  }>({ pendientes: [], vinculados: [] });

  const [loading, startLoad] = useTransition();
  const [working, startWork] = useTransition();
  const [modal, setModal] = useState<
    | null
    | { kind: "manual" }
    | { kind: "registrar"; mov: BancoRow }
    | { kind: "editar"; entry: LibroRow }
  >(null);

  const months = t("months").split(",");
  const anios = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  function load(
    m = mes,
    a = anio,
    f: {
      estado?: typeof estado;
      tipo?: typeof tipo;
      search?: string;
    } = {},
  ) {
    const est = f.estado ?? estado;
    const tp = f.tipo ?? tipo;
    const q = f.search ?? search;
    startLoad(async () => {
      const [r, b, l, c] = await Promise.all([
        resumenAction(m, a),
        bankMovementsAction({
          mes: m,
          anio: a,
          estado: est,
          tipo: tp,
          search: q,
        }),
        consolidadoAction({ mes: m, anio: a, tipo: tp, search: q }),
        m !== 0
          ? cobrosAction(m, a)
          : Promise.resolve({ pendientes: [], vinculados: [] }),
      ]);
      if (r.error ?? b.error ?? l.error) {
        toast.error(
          t("loadError", { msg: r.error ?? b.error ?? l.error ?? "" }),
        );
        return;
      }
      setResumen(r.resumen ?? null);
      setBanco({ rows: b.rows ?? [], total: b.total ?? 0 });
      setLibros({
        rows: l.rows ?? [],
        total: l.total ?? 0,
        totalCR: l.totalCR ?? "0.00",
        totalDB: l.totalDB ?? "0.00",
      });
      if ("pendientes" in c) {
        setCobros({
          pendientes: c.pendientes ?? [],
          vinculados: c.vinculados ?? [],
        });
      }
    });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load(), []);

  function cambiarPeriodo(m: number, a: number) {
    setMes(m);
    setAnio(a);
    load(m, a);
  }
  function navegar(delta: number) {
    if (mes === 0) return cambiarPeriodo(0, anio + delta);
    let m = mes + delta;
    let a = anio;
    if (m < 1) {
      m = 12;
      a--;
    }
    if (m > 12) {
      m = 1;
      a++;
    }
    cambiarPeriodo(m, a);
  }

  function importarMasivo(operacion?: "CR" | "DB") {
    const n =
      operacion === "CR"
        ? resumen?.banco.pendientesCR
        : operacion === "DB"
          ? resumen?.banco.pendientesDB
          : resumen?.banco.pendientes;
    const etiqueta =
      operacion === "CR"
        ? t("creditosLabel")
        : operacion === "DB"
          ? t("debitosLabel")
          : t("movimientosLabel");
    if (
      !window.confirm(
        t("bulkConfirm", {
          n: n ?? 0,
          etiqueta,
          mes: months[mes - 1] ?? String(mes),
          anio,
        }),
      )
    ) {
      return;
    }
    startWork(async () => {
      const res = await importarMasivoAction(mes, anio, operacion);
      if (res.error) {
        if (res.error === "No hay movimientos pendientes para este período") {
          toast.info(t("noPendingOfType"));
        } else {
          toast.error(res.error);
        }
        return;
      }
      toast.success(t("bulkImported", { n: res.importados ?? 0, etiqueta }));
      load();
    });
  }

  function eliminarEntrada(id: string) {
    if (!window.confirm(t("deleteEntryConfirm"))) return;
    startWork(async () => {
      const res = await eliminarEntradaAction(id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success(t("deleted"));
        load();
      }
    });
  }

  const pendientes = resumen?.banco.pendientes ?? 0;
  const cuadrado = resumen?.cuadrado ?? false;

  return (
    <div className="flex flex-col gap-4">
      {/* Header actions + período */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={() => setModal({ kind: "manual" })}
        >
          <PencilLine className="size-4" aria-hidden />
          {t("manualEntry")}
        </Button>
        <Button
          size="sm"
          type="button"
          disabled={working || mes === 0 || pendientes === 0}
          onClick={() => importarMasivo()}
        >
          {working ? t("importing") : t("importAll", { n: pendientes })}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          aria-label={t("refresh")}
          onClick={() => load()}
        >
          <RefreshCw
            className={`size-4 ${loading ? "animate-spin" : ""}`}
            aria-hidden
          />
        </Button>
        <span className="mx-2 hidden border-l sm:inline" aria-hidden />
        <Button
          size="sm"
          variant="ghost"
          type="button"
          aria-label={t("prevPeriod")}
          onClick={() => navegar(-1)}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <select
          aria-label={t("month")}
          value={mes}
          onChange={(e) => cambiarPeriodo(parseInt(e.target.value, 10), anio)}
          className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value={0}>{t("allMonths")}</option>
          {months.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select
          aria-label={t("year")}
          value={anio}
          onChange={(e) => cambiarPeriodo(mes, parseInt(e.target.value, 10))}
          className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
        >
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          aria-label={t("nextPeriod")}
          onClick={() => navegar(1)}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      {/* KPIs */}
      {resumen && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {(
            [
              [t("kpiBankIn"), fmtMoney(resumen.banco.ingresos), ""],
              [t("kpiBankOut"), fmtMoney(resumen.banco.egresos), ""],
              [t("kpiBankBalance"), fmtMoney(resumen.banco.saldo), ""],
              [t("kpiBooksIn"), fmtMoney(resumen.libros.ingresos), ""],
              [t("kpiBooksOut"), fmtMoney(resumen.libros.egresos), ""],
            ] as const
          ).map(([label, value]) => (
            <Card key={label}>
              <CardContent className="pt-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {label}
                </p>
                <p className="text-lg font-bold" data-numeric="">
                  {value}
                </p>
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardContent className="pt-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {cuadrado ? t("kpiSquared") : t("kpiDifference")}
              </p>
              <p
                className={`flex items-center gap-1 text-lg font-bold ${cuadrado ? "text-success" : "text-amber-500"}`}
                data-numeric=""
              >
                {cuadrado ? (
                  <CheckCircle2 className="size-4" aria-hidden />
                ) : (
                  <AlertTriangle className="size-4" aria-hidden />
                )}
                {fmtMoney(Math.abs(Number(resumen.diferencia)))}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Banners */}
      {resumen && pendientes > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span>
            {t("pendingBanner", {
              n: pendientes,
              cr: resumen.banco.pendientesCR,
              db: resumen.banco.pendientesDB,
            })}
          </span>
          {mes !== 0 && (
            <span className="ml-auto flex gap-1">
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={working || resumen.banco.pendientesCR === 0}
                onClick={() => importarMasivo("CR")}
              >
                {t("importCredits", { n: resumen.banco.pendientesCR })}
              </Button>
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={working || resumen.banco.pendientesDB === 0}
                onClick={() => importarMasivo("DB")}
              >
                {t("importDebits", { n: resumen.banco.pendientesDB })}
              </Button>
            </span>
          )}
        </div>
      )}
      {cobros.pendientes.length > 0 && tab !== "cobros" && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm">
          <CreditCard className="size-4 shrink-0" aria-hidden />
          <span>{t("cobrosBanner", { n: cobros.pendientes.length })}</span>
          <Button
            size="sm"
            variant="outline"
            type="button"
            className="ml-auto"
            onClick={() => setTab("cobros")}
          >
            {t("reviewCobros")}
          </Button>
        </div>
      )}
      {resumen && cuadrado && resumen.banco.total > 0 && pendientes === 0 && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          {t("squaredBanner")}
        </div>
      )}

      {/* Tabs + filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5">
          {(
            [
              ["banco", Landmark, t("tabBank", { n: banco.total })],
              ["libros", BookOpenCheck, t("tabBooks", { n: libros.total })],
              ["cobros", CreditCard, t("tabCobros")],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex items-center gap-1 rounded px-3 py-1 text-sm ${tab === key ? "bg-secondary font-medium" : "text-muted-foreground"}`}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
        {tab === "banco" && (
          <select
            aria-label={t("stateFilter")}
            value={estado}
            onChange={(e) => {
              const v = e.target.value as typeof estado;
              setEstado(v);
              load(mes, anio, { estado: v });
            }}
            className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="todos">{t("stateAll")}</option>
            <option value="pendientes">{t("statePending")}</option>
            <option value="conciliados">{t("stateReconciled")}</option>
          </select>
        )}
        {tab !== "cobros" && (
          <select
            aria-label={t("typeFilter")}
            value={tipo}
            onChange={(e) => {
              const v = e.target.value as typeof tipo;
              setTipo(v);
              load(mes, anio, { tipo: v });
            }}
            className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="">{t("typeBoth")}</option>
            <option value="CR">{t("typeIn")}</option>
            <option value="DB">{t("typeOut")}</option>
          </select>
        )}
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            load(mes, anio, { search: e.target.value });
          }}
          placeholder={
            tab === "cobros" ? t("searchCobros") : t("searchPlaceholder")
          }
          className="h-8 min-w-48 flex-1 text-sm"
        />
      </div>

      {/* Contenido del tab */}
      {tab === "banco" && (
        <BancoTable
          rows={banco.rows}
          onRegistrar={(mov) => setModal({ kind: "registrar", mov })}
        />
      )}
      {tab === "libros" && (
        <LibrosTable
          rows={libros.rows}
          totalCR={libros.totalCR}
          totalDB={libros.totalDB}
          titulo={t("booksTitle", {
            mes: mes === 0 ? t("allMonths") : months[mes - 1],
            anio,
          })}
          onEditar={(entry) => setModal({ kind: "editar", entry })}
          onEliminar={eliminarEntrada}
        />
      )}
      {tab === "cobros" && (
        <CobrosPanel
          mes={mes}
          anio={anio}
          pendientes={cobros.pendientes}
          vinculados={cobros.vinculados}
          search={search}
          onChanged={() => load()}
        />
      )}

      {modal?.kind === "manual" && (
        <ManualModal onClose={() => setModal(null)} onSaved={() => load()} />
      )}
      {modal?.kind === "registrar" && (
        <RegistrarModal
          mov={modal.mov}
          onClose={() => setModal(null)}
          onSaved={() => load()}
        />
      )}
      {modal?.kind === "editar" && (
        <EditarModal
          entry={modal.entry}
          onClose={() => setModal(null)}
          onSaved={() => load()}
        />
      )}
    </div>
  );
}

// ---------- Tabla Banco ----------

function BancoTable({
  rows,
  onRegistrar,
}: Readonly<{ rows: BancoRow[]; onRegistrar: (m: BancoRow) => void }>) {
  const t = useTranslations("app.reconciliation");
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          🏦 {t("emptyBank")}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted text-left">
              <tr>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t("colDate")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t("colType")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t("colRef")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t("colObs")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                  {t("colAmount")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t("colState")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t("colCategory")}
                </th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((m) => (
                <tr key={m.id} className={m.conciliado ? "opacity-60" : ""}>
                  <td className="px-2 py-1.5 font-mono text-xs">{m.fecha}</td>
                  <td className="px-2 py-1.5">
                    <TipoBadge tipo={m.operacion} />
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs">
                    {m.referencia ? m.referencia.slice(-8) : "—"}
                  </td>
                  <td className="max-w-72 truncate px-2 py-1.5 text-xs">
                    {m.clientName || m.observacion || "—"}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right font-mono ${m.operacion === "CR" ? "text-success" : "text-destructive"}`}
                    data-numeric=""
                  >
                    {fmtMoney(m.importe ?? 0)}
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    {m.conciliado ? (
                      <span className="text-success">{t("inBooks")}</span>
                    ) : (
                      <span className="text-muted-foreground">
                        {t("pendingState")}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">
                    {m.categoria ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {!m.conciliado && (
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() => onRegistrar(m)}
                      >
                        {t("register")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function TipoBadge({ tipo }: Readonly<{ tipo: string | null }>) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${tipo === "CR" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}
    >
      {tipo ?? "—"}
    </span>
  );
}

// ---------- Tabla Libros ----------

function LibrosTable({
  rows,
  totalCR,
  totalDB,
  titulo,
  onEditar,
  onEliminar,
}: Readonly<{
  rows: LibroRow[];
  totalCR: string;
  totalDB: string;
  titulo: string;
  onEditar: (e: LibroRow) => void;
  onEliminar: (id: string) => void;
}>) {
  const t = useTranslations("app.reconciliation");
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <p>📒 {t("emptyBooks")}</p>
          <p>{t("emptyBooksHint")}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="mb-2 text-sm font-semibold">{titulo}</p>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted text-left">
              <tr>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t("colDate")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t("colType")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                  {t("colAmount")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t("colCategory")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t("colSubcategory")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t("colDesc")}
                </th>
                <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t("colOrigin")}
                </th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-2 py-1.5 font-mono text-xs">{r.fecha}</td>
                  <td className="px-2 py-1.5">
                    <TipoBadge tipo={r.tipo} />
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right font-mono ${r.tipo === "CR" ? "text-success" : "text-destructive"}`}
                    data-numeric=""
                  >
                    {fmtMoney(r.importe)}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">
                      {r.categoria ?? "—"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-xs" title={r.detalle ?? ""}>
                    {r.subcategoria ? (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-600 dark:text-amber-400">
                        {r.subcategoria}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-64 truncate px-2 py-1.5 text-xs text-muted-foreground">
                    {r.clienteNombre || r.observaciones || "—"}
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    <span className="rounded-full bg-secondary px-2 py-0.5">
                      {r.origen === "banco"
                        ? "BPA"
                        : r.origen === "manual"
                          ? t("originManual")
                          : r.origen}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      aria-label={t("edit")}
                      onClick={() => onEditar(r)}
                    >
                      <PencilLine className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      aria-label={t("delete")}
                      onClick={() => onEliminar(r.id)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/50 text-xs">
              <tr>
                <td colSpan={2} className="px-2 py-1.5 font-medium">
                  {t("totals")}
                </td>
                <td
                  className="px-2 py-1.5 text-right font-mono"
                  data-numeric=""
                >
                  <span className="text-success">+{fmtMoney(totalCR)}</span>{" "}
                  <span className="text-destructive">-{fmtMoney(totalDB)}</span>
                </td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Panel de Cobros (CobrosPanel del ERP) ----------

function CobrosPanel({
  mes,
  anio,
  pendientes,
  vinculados,
  search,
  onChanged,
}: Readonly<{
  mes: number;
  anio: number;
  pendientes: CobroPendiente[];
  vinculados: CobroPendiente[];
  search: string;
  onChanged: () => void;
}>) {
  const t = useTranslations("app.reconciliation");
  const [minScore, setMinScore] = useState(85);
  const [ultimaCorrida, setUltimaCorrida] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [verVinculados, setVerVinculados] = useState(false);
  const [working, startWork] = useTransition();

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pendientes;
    return pendientes.filter((c) =>
      `${c.clienteNombre} ${c.saleLabel} ${c.monto}`.toLowerCase().includes(q),
    );
  }, [pendientes, search]);

  function toggleSugerencias(c: CobroPendiente) {
    if (abierto === c.paymentId) {
      setAbierto(null);
      return;
    }
    startWork(async () => {
      const res = await sugerenciasAction(c.paymentId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setSugerencias(res.sugerencias ?? []);
      setAbierto(c.paymentId);
    });
  }

  function vincular(paymentId: string, s: Sugerencia) {
    startWork(async () => {
      const res = await asignarBancoAction(paymentId, s.movimientoId, s.score);
      if (res?.error) toast.error(t("linkError"));
      else {
        toast.success(t("linked"));
        setAbierto(null);
        onChanged();
      }
    });
  }

  function desvincular(paymentId: string) {
    if (!window.confirm(t("unlinkConfirm"))) return;
    startWork(async () => {
      const res = await desasignarBancoAction(paymentId);
      if (res?.error) toast.error(res.error);
      else {
        toast.success(t("unlinked"));
        onChanged();
      }
    });
  }

  function correr(dryRun: boolean) {
    if (mes === 0) return;
    startWork(async () => {
      const res = await autoVincularAction({ mes, anio, minScore, dryRun });
      if (res.error || !res.resultado) {
        toast.error(res.error ?? "error");
        return;
      }
      const r = res.resultado;
      if (r.procesados === 0) {
        toast.info(t("noCobrosPending"));
        return;
      }
      if (dryRun) {
        toast.info(t("previewResult", { v: r.vinculados, o: r.omitidos }));
      } else {
        toast.success(t("autoLinked", { n: r.vinculados }));
        onChanged();
      }
      setUltimaCorrida(
        t("lastRun", {
          p: r.procesados,
          v: r.vinculados,
          o: r.omitidos,
        }),
      );
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm font-semibold">
            {t("cobrosTitle", {
              periodo: `${String(mes).padStart(2, "0")}/${anio}`,
            })}
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            {t("cobrosSubtitle")}
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <span>{t("autoLinkLabel")}</span>
            <select
              aria-label={t("autoLinkLabel")}
              value={minScore}
              onChange={(e) => setMinScore(parseInt(e.target.value, 10))}
              className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
            >
              <option value={95}>{t("score95")}</option>
              <option value={85}>{t("score85")}</option>
              <option value={75}>{t("score75")}</option>
            </select>
            <span>{t("autoLinkSuffix")}</span>
            <span className="ml-auto flex gap-1">
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={working || mes === 0}
                onClick={() => correr(true)}
              >
                {t("preview")}
              </Button>
              <Button
                size="sm"
                type="button"
                disabled={working || mes === 0}
                onClick={() => correr(false)}
              >
                {t("runAutoLink")}
              </Button>
            </span>
          </div>
          {ultimaCorrida && (
            <p className="mb-3 text-xs text-muted-foreground">
              {ultimaCorrida}
            </p>
          )}

          {filtrados.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              🎉 {t("allReconciled")}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted text-left">
                  <tr>
                    <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                      {t("colCobroDate")}
                    </th>
                    <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                      {t("colClient")}
                    </th>
                    <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                      {t("colSale")}
                    </th>
                    <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                      {t("colTransfer")}
                    </th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtrados.map((c) => (
                    <BodyCobro
                      key={c.paymentId}
                      cobro={c}
                      abierto={abierto === c.paymentId}
                      sugerencias={sugerencias}
                      working={working}
                      onToggle={() => toggleSugerencias(c)}
                      onVincular={(s) => vincular(c.paymentId, s)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {vinculados.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <button
              type="button"
              className="flex w-full items-center justify-between text-sm font-semibold"
              onClick={() => setVerVinculados((v) => !v)}
            >
              {t("linkedSection", { n: vinculados.length })}
              <span aria-hidden>{verVinculados ? "▲" : "▼"}</span>
            </button>
            {verVinculados && (
              <ul className="mt-2 flex flex-col divide-y text-sm">
                {vinculados.map((c) => (
                  <li
                    key={c.paymentId}
                    className="flex flex-wrap items-center gap-2 py-2"
                  >
                    <span className="font-mono text-xs">{c.fecha}</span>
                    <span className="font-medium">{c.clienteNombre}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.saleLabel}
                    </span>
                    <span className="font-mono text-xs" data-numeric="">
                      {fmtMoney(c.monto)}
                    </span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                      {c.bancoMatchScore != null
                        ? t("scoreAuto", { n: c.bancoMatchScore })
                        : t("scoreManual")}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      className="ml-auto"
                      disabled={working}
                      onClick={() => desvincular(c.paymentId)}
                    >
                      {t("unlink")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BodyCobro({
  cobro,
  abierto,
  sugerencias,
  working,
  onToggle,
  onVincular,
}: Readonly<{
  cobro: CobroPendiente;
  abierto: boolean;
  sugerencias: Sugerencia[];
  working: boolean;
  onToggle: () => void;
  onVincular: (s: Sugerencia) => void;
}>) {
  const t = useTranslations("app.reconciliation");
  return (
    <>
      <tr>
        <td className="px-2 py-1.5 font-mono text-xs">{cobro.fecha}</td>
        <td className="px-2 py-1.5">{cobro.clienteNombre}</td>
        <td className="px-2 py-1.5 font-mono text-xs">{cobro.saleLabel}</td>
        <td className="px-2 py-1.5 text-right font-mono" data-numeric="">
          {fmtMoney(cobro.monto)}
        </td>
        <td className="px-2 py-1.5 text-right">
          <Button
            size="sm"
            variant="outline"
            type="button"
            disabled={working}
            onClick={onToggle}
          >
            {abierto ? t("hideSuggestions") : t("suggestions")}
          </Button>
        </td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={5} className="bg-muted/40 px-3 py-2">
            {sugerencias.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                🔍 {t("noSuggestions")}
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1">{t("colMatch")}</th>
                    <th className="px-2 py-1">{t("colDate")}</th>
                    <th className="px-2 py-1">{t("colHolder")}</th>
                    <th className="px-2 py-1 text-right">{t("colAmount")}</th>
                    <th className="px-2 py-1" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sugerencias.map((s) => (
                    <tr key={s.movimientoId}>
                      <td className="px-2 py-1">
                        <span
                          className={`rounded-full px-2 py-0.5 ${s.score >= 80 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : s.score >= 50 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-secondary"}`}
                          title={s.matchReason ?? ""}
                        >
                          {s.score}%
                        </span>
                      </td>
                      <td className="px-2 py-1 font-mono">{s.fecha}</td>
                      <td className="max-w-64 truncate px-2 py-1">
                        {s.titular || s.observacion || "—"}
                      </td>
                      <td
                        className="px-2 py-1 text-right font-mono"
                        data-numeric=""
                      >
                        {fmtMoney(s.importe)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <Button
                          size="sm"
                          type="button"
                          disabled={working}
                          onClick={() => onVincular(s)}
                        >
                          {t("link")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ---------- Modales ----------

function ModalShell({
  title,
  onClose,
  children,
}: Readonly<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}>) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-lg border bg-background p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button size="sm" variant="ghost" type="button" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ManualModal({
  onClose,
  onSaved,
}: Readonly<{ onClose: () => void; onSaved: () => void }>) {
  const t = useTranslations("app.reconciliation");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState<"CR" | "DB">("DB");
  const [importe, setImporte] = useState("");
  const [categoria, setCategoria] = useState("Otros Gastos");
  const [observaciones, setObservaciones] = useState("");
  const [cliente, setCliente] = useState("");
  const [referencia, setReferencia] = useState("");
  const [subcategoria, setSubcategoria] = useState("");
  const [detalle, setDetalle] = useState("");
  const [saving, startSave] = useTransition();
  const groupLabels = {
    operativas: t("catGroupOperating"),
    otras: t("catGroupOther"),
    noOperativas: t("catGroupNonOperating"),
  };

  function submit() {
    if (!fecha || !importe) {
      toast.error(t("manualRequired"));
      return;
    }
    startSave(async () => {
      const res = await manualAction({
        fechaContable: fecha,
        tipoTransaccion: tipo,
        importe,
        categoria,
        observaciones: observaciones || null,
        clienteNombre: cliente || null,
        referencia: referencia || null,
        subcategoria: subcategoria || null,
        detalle: detalle || null,
      });
      if (res?.error) toast.error(res.error);
      else {
        toast.success(t("manualCreated"));
        onSaved();
        onClose();
      }
    });
  }

  return (
    <ModalShell title={t("manualEntryTitle")} onClose={onClose}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("colDate")}</span>
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="h-8"
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("colType")}</span>
          <div className="flex gap-1">
            {(["CR", "DB"] as const).map((tp) => (
              <Button
                key={tp}
                size="sm"
                type="button"
                variant={tipo === tp ? "default" : "outline"}
                onClick={() => {
                  setTipo(tp);
                  setCategoria(tp === "CR" ? "Otros Ingresos" : "Otros Gastos");
                }}
              >
                {tp === "CR" ? t("typeIn") : t("typeOut")}
              </Button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t("colAmount")}
          </span>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            placeholder="0.00"
            className="h-8"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t("colCategory")}
          </span>
          <CategoriaSelect
            tipo={tipo}
            value={categoria}
            onChange={setCategoria}
            labels={groupLabels}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t("colSubcategory")}
          </span>
          <Input
            value={subcategoria}
            onChange={(e) => setSubcategoria(e.target.value)}
            className="h-8"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t("colDetail")}
          </span>
          <Input
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            className="h-8"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t("colClient")}
          </span>
          <Input
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            className="h-8"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("colRef")}</span>
          <Input
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            className="h-8"
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs text-muted-foreground">{t("colObs")}</span>
          <Input
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            className="h-8"
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="outline" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="button" disabled={saving} onClick={submit}>
          {saving ? "…" : t("save")}
        </Button>
      </div>
    </ModalShell>
  );
}

function RegistrarModal({
  mov,
  onClose,
  onSaved,
}: Readonly<{
  mov: BancoRow;
  onClose: () => void;
  onSaved: () => void;
}>) {
  const t = useTranslations("app.reconciliation");
  const tipo: "CR" | "DB" = mov.operacion === "DB" ? "DB" : "CR";
  const [categoria, setCategoria] = useState(
    sugerirCategoria({
      operacion: mov.operacion,
      observacion: mov.observacion,
    }),
  );
  const [observaciones, setObservaciones] = useState(mov.observacion ?? "");
  const [subcategoria, setSubcategoria] = useState("");
  const [detalle, setDetalle] = useState("");
  const [saving, startSave] = useTransition();
  const groupLabels = {
    operativas: t("catGroupOperating"),
    otras: t("catGroupOther"),
    noOperativas: t("catGroupNonOperating"),
  };

  function submit() {
    startSave(async () => {
      const res = await importarAction({
        movimientoId: mov.id,
        categoria,
        observaciones: observaciones || null,
        subcategoria: subcategoria || null,
        detalle: detalle || null,
      });
      if (res?.error) toast.error(res.error);
      else {
        toast.success(t("imported"));
        onSaved();
        onClose();
      }
    });
  }

  return (
    <ModalShell title={t("registerTitle")} onClose={onClose}>
      <p className="mb-3 rounded-md border bg-muted/40 px-3 py-2 text-xs">
        {mov.fecha} · <TipoBadge tipo={mov.operacion} /> ·{" "}
        <span className="font-mono" data-numeric="">
          {fmtMoney(mov.importe ?? 0)}
        </span>{" "}
        · {mov.clientName || mov.observacion || "—"}
      </p>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t("colCategory")}
          </span>
          <CategoriaSelect
            tipo={tipo}
            value={categoria}
            onChange={setCategoria}
            labels={groupLabels}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t("colSubcategory")}
          </span>
          <Input
            value={subcategoria}
            onChange={(e) => setSubcategoria(e.target.value)}
            className="h-8"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t("colDetail")}
          </span>
          <Input
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            className="h-8"
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs text-muted-foreground">{t("colObs")}</span>
          <Input
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            className="h-8"
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="outline" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="button" disabled={saving} onClick={submit}>
          <Plus className="size-4" aria-hidden />
          {saving ? "…" : t("register")}
        </Button>
      </div>
    </ModalShell>
  );
}

function EditarModal({
  entry,
  onClose,
  onSaved,
}: Readonly<{
  entry: LibroRow;
  onClose: () => void;
  onSaved: () => void;
}>) {
  const t = useTranslations("app.reconciliation");
  const tipo: "CR" | "DB" = entry.tipo === "DB" ? "DB" : "CR";
  const [categoria, setCategoria] = useState(entry.categoria ?? "");
  const [observaciones, setObservaciones] = useState(entry.observaciones ?? "");
  const [cliente, setCliente] = useState(entry.clienteNombre ?? "");
  const [subcategoria, setSubcategoria] = useState(entry.subcategoria ?? "");
  const [detalle, setDetalle] = useState(entry.detalle ?? "");
  const [saving, startSave] = useTransition();
  const groupLabels = {
    operativas: t("catGroupOperating"),
    otras: t("catGroupOther"),
    noOperativas: t("catGroupNonOperating"),
  };

  function submit() {
    startSave(async () => {
      const res = await editarEntradaAction(entry.id, {
        categoria: categoria || null,
        observaciones: observaciones || null,
        clienteNombre: cliente || null,
        subcategoria: subcategoria || null,
        detalle: detalle || null,
      });
      if (res?.error) toast.error(res.error);
      else {
        toast.success(t("updated"));
        onSaved();
        onClose();
      }
    });
  }

  return (
    <ModalShell title={t("editTitle")} onClose={onClose}>
      <p className="mb-3 rounded-md border bg-muted/40 px-3 py-2 text-xs">
        {entry.fecha} · <TipoBadge tipo={entry.tipo} /> ·{" "}
        <span className="font-mono" data-numeric="">
          {fmtMoney(entry.importe)}
        </span>{" "}
        · {entry.referencia ?? "—"} ·{" "}
        {entry.origen === "banco" ? "BPA" : entry.origen}
      </p>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t("colCategory")}
          </span>
          <CategoriaSelect
            tipo={tipo}
            value={categoria}
            onChange={setCategoria}
            labels={groupLabels}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t("colSubcategory")}
          </span>
          <Input
            value={subcategoria}
            onChange={(e) => setSubcategoria(e.target.value)}
            className="h-8"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t("colDetail")}
          </span>
          <Input
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            className="h-8"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t("colClient")}
          </span>
          <Input
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            className="h-8"
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs text-muted-foreground">{t("colObs")}</span>
          <Input
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            className="h-8"
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="outline" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="button" disabled={saving} onClick={submit}>
          {saving ? "…" : t("save")}
        </Button>
      </div>
    </ModalShell>
  );
}
