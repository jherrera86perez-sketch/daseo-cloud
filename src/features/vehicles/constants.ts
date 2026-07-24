/**
 * ≈ vehicle_tax_categories del ERP CubaOne: catálogo de categorías del
 * impuesto sobre el transporte terrestre (ONAT 071012, "La Chapa"),
 * hardcoded como el ERP real — sin pantalla de config editable. Cuotas
 * anuales 2026 literales de `onat_schema_setup.sql`.
 */
export const VEHICLE_CATEGORIES = [
  { code: "A_MOTO", label: "Motocicletas", annualFeeCents: 11_000n },
  {
    code: "A_LIGERO",
    label: "Autos y Jeeps (1-5 asientos)",
    annualFeeCents: 26_000n,
  },
  {
    code: "A_PANEL",
    label: "Paneles, Camionetas y Autos (+6 asientos)",
    annualFeeCents: 37_500n,
  },
  {
    code: "B_CARGA_LIGERA",
    label: "Camiones (< 1 Tonelada)",
    annualFeeCents: 15_000n,
  },
  {
    code: "B_CARGA_MEDIA",
    label: "Camiones (2-5 Toneladas)",
    annualFeeCents: 45_000n,
  },
] as const;

export type VehicleCategoryCode = (typeof VEHICLE_CATEGORIES)[number]["code"];

export function categoryFeeCents(code: string): bigint {
  return VEHICLE_CATEGORIES.find((c) => c.code === code)?.annualFeeCents ?? 0n;
}

export function categoryLabel(code: string): string {
  return VEHICLE_CATEGORIES.find((c) => c.code === code)?.label ?? code;
}

export const VEHICLE_STATUSES = ["ACTIVE", "SOLD", "JUNK"] as const;
