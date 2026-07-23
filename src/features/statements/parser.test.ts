import { describe, expect, it } from "vitest";
import { parseStatement, parseFecha, extractTelefono } from "./parser";

/**
 * Fixture sintético en el layout BPA 2026 (el que procesa el parser del ERP):
 * fecha en sp=0, referencia en sp≈20, importe+saldo+obs en sp≈39,
 * continuación de observación en sp=65. Datos 100% ficticios (repo público).
 * Cubre TODAS las ramas del parser original: ref en línea de fecha, solo-ref,
 * CR huérfano + ref sin sufijo, ref con espacios anchos, miles con espacio,
 * cabecera, saldo inicial y bloque final de totales.
 */
const L = (sp: number, text: string) => " ".repeat(sp) + text;
const FIXTURE = [
  L(128, "Página 1 de 2"),
  "Estado de Cuenta.",
  "",
  "Sucursal 997 - SUCURSAL ELECTRONICA SABIC - Banco Popular de Ahorro",
  "Centro Contable: 9972",
  "",
  "Cuenta Interna: 40310000000001",
  "Cuenta Estandarizada: 1299770000000001",
  "EMPRESA DEMO LIMPIEZA",
  "",
  L(43, "Saldo Inicial"),
  L(47, "1 000.00"),
  "",
  "Fecha Inicial: 01/01/2026",
  "Fecha Final: 31/01/2026",
  "Fec. Contable       Ref. Origin     Oper   Importe        Saldo Observaciones",
  // Caso 1: referencia en la MISMA línea de la fecha
  "01/01/2026          BR601AAAAA997 CR",
  L(
    39,
    "375.00    1 375.00 Transferencia por BancaMovil BPA. Ordenada por: CLIENTE UNO DEMO PAN:",
  ),
  L(
    65,
    "920612XXXXXX1111 ID CUBACEL: 1111111111 5351111111 Beneficiario: EMPRESA",
  ),
  L(65, "DEMO PAN Destino: 921212XXXXXX9999"),
  // Caso 2: línea solo-referencia + miles con espacio
  L(20, "AY600BBBBB997     CR"),
  L(
    39,
    "1 285.00    2 660.00 TRANSFERENCIA DE FONDOS DESTINO RECIBIDO POR SWITCH CE Tarjeta :",
  ),
  L(65, "920406XXXXXX2222 DE TARJETA NRO:920406XXXXXX2222 A TARJETA"),
  L(65, "NRO:921212XXXXXX9999"),
  // Caso 3: operador CR huérfano en su línea + ref sin sufijo
  L(20, "CR"),
  L(20, "BR601CCCCC997"),
  L(
    39,
    "600.00    3 260.00 Transferencia por BancaMovil BPA. Ordenada por: CLIENTE DOS DEMO PAN:",
  ),
  L(65, "923812XXXXXX3333 ID CUBACEL: 2222222222 5352222222"),
  // Caso 4: referencia con espacios anchos antes de CR
  L(20, "BR601DDDDD997   CR"),
  L(
    39,
    "400.00    3 660.00 Transferencia por BancaMovil BPA. Ordenada por: CLIENTE UNO DEMO PAN:",
  ),
  L(65, "920612XXXXXX1111"),
  // Caso 5: débito en línea de fecha nueva
  "02/01/2026          AY600EEEEE997 DB",
  L(39, "500.00    3 160.00 RETIRO EN CAJERO AUTOMATICO"),
  "",
  L(19, "Depósitos"),
  L(19, "2 660.00"),
  L(19, "Extracciones"),
  L(19, "500.00"),
  L(19, "Saldo Final"),
  L(19, "3 160.00"),
].join("\n");

