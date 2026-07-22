import { describe, expect, it } from "vitest";
import { cuEngine } from "./cu";

describe("motor fiscal CU — obligaciones mensuales (TCP régimen general)", () => {
  it("calcula los conceptos sobre ventas y nómina", () => {
    const lines = cuEngine.monthlyObligations({
      regime: "TCP_GENERAL",
      salesBaseCents: 10_000_000n, // 100,000.00 CUP vendidos
      payrollCents: 2_000_000n, // 20,000.00 nómina
      fixedQuotaCents: 0n,
    });
    const by = Object.fromEntries(lines.map((l) => [l.code, l.amountCents]));
    expect(by["011402"]).toBe(1_000_000n); // ventas 10%
    expect(by["061032"]).toBe(100_000n); // fuerza de trabajo 5% nómina
    expect(by["052052"]).toBe(100_000n); // retención salarial 5%
    expect(by["031012"]).toBe(250_000n); // seguridad social 12.5% nómina
    expect(by["074012"]).toBe(100_000n); // desarrollo local 1% ventas
    expect(by["051012"]).toBe(500_000n); // pago a cuenta 5% ventas
  });

  it("sin nómina, los conceptos de nómina no aparecen", () => {
    const lines = cuEngine.monthlyObligations({
      regime: "TCP_GENERAL",
      salesBaseCents: 1_000_000n,
      payrollCents: 0n,
      fixedQuotaCents: 0n,
    });
    const codes = lines.map((l) => l.code);
    expect(codes).toContain("011402");
    expect(codes).not.toContain("061032");
    expect(codes).not.toContain("031012");
  });

  it("régimen simplificado: solo la cuota consolidada", () => {
    const lines = cuEngine.monthlyObligations({
      regime: "TCP_SIMPLIFICADO",
      salesBaseCents: 10_000_000n,
      payrollCents: 0n,
      fixedQuotaCents: 300_000n, // cuota fija 3,000.00
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].code).toBe("051052");
    expect(lines[0].amountCents).toBe(300_000n);
  });
});

describe("DJ-08 — escala progresiva 2026", () => {
  it("golden: base neta 25,000 → 5,000 de impuesto", () => {
    // 10,000×15% + 10,000×20% + 5,000×30% = 1,500+2,000+1,500
    const p = cuEngine.annualProjection({
      incomeCents: 3_000_000n, // 30,000.00
      deductibleExpensesCents: 500_000n, // 5,000.00
      advancesPaidCents: 0n,
      minExemptCents: 0n,
    });
    expect(p.netBaseCents).toBe(2_500_000n);
    expect(p.taxCents).toBe(500_000n);
    expect(p.brackets.filter((b) => b.taxCents > 0n)).toHaveLength(3);
  });

  it("los pagos a cuenta se descuentan del saldo", () => {
    const p = cuEngine.annualProjection({
      incomeCents: 3_000_000n,
      deductibleExpensesCents: 500_000n,
      advancesPaidCents: 200_000n,
      minExemptCents: 0n,
    });
    expect(p.balanceCents).toBe(300_000n); // 5,000 - 2,000
  });

  it("mínimo exento reduce la base; base negativa = 0", () => {
    const p = cuEngine.annualProjection({
      incomeCents: 1_000_000n,
      deductibleExpensesCents: 900_000n,
      advancesPaidCents: 0n,
      minExemptCents: 3_912_000n,
    });
    expect(p.netBaseCents).toBe(0n);
    expect(p.taxCents).toBe(0n);
  });

  it("tramo alto: 60,000 netos llegan al 50%", () => {
    const p = cuEngine.annualProjection({
      incomeCents: 6_000_000n,
      deductibleExpensesCents: 0n,
      advancesPaidCents: 0n,
      minExemptCents: 0n,
    });
    // 10k×15%+10k×20%+10k×30%+20k×40%+10k×50% = 1500+2000+3000+8000+5000 = 19,500
    expect(p.taxCents).toBe(1_950_000n);
  });
});

describe("simulador de régimen", () => {
  it("compara general vs simplificado con números anuales", () => {
    const cmp = cuEngine.regimeCompare({
      annualSalesCents: 12_000_000n, // 120,000/año
      annualPayrollCents: 0n,
      annualDeductibleCents: 2_000_000n,
      monthlyQuotaCents: 150_000n, // cuota 1,500/mes
      minExemptCents: 0n,
    });
    expect(cmp.simplifiedTotalCents).toBe(1_800_000n); // 1,500×12
    expect(cmp.generalTotalCents).toBeGreaterThan(0n);
    expect(typeof cmp.recommendation).toBe("string");
  });
});
