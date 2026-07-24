import { z } from "zod";

export const PRODUCT_UNITS = ["kg", "L", "unit"] as const;

export const productInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(50).optional(),
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