describe("parser BPA (port fiel del ERP)", () => {
  const { operaciones, resumen, cuentaInfo } = parseStatement(FIXTURE);

  it("extrae la cabecera de cuenta", () => {
    expect(cuentaInfo.cuentaInterna).toBe("40310000000001");
    expect(cuentaInfo.cuentaEstandarizada).toBe("1299770000000001");
    expect(cuentaInfo.titular).toBe("EMPRESA DEMO LIMPIEZA");
    expect(cuentaInfo.fechaInicio).toBe("01/01/2026");
    expect(cuentaInfo.fechaFin).toBe("31/01/2026");
    expect(cuentaInfo.saldoInicial).toBe(1000);
  });

  it("captura las 5 operaciones con todas las variantes de layout", () => {
    expect(operaciones).toHaveLength(5);
    expect(operaciones.map((o) => o.referencia_base)).toEqual([
      "BR601AAAAA997",
      "AY600BBBBB997",
      "BR601CCCCC997", // vía CR huérfano + ref sin sufijo
      "BR601DDDDD997", // ref con espacios anchos
      "AY600EEEEE997",
    ]);
    expect(operaciones.map((o) => o.operacion)).toEqual([
      "CR",
      "CR",
      "CR",
      "CR",
      "DB",
    ]);
    // miles con espacio: "1 285.00" → 1285
    expect(operaciones[1].importe).toBe(1285);
    expect(operaciones[1].saldo).toBe(2660);
    // la fecha se hereda hasta la próxima línea de fecha
    expect(operaciones[3].fecha).toBe("01/01/2026");
    expect(operaciones[4].fecha).toBe("02/01/2026");
  });

  it("atribuye cliente, PAN, tipo y teléfono con las regex del ERP", () => {
    const [op1, op2, op3] = operaciones;
    expect(op1.client_name).toBe("CLIENTE UNO DEMO");
    expect(op1.pan_origen).toBe("920612XXXXXX1111");
    expect(op1.tipo_transaccion).toBe("BANCA_MOVIL");
    expect(extractTelefono(op1.observacion)).toBe("5351111111");
    // SWITCH CE no lleva "Ordenada por" → sin cliente
    expect(op2.client_name).toBeNull();
    expect(op2.tipo_transaccion).toBe("SWITCH_CE");
    expect(op2.pan_origen).toBe("920406XXXXXX2222");
    expect(op3.client_name).toBe("CLIENTE DOS DEMO");
    expect(extractTelefono(op3.observacion)).toBe("5352222222");
  });

  it("valida la aritmética contra los totales del PDF (cuadra)", () => {
    expect(resumen.totalCreditos).toBe(2660);
    expect(resumen.totalDebitos).toBe(500);
    expect(resumen.saldoInicial).toBe(1000);
    expect(resumen.saldoFinal).toBe(3160);
    expect(resumen.validacion.cuadrado).toBe(true);
    expect(resumen.validacion.pdfDepositos).toBe(2660);
    expect(resumen.validacion.pdfSaldoFinal).toBe(3160);
  });

  it("cuando faltan operaciones, reporta que NO cuadra con el mensaje del ERP", () => {
    // Mismo fixture pero sin la operación de 400.00 (se "pierde" en el parseo)
    const roto = FIXTURE.replace(
      L(20, "BR601DDDDD997   CR") +
        "\n" +
        L(
          39,
          "400.00    3 660.00 Transferencia por BancaMovil BPA. Ordenada por: CLIENTE UNO DEMO PAN:",
        ) +
        "\n" +
        L(65, "920612XXXXXX1111") +
        "\n",
      "",
    );
    const r = parseStatement(roto);
    expect(r.resumen.validacion.cuadrado).toBe(false);
    expect(r.resumen.validacion.mensajes[0]).toContain(
      "Depósitos: PDF declara",
    );
    expect(r.resumen.validacion.mensajes[0]).toContain("2260");
  });

  it("parseFecha convierte DD/MM/YYYY a ISO + mes + año", () => {
    expect(parseFecha("05/03/2026")).toEqual({
      fechaIso: "2026-03-05",
      mes: 3,
      anio: 2026,
    });
    expect(parseFecha("garbage")).toEqual({
      fechaIso: null,
      mes: null,
      anio: null,
    });
  });
});
