import { getDocumentProxy } from "unpdf";

/**
 * Extracción de texto con LAYOUT desde el PDF (equivalente serverless de
 * `pdftotext -layout` que usa el ERP con poppler). Reconstruye la cuadrícula
 * de columnas a partir de las posiciones X/Y de los items de pdfjs: el
 * parser BPA depende de los espacios iniciales de cada línea.
 *
 * Nota de fidelidad: validado end-to-end contra el fixture golden (PDF
 * sintético con métrica monoespaciada). Ante el primer estado 2026 real,
 * cotejar con la salida de pdftotext del ERP (scripts/test-parser-real.ts).
 */
export async function extractLayoutText(data: Uint8Array): Promise<string> {
  const doc = await getDocumentProxy(data);
  const pages: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    type Item = { x: number; y: number; str: string; width: number };
    const items: Item[] = [];
    for (const it of content.items as Array<{
      str: string;
      transform: number[];
      width: number;
    }>) {
      if (!it.str || !it.str.trim()) continue;
      items.push({
        x: it.transform[4],
        y: it.transform[5],
        str: it.str,
        width: it.width,
      });
    }
    if (items.length === 0) {
      pages.push("");
      continue;
    }

    // Ancho de carácter estimado: mediana de width/len (robusta a outliers).
    const ratios = items
      .filter((i) => i.str.trim().length > 1)
      .map((i) => i.width / i.str.length)
      .sort((a, b) => a - b);
    const charW = ratios.length > 0 ? ratios[Math.floor(ratios.length / 2)] : 6;

    // Margen izquierdo = X mínima de la página (columna 0 del texto plano).
    const minX = Math.min(...items.map((i) => i.x));

    // Agrupar por línea: misma Y con tolerancia de 2pt.
    const linesMap = new Map<number, Item[]>();
    const keys: number[] = [];
    for (const it of items) {
      const key = keys.find((k) => Math.abs(k - it.y) <= 2);
      if (key === undefined) {
        keys.push(it.y);
        linesMap.set(it.y, [it]);
      } else {
        linesMap.get(key)!.push(it);
      }
    }

    // Orden natural del PDF: Y descendente (arriba→abajo), X ascendente.
    const sortedKeys = [...linesMap.keys()].sort((a, b) => b - a);
    const lines: string[] = [];
    for (const k of sortedKeys) {
      const lineItems = linesMap.get(k)!.sort((a, b) => a.x - b.x);
      let line = "";
      for (const it of lineItems) {
        const col = Math.max(0, Math.round((it.x - minX) / charW));
        if (col > line.length) {
          line += " ".repeat(col - line.length);
        } else if (line.length > 0) {
          line += " ";
        }
        line += it.str;
      }
      lines.push(line);
    }
    pages.push(lines.join("\n"));
  }

  return pages.join("\n");
}
