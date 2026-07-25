"use client";

/**
 * Salidas Internas — port fiel de SalidasInternas.tsx del ERP CubaOne:
 * filtros Desde/Hasta + búsqueda + tipo, 4 tarjetas de resumen sobre lo
 * filtrado, tabla con editar/eliminar (reversión íntegra) y modal con
 * toggles de tipo, líneas de producto con stock visible y efectivo→banco.
 */
import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { HeartHandshake, Plus, PencilLine, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  createOutflowAction,
  updateOutflowAction,
  deleteOutflowAction,
  type OutflowFormInput,
} from "./actions";

const fmtMoney = (n: number | string) =>
  "$" +
  Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export type OutflowItemDto = {
  productId: string;
  productName: string | null;
  qty: string;
  unit: string | null;
  totalCost: string; // decimal
};

export type OutflowDto = {
  id: string;
  fecha: string; // YYYY-MM-DD
  tipo: string;
  destino: string | null;
  motivo: string | null;
  notas: string | null;
  montoEfectivo: string; // decimal
  valorProductos: string; // decimal
  items: OutflowItemDto[];
};

export type ProductOpt = {
  id: string;
  name: string;
  unit: string;
  balance: string;
  avgCost: string; // decimal por unidad
};

const TIPOS = ["DONACION", "REGALO", "AUTOCONSUMO", "TRABAJADORES"] as const;
const BADGE_CLASS: Record<string, string> = {
  DONACION: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  REGALO: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  AUTOCONSUMO: "bg-secondary text-foreground",
  TRABAJADORES: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function primerDiaMes(): string {
  return hoyIso().slice(0, 8) + "01";
}

export function OutflowsView({
  rows,
  products,
}: Readonly<{
  rows: OutflowDto[];
  products: ProductOpt[];
}>) {
  const t = useTranslations("app.internalOutflows");
  const [desde, setDesde] = useState(primerDiaMes);
  const [hasta, setHasta] = useState(hoyIso);
  const [busqueda, setBusqueda] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  // null = cerrado; "new" = alta; OutflowDto = edición (remount por key)
  const [modal, setModal] = useState<"new" | OutflowDto | null>(null);
  const [deleting, startDelete] = useTransition();

  const tipoLabel = (tipo: string) => t(`tipos.${tipo}`);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return rows.filter((s) => {
      if (desde && s.fecha < desde) return false;
      if (hasta && s.fecha > hasta) return false;
      if (tipoFiltro && s.tipo !== tipoFiltro) return false;
      if (!q) return true;
      const haystack = [
        s.destino,
        s.motivo,
        s.notas,
        ...s.items.map((i) => i.productName),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, desde, hasta, tipoFiltro, busqueda]);

  const resumen = useMemo(() => {
    let valor = 0;
    let efectivo = 0;
    let cantidad = 0;
    for (const s of filtradas) {
      valor += Number(s.valorProductos);
      efectivo += Number(s.montoEfectivo);
      for (const i of s.items) cantidad += Number(i.qty);
    }
    return { valor, efectivo, cantidad, total: valor + efectivo };
  }, [filtradas]);

  function handleDelete(s: OutflowDto) {
    const quien = s.destino ? " · " + s.destino : "";
    if (!window.confirm(t("deleteConfirm", { tipo: tipoLabel(s.tipo), quien })))
      return;
    startDelete(async () => {
      const res = await deleteOutflowAction(s.id);
      if (res?.error) toast.error(res.error);
      else toast.success(t("deleted"));
    });
  }

  const hayFiltros = Boolean(busqueda.trim() || tipoFiltro);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("from")}
          <Input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="h-8 w-40 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("to")}
          <Input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="h-8 w-40 text-sm"
          />
        </label>
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-8 min-w-56 flex-1 text-sm"
        />
        <select
          aria-label={t("typeFilter")}
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value)}
          className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="">{t("allTypes")}</option>
          {TIPOS.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipoLabel(tipo)}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" onClick={() => setModal("new")}>
          <Plus className="size-4" aria-hidden />
          {t("newOutflow")}
        </Button>
      </div>

      {/* Tarjetas de resumen (sobre lo filtrado, como el ERP) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["cardProducts", fmtMoney(resumen.valor)],
            ["cardCash", fmtMoney(resumen.efectivo)],
            ["cardQty", resumen.cantidad.toLocaleString("en-US")],
            ["cardTotal", fmtMoney(resumen.total)],
          ] as const
        ).map(([key, value]) => (
          <Card key={key}>
            <CardContent className="pt-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t(key)}
              </p>
              <p className="t-num-display text-[22px]" data-numeric="">
                {value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabla */}
      <Card>
        <CardContent className="pt-4">
          {filtradas.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <HeartHandshake className="mx-auto mb-2 size-6" aria-hidden />
              <p className="font-medium text-foreground">
                {hayFiltros ? t("emptyFilteredTitle") : t("emptyTitle")}
              </p>
              <p>{hayFiltros ? t("emptyFilteredBody") : t("emptyBody")}</p>
            </div>
          ) : (
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
                      {t("colDestination")}
                    </th>
                    <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                      {t("colProducts")}
                    </th>
                    <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                      {t("colProductsValue")}
                    </th>
                    <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                      {t("colCash")}
                    </th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {filtradas.map((s) => (
                    <tr key={s.id}>
                      <td className="px-2 py-1.5 font-mono text-xs">
                        {s.fecha}
                      </td>
                      <td className="px-2 py-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${BADGE_CLASS[s.tipo] ?? "bg-secondary"}`}
                        >
                          {tipoLabel(s.tipo)}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">{s.destino || "—"}</td>
                      <td className="max-w-72 truncate px-2 py-1.5 text-xs text-muted-foreground">
                        {s.items.length > 0
                          ? s.items
                              .map(
                                (i) =>
                                  `${i.productName} (${Number(i.qty)} ${i.unit ?? ""})`,
                              )
                              .join(", ")
                          : "—"}
                      </td>
                      <td
                        className="px-2 py-1.5 text-right font-mono"
                        data-numeric=""
                      >
                        {fmtMoney(s.valorProductos)}
                      </td>
                      <td
                        className="px-2 py-1.5 text-right font-mono"
                        data-numeric=""
                      >
                        {Number(s.montoEfectivo) > 0
                          ? fmtMoney(s.montoEfectivo)
                          : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          aria-label={t("editTitle")}
                          title={t("editTitle")}
                          onClick={() => setModal(s)}
                        >
                          <PencilLine className="size-4" aria-hidden />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          aria-label={t("deleteTitle")}
                          title={t("deleteTitle")}
                          disabled={deleting}
                          onClick={() => handleDelete(s)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {modal && (
        <OutflowModal
          key={modal === "new" ? "new" : modal.id}
          initial={modal === "new" ? null : modal}
          products={products}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ---------- Modal (NuevaSalidaModal del ERP) ----------

type Line = { productId: string; qty: string };

function OutflowModal({
  initial,
  products,
  onClose,
}: Readonly<{
  initial: OutflowDto | null;
  products: ProductOpt[];
  onClose: () => void;
}>) {
  const t = useTranslations("app.internalOutflows");
  const [tipo, setTipo] = useState(initial?.tipo ?? "DONACION");
  const [fecha, setFecha] = useState(initial?.fecha ?? hoyIso());
  const [destino, setDestino] = useState(initial?.destino ?? "");
  const [lines, setLines] = useState<Line[]>(
    initial && initial.items.length > 0
      ? initial.items.map((i) => ({
          productId: i.productId,
          qty: String(Number(i.qty)),
        }))
      : [{ productId: "", qty: "" }],
  );
  const [efectivo, setEfectivo] = useState(
    initial && Number(initial.montoEfectivo) > 0 ? initial.montoEfectivo : "",
  );
  const [motivo, setMotivo] = useState(initial?.motivo ?? "");
  const [notas, setNotas] = useState(initial?.notas ?? "");
  const [saving, startSave] = useTransition();

  const productoById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const valorEstimado = useMemo(() => {
    let total = 0;
    for (const l of lines) {
      const p = productoById.get(l.productId);
      if (p && Number(l.qty) > 0) total += Number(l.qty) * Number(p.avgCost);
    }
    return total;
  }, [lines, productoById]);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );
  }

  function handleSubmit() {
    const items = lines.filter((l) => l.productId || l.qty);
    const efectivoNum = efectivo ? Number(efectivo) : 0;
    if (items.length === 0 && !(efectivoNum > 0)) {
      toast.warning(t("warnEmpty"));
      return;
    }
    // Validación de stock AGREGADA por producto (como el ERP en cliente)
    const totalPorProducto = new Map<string, number>();
    for (const l of items) {
      if (!l.productId || !(Number(l.qty) > 0)) continue;
      totalPorProducto.set(
        l.productId,
        (totalPorProducto.get(l.productId) ?? 0) + Number(l.qty),
      );
    }
    for (const [pid, total] of totalPorProducto) {
      const p = productoById.get(pid);
      // Al editar, el stock disponible incluye lo que devolverá la reversión
      const devuelto =
        initial?.items
          .filter((i) => i.productId === pid)
          .reduce((a, i) => a + Number(i.qty), 0) ?? 0;
      if (p && total > Number(p.balance) + devuelto) {
        toast.error(
          `Stock insuficiente de "${p.name}" (disponible ${Number(p.balance) + devuelto}, requerido ${total})`,
        );
        return;
      }
    }
    const input: OutflowFormInput = {
      fecha,
      tipo: tipo as OutflowFormInput["tipo"],
      destinoNombre: destino.trim() || null,
      montoEfectivo: efectivoNum > 0 ? String(efectivoNum) : "0",
      motivo: motivo.trim() || null,
      notas: notas.trim() || null,
      items,
    };
    startSave(async () => {
      const res = initial
        ? await updateOutflowAction(initial.id, input)
        : await createOutflowAction(input);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(initial ? t("savedEdit") : t("savedCreate"));
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-background p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <HeartHandshake className="size-5 text-primary" aria-hidden />
            {initial ? t("modalTitleEdit") : t("modalTitleNew")}
          </h2>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            aria-label={t("cancel")}
            onClick={onClose}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>

        {initial && (
          <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
            {t("editBanner")}
          </p>
        )}

        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {t("typeLabel")}
            </p>
            <div className="flex flex-wrap gap-1">
              {TIPOS.map((tp) => (
                <Button
                  key={tp}
                  type="button"
                  size="sm"
                  variant={tipo === tp ? "default" : "outline"}
                  onClick={() => setTipo(tp)}
                >
                  {t(`tipos.${tp}`)}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t("dateLabel")}
              </span>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="h-8"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t("destinationLabel")}
              </span>
              <Input
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                placeholder={t(`destinationPlaceholder.${tipo}`)}
                className="h-8"
              />
            </label>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                {t("productsSection")}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setLines((prev) => [...prev, { productId: "", qty: "" }])
                }
              >
                <Plus className="size-3.5" aria-hidden />
                {t("addLine")}
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {lines.map((line, i) => {
                const p = productoById.get(line.productId);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      aria-label={t("productLabel")}
                      value={line.productId}
                      onChange={(e) =>
                        setLine(i, { productId: e.target.value })
                      }
                      className="border-input h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-sm"
                    >
                      <option value="">{t("selectProduct")}</option>
                      {products.map((prod) => (
                        <option key={prod.id} value={prod.id}>
                          {prod.name} — stock {Number(prod.balance)} {prod.unit}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={line.qty}
                      onChange={(e) => setLine(i, { qty: e.target.value })}
                      placeholder={t("qtyPlaceholder")}
                      aria-label={t("qtyPlaceholder")}
                      className="h-8 w-24"
                    />
                    <span className="w-10 text-xs text-muted-foreground">
                      {p?.unit ?? ""}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      aria-label={t("removeLine")}
                      disabled={lines.length === 1}
                      onClick={() =>
                        setLines((prev) => prev.filter((_, idx) => idx !== i))
                      }
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </div>
                );
              })}
            </div>
            {valorEstimado > 0 && (
              <p className="mt-1 text-xs text-muted-foreground" data-numeric="">
                {t("estimatedValue", { valor: fmtMoney(valorEstimado) })}
              </p>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {t("cashSection")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  {t("cashLabel")}
                </span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={efectivo}
                  onChange={(e) => setEfectivo(e.target.value)}
                  placeholder="0.00"
                  className="h-8"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  {t("reasonLabel")}
                </span>
                <Input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder={t("reasonPlaceholder")}
                  className="h-8"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  {t("notesLabel")}
                </span>
                <Input
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder={t("notesPlaceholder")}
                  className="h-8"
                />
              </label>
            </div>
            {Number(efectivo) > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("cashHint")}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="button" disabled={saving} onClick={handleSubmit}>
              <HeartHandshake className="size-4" aria-hidden />
              {saving
                ? t("saving")
                : initial
                  ? t("submitEdit")
                  : t("submitNew")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
