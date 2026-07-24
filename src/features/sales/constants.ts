// Métodos de pago del ERP (Efectivo/Tarjeta/Transferencia/QR/MLC/USD) + otro.
// Compartido entre actions (Zod) y el form cliente.
export const PAYMENT_METHODS = [
  "cash",
  "card",
  "transfer",
  "qr",
  "mlc",
  "usd",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
