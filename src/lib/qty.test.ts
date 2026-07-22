import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseQtyToMilli, milliToQtyString, weightedAvgCents } from "./qty";

describe("parseQtyToMilli / milliToQtyString", () => {
  it("parsea cantidades con hasta 3 decimales (punto o coma)", () => {
    expect(parseQtyToMilli("1")).toBe(1000n);
    expect(parseQtyToMilli("0.5")).toBe(500n);
    expect(parseQtyToMilli("12,345")).toBe(12345n);
    expect(parseQtyToMilli("0.001")).toBe(1n);
  });

  it("rechaza cero, negativos, >3 decimales y basura", () => {
    expect(() => parseQtyToMilli("0")).toThrow();
    expect(() => parseQtyToMilli("-1")).toThrow();
    expect(() => parseQtyToMilli("1.2345")).toThrow();
    expect(() => parseQtyToMilli("abc")).toThrow();
  });

  it("property: roundtrip es identidad", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 12n }), (milli) => {
        expect(parseQtyToMilli(milliToQtyString(milli))).toBe(milli);
      }),
    );
  });
});

describe("weightedAvgCents (costo promedio ponderado)", () => {
  it("calcula el promedio clásico", () => {
    // 100 uds a 50¢ + 100 uds a 100¢ → 200 uds a 75¢
    expect(weightedAvgCents(100_000n, 50n, 100_000n, 100n)).toBe(75n);
  });

  it("primera entrada: el promedio es el costo de entrada", () => {
    expect(weightedAvgCents(0n, 0n, 50_000n, 320n)).toBe(320n);
  });

  it("redondea half-up", () => {
    // 1 ud a 1¢ + 2 uds a 2¢ → 5/3 = 1.666… → 2¢
    expect(weightedAvgCents(1_000n, 1n, 2_000n, 2n)).toBe(2n);
  });

  it("property: el promedio queda entre los dos costos", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 9n }),
        fc.bigInt({ min: 0n, max: 10n ** 8n }),
        fc.bigInt({ min: 1n, max: 10n ** 9n }),
        fc.bigInt({ min: 0n, max: 10n ** 8n }),
        (q1, c1, q2, c2) => {
          const avg = weightedAvgCents(q1, c1, q2, c2);
          const lo = c1 < c2 ? c1 : c2;
          const hi = c1 < c2 ? c2 : c1;
          expect(avg >= lo && avg <= hi).toBe(true);
        },
      ),
    );
  });
});
