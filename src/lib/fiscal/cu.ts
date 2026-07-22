import type {
  FiscalEngine,
  MonthlyInputs,
  ObligationLine,
  AnnualInputs,
  AnnualProjection,
  BracketResult,
  RegimeCompareInputs,
  RegimeComparison,
} from "./types";

/**
 * Motor fiscal de Cuba (ONAT, régimen TCP) — parámetros extraídos de la
 * configuración real del ERP CubaOne de Daseo (tax_concepts y
 * tax_progressive_scales 2026). Editables por org vía fiscal_settings.
 */

type Concept = {
  id: string;
  code: string;
  name: string;
  frequency: "MENSUAL" | "TRIMESTRAL" | "ANUAL";
  rate: number; // sobre la base correspondiente
  base: "sales" | "payroll" | "quota";
};

export const CU_MONTHLY_CONCEPTS: Concept[] = [
  {
    id: "tcp_sales",
    code: "011402",
    name: "Impuesto sobre Ventas y Servicios",
    frequency: "MENSUAL",
    rate: 0.1,
    base: "sales",
  },
  {
    id: "labor_force",
    code: "061032",
    name: "Impuesto Utilización Fuerza de Trabajo",
    frequency: "MENSUAL",
    rate: 0.05,
    base: "payroll",
  },
  {
    id: "retention_salary",
    code: "052052",
    name: "Retención Salarial (5%)",
    frequency: "MENSUAL",
    rate: 0.05,
    base: "payroll",
  },
  {
    id: "social_sec",
    code: "031012",
    name: "Contribución Seguridad Social (12.5%)",
    frequency: "MENSUAL",
    rate: 0.125,
    base: "payroll",
  },
  {
    id: "local_dev",
    code: "074012",
    name: "Contribución Desarrollo Local",
    frequency: "MENSUAL",
    rate: 0.01,
    base: "sales",
  },
  {
    id: "personal_advance",
    code: "051012",
    name: "Pago a Cuenta Ingresos Personales",
    frequency: "MENSUAL",
    rate: 0.05,
    base: "sales",
  },
];

export const CU_SIMPLIFIED_QUOTA = {
  code: "051052",
  name: "Cuota Consolidada (Régimen Simplificado)",
} as const;

/** Escala progresiva DJ-08 (año 2026, en centavos). */
export const CU_DJ08_SCALE_2026: Array<{
  fromCents: bigint;
  toCents: bigint;
  rate: number;
}> = [
  { fromCents: 0n, toCents: 1_000_000n, rate: 0.15 },
  { fromCents: 1_000_000n, toCents: 2_000_000n, rate: 0.2 },
  { fromCents: 2_000_000n, toCents: 3_000_000n, rate: 0.3 },
  { fromCents: 3_000_000n, toCents: 5_000_000n, rate: 0.4 },
  { fromCents: 5_000_000n, toCents: 999_999_999_900n, rate: 0.5 },
];

/** base × tasa con half-up en centavos (tasa a 4 decimales exactos). */
function applyRate(baseCents: bigint, rate: number): bigint {
  const rateBps = BigInt(Math.round(rate * 10_000));
  return (baseCents * rateBps + 5_000n) / 10_000n;
}

function monthlyObligations(inputs: MonthlyInputs): ObligationLine[] {
  if (inputs.regime === "TCP_SIMPLIFICADO") {
    return [
      {
        code: CU_SIMPLIFIED_QUOTA.code,
        name: CU_SIMPLIFIED_QUOTA.name,
        frequency: "MENSUAL",
        baseCents: 0n,
        amountCents: inputs.fixedQuotaCents,
      },
    ];
  }
  const lines: ObligationLine[] = [];
  for (const c of CU_MONTHLY_CONCEPTS) {
    const base =
      c.base === "sales" ? inputs.salesBaseCents : inputs.payrollCents;
    if (base <= 0n) continue;
    lines.push({
      code: c.code,
      name: c.name,
      frequency: c.frequency,
      baseCents: base,
      amountCents: applyRate(base, c.rate),
    });
  }
  return lines;
}

function annualProjection(inputs: AnnualInputs): AnnualProjection {
  let net =
    inputs.incomeCents - inputs.deductibleExpensesCents - inputs.minExemptCents;
  if (net < 0n) net = 0n;

  const brackets: BracketResult[] = [];
  let taxCents = 0n;
  for (const b of CU_DJ08_SCALE_2026) {
    const span = b.toCents - b.fromCents;
    const taxed =
      net <= b.fromCents ? 0n : net >= b.toCents ? span : net - b.fromCents;
    const tax = applyRate(taxed, b.rate);
    taxCents += tax;
    brackets.push({
      fromCents: b.fromCents,
      toCents: b.toCents,
      rate: b.rate,
      taxedCents: taxed,
      taxCents: tax,
    });
  }
  let balance = taxCents - inputs.advancesPaidCents;
  if (balance < 0n) balance = 0n;
  return { netBaseCents: net, brackets, taxCents, balanceCents: balance };
}

function regimeCompare(inputs: RegimeCompareInputs): RegimeComparison {
  // General: conceptos mensuales anualizados + DJ-08 (los pagos a cuenta se
  // netean dentro de la DJ, así que se suma la DJ total sin el pago a cuenta)
  const monthly = monthlyObligations({
    regime: "TCP_GENERAL",
    salesBaseCents: inputs.annualSalesCents,
    payrollCents: inputs.annualPayrollCents,
    fixedQuotaCents: 0n,
  });
  const advances = monthly.find((l) => l.code === "051012")?.amountCents ?? 0n;
  const monthlyTotal = monthly.reduce((acc, l) => acc + l.amountCents, 0n);
  const dj = annualProjection({
    incomeCents: inputs.annualSalesCents,
    deductibleExpensesCents: inputs.annualDeductibleCents,
    advancesPaidCents: advances,
    minExemptCents: inputs.minExemptCents,
  });
  const generalTotalCents = monthlyTotal + dj.balanceCents;
  const simplifiedTotalCents = inputs.monthlyQuotaCents * 12n;
  const recommendation =
    simplifiedTotalCents < generalTotalCents
      ? "TCP_SIMPLIFICADO"
      : "TCP_GENERAL";
  return { generalTotalCents, simplifiedTotalCents, recommendation };
}

export const cuEngine: FiscalEngine = {
  country: "CU",
  monthlyObligations,
  annualProjection,
  regimeCompare,
};
