// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractLayoutText } from "./extract";
import { parseStatement } from "./parser";

/**
 * Validación end-to-end del pipeline PDF→texto→parser: genera un PDF
 * sintético con fuente monoespaciada (Courier) posicionando cada línea del
 * fixture golden en su columna exacta, lo extrae con extractLayoutText y
 * verifica que el parser obtiene LOS MISMOS resultados que con el texto puro.
 */
const L = (sp: number, text: string) => " ".repeat(sp) + text;
const FIXTURE_LINES = [
  "Cuenta Interna: 40310000000001",
  "Cuenta Estandarizada: 1299770000000001",
  "EMPRESA DEMO LIMPIEZA",
  L(43, "Saldo Inicial"),
  L(47, "1 000.00"),
  "Fecha Inicial: 01/01/2026",
  "Fecha Final: 31/01/2026",
  "01/01/2026          BR601AAAAA997 CR",
  L(
    39,
    "375.00    1 375.00 Transferencia por BancaMovil BPA. Ordenada por: CLIENTE UNO DEMO PAN:",
  ),
  L(65, "920612XXXXXX1111 ID CUBACEL: 1111111111 5351111111"),
  L(20, "AY600BBBBB997     CR"),
  L(
    39,
    "1 285.00    2 660.00 TRANSFERENCIA DE FONDOS DESTINO RECIBIDO POR SWITCH CE Tarjeta :",
  ),
  L(65, "920406XXXXXX2222 DE TARJETA NRO:920406XXXXXX2222"),
  "02/01/2026          AY600EEEEE997 DB",
  L(39, "500.00    2 160.00 RETIRO EN CAJERO AUTOMATICO"),
  L(19, "Depósitos"),
  L(19, "1 660.00"),
  L(19, "Extracciones"),
  L(19, "500.00"),
  L(19, "Saldo Final"),
  L(19, "2 160.00"),
];

async function buildPdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Courier);
  const size = 10;
  const charW = font.widthOfTextAtSize("M", size); // monoespaciada: ancho fijo
  const margin = 40;
  const page = doc.addPage([1200, 900]);
  let y = 860;
  for (const line of lines) {
    const sp = line.length - line.trimStart().length;
    const text = line.trim();
    if (text) {
      page.drawText(text, { x: margin + sp * charW, y, font, size });
    }
    y -= 14;
  }
  return doc.save();
}

describe("extracción PDF→texto con layout (F8-M2)", () => {
  it("el pipeline PDF→extract→parser reproduce el golden", async () => {
    const pdf = await buildPdf(FIXTURE_LINES);
    const text = await extractLayoutText(pdf);
    const { operaciones, resumen, cuentaInfo } = parseStatement(text);

    expect(cuentaInfo.cuentaInterna).toBe("40310000000001");
    expect(cuentaInfo.titular).toBe("EMPRESA DEMO LIMPIEZA");
    expect(cuentaInfo.saldoInicial).toBe(1000);

    expect(operaciones).toHaveLength(3);
    expect(operaciones.map((o) => o.operacion)).toEqual(["CR", "CR", "DB"]);
    expect(operaciones[0].client_name).toBe("CLIENTE UNO DEMO");
    expect(operaciones[0].pan_origen).toBe("920612XXXXXX1111");
    expect(operaciones[1].importe).toBe(1285);
    expect(operaciones[1].tipo_transaccion).toBe("SWITCH_CE");

    expect(resumen.totalCreditos).toBe(1660);
    expect(resumen.totalDebitos).toBe(500);
    expect(resumen.validacion.cuadrado).toBe(true);
  });
});
