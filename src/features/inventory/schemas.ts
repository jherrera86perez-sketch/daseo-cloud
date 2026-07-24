import { z } from "zod";

export const PRODUCT_UNITS = ["kg", "L", "unit"] as const;
export const PRODUCT_CATEGORIES = [
  "insumo",
  "semi_elaborado",
  "producto_final",
  "servicio",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const productInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    sku: z.string().trim().max(50).optional(),
    // ≈ codigo_barras del ERP: obligatorio salvo categoría 'servicio'
    barcode: z.string().trim().max(100).optional(),
    category: z.enum(PRODUCT_CATEGORIES).optional(),
    description: z.string().trim().max(1000).optional(),
    unit: z.enum(PRODUCT_UNITS).default("unit"),
    // precio de venta en moneda base (decimal); vacío = 0 (sin precio)
    price: z
      .string()
      .trim()
      .regex(/^\d+(?:[.,]\d{1,2})?$/)
      .optional(),
    isSellable: z.coerce.boolean().default(true),
    isComponent: z.coerce.boolean().default(false),
    isProducible: z.coerce.boolean().default(false),
    stockMin: z
      .string()
      .trim()
      .regex(/^\d+(?:[.,]\d{1,3})?$/)
      .optional(),
    // ≈ stock_minimo_modo del ERP: si el usuario toca stockMin a mano sin
    // pasar 'auto' explícito, el caller debe forzar 'manual' (ver queries.ts)
    stockMinMode: z.enum(["manual", "auto"]).default("manual"),
    leadDays: z.coerce.number().int().min(0).default(7),
    safetyDays: z.coerce.number().int().min(0).default(3),
  })
  .refine((d) => !d.category || d.category === "servicio" || !!d.barcode, {
    // Literal del ERP. Solo aplica si se eligió categoría (los productos
    // sin categorizar de antes de esta paridad no se ven afectados).
    message: "El código de barras es obligatorio",
    path: ["barcode"],
  });
export type ProductInput = z.input<typeof productInputSchema>;

export const MOVEMENT_KINDS = ["in", "out", "adjust_in", "adjust_out"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const movementInputSchema = z.object({
  productId: z.string().uuid(),
  kind: z.enum(MOVEMENT_KINDS),
  qty: z
    .string()
    .trim()
    .regex(/^\d+(?:[.,]\d{1,3})?$/),
  // costo unitario en centavos de la moneda BASE (requerido en entradas)
  unitCostCents: z.coerce.bigint().nonnegative().optional(),
  note: z.string().trim().max(500).optional(),
});
export type MovementInput = z.infer<typeof movementInputSchema>;
