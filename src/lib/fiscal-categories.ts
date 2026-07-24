/**
 * Catálogo de categorías del consolidado bancario — copia LITERAL de
 * `server/modules/onat/constants/taxCategories.js` del ERP CubaOne (y su
 * espejo `src/constants/fiscalCategories.ts`). Las strings son la clave
 * real: se comparan por valor en SQL (`categoria IN (...)`) y sostienen
 * KPIs y base imponible. NO traducir ni renombrar.
 */

// Ingresos operativos (base ONAT / DJ-08)
export const SALES_CATEGORIES = [
  "Ventas Minoristas",
  "Ventas Mayoristas",
  "Servicios",
  "Producción Mercantil",
  "Exportaciones",
] as const;

// Ingresos NO operativos: no son ingreso fiscal
export const NON_OPERATING_INCOME_CATEGORIES = [
  "Cobro de préstamo otorgado",
  "Préstamo recibido",
  "Transferencia entre cuentas propias",
  "Aporte de capital",
  "Reembolso recibido",
  "Devolución de venta",
  "Anticipo de cliente",
  "Ajuste bancario (a favor)",
] as const;

export const INCOME_CATEGORIES = [
  ...SALES_CATEGORIES,
  "Otros Ingresos",
  ...NON_OPERATING_INCOME_CATEGORIES,
] as const;

// Egresos deducibles
export const DEDUCTIBLE_EXPENSE_CATEGORIES = [
  "Salarios",
  "Salario Básico",
  "Pago de Vacaciones",
  "Compras Insumos",
  "Electricidad",
  "Teléfono e Internet",
  "Combustibles",
  "Transporte",
  "Alquiler",
  "Mantenimiento",
] as const;

// Egresos NO operativos: no son gasto fiscal
export const NON_OPERATING_EXPENSE_CATEGORIES = [
  "Préstamo otorgado",
  "Pago de préstamo recibido",
  "Transferencia entre cuentas propias",
  "Retiro de capital",
  "Devolución a cliente",
  "Ajuste bancario (en contra)",
] as const;

export const EXPENSE_CATEGORIES = [
  ...DEDUCTIBLE_EXPENSE_CATEGORIES,
  "Impuestos",
  "General",
  "Otros Gastos",
  ...NON_OPERATING_EXPENSE_CATEGORIES,
] as const;

/**
 * Categorías que escriben las salidas internas (fuera del enum fiscal;
 * inventario.js:114-116). "Aseo/Protección al trabajador" SÍ es deducible.
 */
export const INTERNAL_OUTFLOW_CATEGORIES = [
  "Aseo/Protección al trabajador",
  "Donaciones",
  "Regalos",
  "Autoconsumo",
] as const;
export const NON_DEDUCTIBLE_INTERNAL_CATEGORIES = [
  "Donaciones",
  "Regalos",
  "Autoconsumo",
] as const;

export function isNonOperatingCategory(categoria: string | null): boolean {
  if (!categoria) return false;
  return (
    (NON_OPERATING_INCOME_CATEGORIES as readonly string[]).includes(
      categoria,
    ) ||
    (NON_OPERATING_EXPENSE_CATEGORIES as readonly string[]).includes(categoria)
  );
}

export type FiscalImpact =
  "imponible" | "deducible" | "no-deducible" | "ambiguo" | "no-operativa";

export function getFiscalImpact(categoria: string | null): FiscalImpact {
  if (!categoria) return "ambiguo";
  if (isNonOperatingCategory(categoria)) return "no-operativa";
  if ((SALES_CATEGORIES as readonly string[]).includes(categoria)) {
    return "imponible";
  }
  if (
    (DEDUCTIBLE_EXPENSE_CATEGORIES as readonly string[]).includes(categoria) ||
    categoria === "Aseo/Protección al trabajador"
  ) {
    return "deducible";
  }
  if (
    ["Impuestos", "General", "Otros Gastos"].includes(categoria) ||
    (NON_DEDUCTIBLE_INTERNAL_CATEGORIES as readonly string[]).includes(
      categoria,
    )
  ) {
    return "no-deducible";
  }
  return "ambiguo";
}
