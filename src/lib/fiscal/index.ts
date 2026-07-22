import type { FiscalEngine } from "./types";
import { cuEngine } from "./cu";

export * from "./types";

const engines: Record<string, FiscalEngine> = {
  CU: cuEngine,
};

/** BR (NF-e/SEFAZ) llegará como otra implementación de la misma interfaz. */
export function getFiscalEngine(
  country: string | null | undefined,
): FiscalEngine | null {
  if (!country) return null;
  return engines[country.toUpperCase()] ?? null;
}
