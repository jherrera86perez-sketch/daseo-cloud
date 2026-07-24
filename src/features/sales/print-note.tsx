"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export type NotaVentaData = {
  numero: string;
  fecha: string;
  cliente: string;
  moneda: string;
  lineas: Array<{
    descripcion: string;
    qty: string;
    precio: string;
    total: string;
  }>;
  subtotal: string;
  descuento: string | null;
  iva: string | null;
  total: string;
  cobrado: string;
  saldo: string;
  poNumber: string | null;
  nota: string | null;
  org: string;
};

/**
 * "Imprimir nota de venta" del ERP (generateSaleNoteHTML → window.print):
 * abre una ventana con la nota formateada y lanza el diálogo de impresión.
 */
export function PrintNoteButton({ data }: Readonly<{ data: NotaVentaData }>) {
  const t = useTranslations("app.sales");

  const print = () => {
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const filas = data.lineas
      .map(
        (l) =>
          `<tr><td>${esc(l.descripcion)}</td><td class="n">${l.qty}</td><td class="n">${l.precio}</td><td class="n">${l.total}</td></tr>`,
      )
      .join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${esc(data.numero)}</title>
<style>
  body{font-family:ui-monospace,Consolas,monospace;font-size:12px;margin:24px;color:#000}
  h1{font-size:16px;margin:0} h2{font-size:13px;margin:2px 0 12px;font-weight:normal}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  th,td{border-bottom:1px solid #ccc;padding:4px 6px;text-align:left}
  .n{text-align:right} .tot{font-weight:bold}
  .meta{margin:2px 0}
</style></head><body>
<h1>${esc(data.org)}</h1>
<h2>${t("printNoteTitle")} ${esc(data.numero)}</h2>
<p class="meta">${t("date")}: ${esc(data.fecha)}</p>
<p class="meta">${t("customer")}: ${esc(data.cliente)}</p>
${data.poNumber ? `<p class="meta">${t("poNumber")}: ${esc(data.poNumber)}</p>` : ""}
<table>
<thead><tr><th>${t("description")}</th><th class="n">${t("qty")}</th><th class="n">${t("unitPrice")}</th><th class="n">${t("total")}</th></tr></thead>
<tbody>${filas}</tbody>
<tfoot>
<tr><td colspan="3" class="n">${t("subtotal")}</td><td class="n">${data.subtotal}</td></tr>
${data.iva ? `<tr><td colspan="3" class="n">IVA</td><td class="n">${data.iva}</td></tr>` : ""}
${data.descuento ? `<tr><td colspan="3" class="n">${t("discount")}</td><td class="n">−${data.descuento}</td></tr>` : ""}
<tr class="tot"><td colspan="3" class="n">${t("total")}</td><td class="n">${data.total} ${esc(data.moneda)}</td></tr>
<tr><td colspan="3" class="n">${t("paidLabel")}</td><td class="n">${data.cobrado}</td></tr>
<tr><td colspan="3" class="n">${t("balance")}</td><td class="n">${data.saldo}</td></tr>
</tfoot>
</table>
${data.nota ? `<p class="meta">${esc(data.nota)}</p>` : ""}
</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={print}>
      🖨️ {t("printNote")}
    </Button>
  );
}
