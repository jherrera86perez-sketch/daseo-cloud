import { z } from "zod";

export const CUSTOMER_TYPES = ["CLIENTE", "PDV"] as const;
export const PAYMENT_TERMS = [
  "Contado",
  "15 días",
  "30 días",
  "45 días",
  "60 días",
  "90 días",
] as const;
export const CUSTOMER_CATEGORIES = [
  "VIP",
  "Premium",
  "Regular",
  "Nuevo",
  "Inactivo",
] as const;

export const customerInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  taxId: z.string().trim().max(50).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  // ≈ compradores.tipo del ERP (toggle Cliente/PDV) — filtra CxC de verdad
  customerType: z.enum(CUSTOMER_TYPES).default("CLIENTE"),
  commercialType: z.string().trim().max(50).optional(),
  paymentTerms: z.enum(PAYMENT_TERMS).optional(),
  creditDays: z.coerce.number().int().min(0).optional(),
  creditLimit: z
    .string()
    .trim()
    .regex(/^\d+(?:[.,]\d{1,2})?$/)
    .optional(),
  discountDefaultPct: z
    .string()
    .trim()
    .regex(/^\d+(?:[.,]\d{1,2})?$/)
    .optional(),
  category: z.enum(CUSTOMER_CATEGORIES).optional(),
  // ≈ clientes.fecha_nacimiento del ERP: alimenta el saludo de cumpleaños
  birthDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  active: z.coerce.boolean().default(true),
  blocked: z.coerce.boolean().default(false),
  blockReason: z.string().trim().max(500).optional(),
});
// z.input (no z.infer): los defaults de customerType/active/blocked deben
// quedar OPCIONALES para createCustomer/updateCustomer — si se omiten, la
// columna de Postgres aplica su propio default (retrocompat con todos los
// fixtures de test que crean clientes con solo {name}).
export type CustomerInput = z.input<typeof customerInputSchema>;

export const contactInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().max(100).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

export const INTERACTION_TYPES = [
  "call",
  "meeting",
  "email",
  "whatsapp",
  "note",
] as const;

export const interactionInputSchema = z.object({
  type: z.enum(INTERACTION_TYPES),
  content: z.string().trim().min(1).max(2000),
  occurredAt: z.coerce.date(),
});
export type InteractionInput = z.infer<typeof interactionInputSchema>;
