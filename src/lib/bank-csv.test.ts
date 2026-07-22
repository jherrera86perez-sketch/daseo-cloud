import { describe, expect, it } from "vitest";
import { parseBankCsv } from "./bank-csv";

describe("parseBankCsv", () => {
  it("parsea el formato documentado (fecha,descripcion,monto,referencia)", () => {
    const csv = [
      "fecha,descripcion,monto,referencia",
      "2026-07-15,TRANSFERENCIA BODEGA EL SOL,8000.00,TRF-001",
      "15/07/2026,COMISION BANCO,-25.50,",
      '2026-07-16,"PAGO, CON COMA",1234.56,X2',
    ].join("\n");
    const rows = parseBankCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      date: "2026-07-15",
      description: "TRANSFERENCIA BODEGA EL SOL",
      amountCents: 800000n,
      reference: "TRF-001",
    });
    expect(rows[1].amountCents).toBe(-2550n);
    expect(rows[1].date).toBe("2026-07-15");
    expect(rows[2].description).toBe("PAGO, CON COMA");
  });

  it("acepta separador ; y decimal con coma (formato bancario BR/ES)", () => {
    const csv = [
      "fecha;descripcion;monto",
      "01/07/2026;PIX RECEBIDO;1.234,56",
      "02/07/2026;TARIFA;-10,00",
    ].join("\n");
    const rows = parseBankCsv(csv);
    expect(rows[0].amountCents).toBe(123456n);
    expect(rows[1].amountCents).toBe(-1000n);
  });

  it("ignora filas vacías y rechaza montos/fechas inválidos con detalle", () => {
    const csv = [
      "fecha,descripcion,monto",
      "",
      "2026-07-15,OK,10.00",
      "fecha-mala,X,5.00",
      "2026-07-16,Y,no-numero",
    ].join("\n");
    const rows = parseBankCsv(csv);
    expect(rows).toHaveLength(1);
  });
});
