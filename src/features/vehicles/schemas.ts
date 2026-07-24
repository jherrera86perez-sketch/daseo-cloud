import { z } from "zod";
import { VEHICLE_CATEGORIES, VEHICLE_STATUSES } from "./constants";

const CATEGORY_CODES = VEHICLE_CATEGORIES.map((c) => c.code) as [
  string,
  ...string[],
];

export const vehicleInputSchema = z.object({
  plate: z.string().trim().min(1).max(20),
  brand: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  categoryCode: z.enum(CATEGORY_CODES),
  acquisitionDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  status: z.enum(VEHICLE_STATUSES).default("ACTIVE"),
});
export type VehicleInput = z.input<typeof vehicleInputSchema>;
