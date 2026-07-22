import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  parseDecimalToCents,
  centsToDecimalString,
  parseRateToMicros,
  convertToBase,
  CURRENCIES,
} from "./money";

describe("parseDecimalToCents", () => {
  it("convierte strings decimales a centavos bigint", () => {
    expect(parseDecimalToCents("1")).toBe(100n);
    expect(parseDecimalToCents("0.5")).toBe(50n);
    expect(parseDecimalToCents("1234.56")).toBe(123456n);
    expect(parseDecimalToCents("0.01")).toBe(1n);
    expect(parseDecimalToCents("0")).toBe(0n);
  });

  it("acepta coma decimal (formato es-ES/pt-BR)", () => {
    expect(parseDecimalToCents("1234,56")).toBe(123456n);
  });

  it("rechaza más de 2 decimales, negativos y basura", () => {
    expect(() => parseDecimalToCents("1.234")).toThrow();
    expect(() => parseDecimalToCents("-5")).toThrow();
    expect(() => parseDecimalToCents("abc")).toThrow();
    expect(() => parseDecimalToCents("")).toThrow();
    expect(() => parseDecimalToCents("1.2.3")).toThrow();
  });

  it("property: roundtrip parse ↔ format es identidad", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 15n }), (cents) => {
        expect(parseDecimalToCents(centsToDecimalString(cents))).toBe(cents);
      }),
    );
  });
});

describe("centsToDecimalString", () => {
  it("formatea centavos como decimal con 2 dígitos", () => {
    expect(centsToDecimalString(123456n)).toBe("1234.56");
    expect(centsToDecimalString(1n)).toBe("0.01");
    expect(centsToDecimalString(0n)).toBe("0.00");
    expect(centsToDecimalString(100n)).toBe("1.00");
  });
});

describe("parseRateToMicros", () => {
  it("parsea tasas con hasta 6 decimales a micros bigint", () => {
    expect(parseRateToMicros("1")).toBe(1_000_000n);
    expect(parseRateToMicros("320")).toBe(320_000_000n);
    expect(parseRateToMicros("0.000001")).toBe(1n);
    expect(parseRateToMicros("5.402350")).toBe(5_402_350n);
  });

  it("rechaza tasas cero, negativas o inválidas", () => {
    expect(() => parseRateToMicros("0")).toThrow();
    expect(() => parseRateToMicros("-1")).toThrow();
    expect(() => parseRateToMicros("1.2345678")).toThrow();
    expect(() => parseRateToMicros("x")).toThrow();
  });
});

describe("convertToBase", () => {
  it("convierte con la tasa fijada (1 unidad moneda = rate en base)", () => {
    // 10.00 USD a CUP con tasa 320 → 3200.00 CUP
    expect(convertToBase(1000n, "320")).toBe(320000n);
    // 1.00 con tasa 1 → identidad
    expect(convertToBase(100n, "1")).toBe(100n);
  });

  it("redondea half-up en el punto medio", () => {
    // 1 centavo * 0.005 = 0.005 centavos → half-up → 0? No: 0.005 → 0.01?
    // 100 centavos (1.00) * tasa 0.005 = 0.5 centavos → half-up → 1 centavo
    expect(convertToBase(100n, "0.005")).toBe(1n);
    // 100 * 0.004 = 0.4 → 0
    expect(convertToBase(100n, "0.004")).toBe(0n);
  });

  it("property: identidad con tasa 1", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 15n }), (cents) => {
        expect(convertToBase(cents, "1")).toBe(cents);
      }),
    );
  });

  it("property: monotonía — más dinero nunca convierte a menos", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 12n }),
        fc.bigInt({ min: 0n, max: 10n ** 12n }),
        fc.integer({ min: 1, max: 500_000_000 }),
        (a, b, rateMicros) => {
          const rate = (BigInt(rateMicros) * 10n ** 0n).toString();
          const rateStr = `${BigInt(rateMicros) / 1_000_000n}.${(BigInt(rateMicros) % 1_000_000n).toString().padStart(6, "0")}`;
          void rate;
          const lo = a < b ? a : b;
          const hi = a < b ? b : a;
          expect(convertToBase(lo, rateStr) <= convertToBase(hi, rateStr)).toBe(
            true,
          );
        },
      ),
    );
  });

  it("property: el error de redondeo por documento es < 1 centavo", () => {
    // convertir el total ≠ sumar conversiones por línea; por eso la regla
    // "conversión una vez por documento". Verificamos la cota del error.
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 12n }),
        fc.integer({ min: 1, max: 500_000_000 }),
        (cents, rateMicros) => {
          const rateStr = `${BigInt(rateMicros) / 1_000_000n}.${(BigInt(rateMicros) % 1_000_000n).toString().padStart(6, "0")}`;
          const exactTimes100 = cents * BigInt(rateMicros); // valor exacto ×10^8
          const converted = convertToBase(cents, rateStr);
          const diff = converted * 1_000_000n - exactTimes100;
          const absDiff = diff < 0n ? -diff : diff;
          expect(absDiff <= 500_000n).toBe(true); // ≤ 0.5 centavo
        },
      ),
    );
  });
});

describe("CURRENCIES", () => {
  it("incluye las tres monedas del mercado", () => {
    expect(CURRENCIES).toEqual(["CUP", "USD", "BRL"]);
  });
});
