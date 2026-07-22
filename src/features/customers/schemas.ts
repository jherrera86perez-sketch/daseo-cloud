import { z } from "zod";

export const customerInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  taxId: z.string().trim().max(50).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

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
