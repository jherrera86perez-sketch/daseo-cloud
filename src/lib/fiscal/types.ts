/**
 * Contrato del motor fiscal por país (regla del plan: el core nunca importa
 * lógica de un país directamente; cada país implementa esta interfaz).
 */

export type ObligationLine = {
  code: string;
  name: string;
  frequency: "MENSUAL" | "TRIMESTRAL" | "ANUAL";
  baseCents: bigint;
  amountCents: bigint;
};

export type MonthlyInputs = {
  regime: string;
  salesBaseCents: bigint;
  payrollCents: bigint;
  fixedQuotaCents: bigint;
};

export type AnnualInputs = {
  incomeCents: bigint;
  deductibleExpensesCents: bigint;
  advancesPaidCents: bigint;
  minExemptCents: bigint;
};

export type BracketResult = {
  fromCents: bigint;
  toCents: bigint;
  rate: number;
  taxedCents: bigint;
  taxCents: bigint;
};

export type AnnualProjection = {
  netBaseCents: bigint;
  brackets: BracketResult[];
  taxCents: bigint;
  balanceCents: bigint;
};

export type RegimeCompareInputs = {
  annualSalesCents: bigint;
  annualPayrollCents: bigint;
  annualDeductibleCents: bigint;
  monthlyQuotaCents: bigint;
  minExemptCents: bigint;
};

export type RegimeComparison = {
  generalTotalCents: bigint;
  simplifiedTotalCents: bigint;
  recommendation: string;
};

export interface FiscalEngine {
  country: string;
  monthlyObligations(inputs: MonthlyInputs): ObligationLine[];
  annualProjection(inputs: AnnualInputs): AnnualProjection;
  regimeCompare(inputs: RegimeCompareInputs): RegimeComparison;
}
