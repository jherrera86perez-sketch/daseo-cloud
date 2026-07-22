/**
 * Cantidades de inventario: numeric(14,3) en BD, bigint "milis" (×1000) en
 * memoria. Igual que money.ts: aquí vive el ÚNICO redondeo de cantidades.
 */

const QTY_RE = /^(\d+)(?:[.,](\d{1,3}))?$/;

/** "12,345" | "12.345" → 12345n (milésimas). Rechaza cero y negativos. */
export function parseQtyToMilli(input: string): bigint {
  const m = QTY_RE.exec(input.trim());
  if (!m) {
    throw new Error(`Cantidad inválida: "${input}"`);
  }
  const milli =
    BigInt(m[1]) * 1000n + BigInt((m[2] ?? "").padEnd(3, "0") || "0");
  if (milli <= 0n) {
    throw new Error(`La cantidad debe ser positiva: "${input}"`);
  }
  return milli;
}

/** 12345n → "12.345" (recorta ceros finales; entero si no hay fracción). */
export function milliToQtyString(milli: bigint): string {
  const whole = milli / 1000n;
  const frac = (milli % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/**
 * Costo promedio ponderado (half-up), todo en bigint:
 * (balQty×balAvg + inQty×inCost) / (balQty + inQty)
 */
export function weightedAvgCents(
  balQtyMilli: bigint,
  balAvgCents: bigint,
  inQtyMilli: bigint,
  inCostCents: bigint,
): bigint {
  const totalQty = balQtyMilli + inQtyMilli;
  if (totalQty <= 0n) {
    throw new Error("Cantidad total no positiva en promedio ponderado");
  }
  const totalValue = balQtyMilli * balAvgCents + inQtyMilli * inCostCents;
  return (totalValue + totalQty / 2n) / totalQty;
}
