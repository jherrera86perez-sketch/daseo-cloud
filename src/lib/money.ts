/**
 * Dinero en Daseo Cloud — reglas cerradas del plan:
 * - Montos SIEMPRE en centavos `bigint` (nunca float).
 * - Tasa de cambio: "1 unidad de la moneda = X de la moneda base",
 *   con 6 decimales de precisión (micros).
 * - Redondeo half-up, y SOLO aquí: este módulo es el único lugar
 *   del sistema donde se redondea dinero.
 * - La conversión a base se hace UNA vez por documento, nunca por línea.
 */

export const CURRENCIES = ["CUP", "USD", "BRL"] as const;
export type Currency = (typeof CURRENCIES)[number];

const DECIMAL_RE = /^(\d+)(?:[.,](\d{1,2}))?$/;
const RATE_RE = /^(\d+)(?:[.,](\d{1,6}))?$/;

const RATE_SCALE = 1_000_000n;

/** "1234.56" | "1234,56" → 123456n. Rechaza negativos, >2 decimales y basura. */
export function parseDecimalToCents(input: string): bigint {
  const m = DECIMAL_RE.exec(input.trim());
  if (!m) {
    throw new Error(`Monto inválido: "${input}"`);
  }
  const whole = BigInt(m[1]);
  const frac = BigInt((m[2] ?? "").padEnd(2, "0") || "0");
  return whole * 100n + frac;
}

/** 123456n → "1234.56" (siempre 2 decimales, punto fijo). */
export function centsToDecimalString(cents: bigint): string {
  if (cents < 0n) {
    throw new Error("centsToDecimalString no acepta negativos");
  }
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** "320.5" → 320500000n (micros). Rechaza cero, negativos y >6 decimales. */
export function parseRateToMicros(input: string): bigint {
  const m = RATE_RE.exec(input.trim());
  if (!m) {
    throw new Error(`Tasa inválida: "${input}"`);
  }
  const whole = BigInt(m[1]);
  const frac = BigInt((m[2] ?? "").padEnd(6, "0") || "0");
  const micros = whole * RATE_SCALE + frac;
  if (micros <= 0n) {
    throw new Error(`La tasa debe ser positiva: "${input}"`);
  }
  return micros;
}

/**
 * Convierte centavos de una moneda a centavos de la moneda base usando la
 * tasa fijada del documento. Redondeo half-up.
 */
export function convertToBase(amountCents: bigint, rateToBase: string): bigint {
  if (amountCents < 0n) {
    throw new Error("convertToBase no acepta montos negativos");
  }
  const rateMicros = parseRateToMicros(rateToBase);
  const product = amountCents * rateMicros;
  const half = RATE_SCALE / 2n;
  return (product + half) / RATE_SCALE;
}
