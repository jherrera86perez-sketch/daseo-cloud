/** Estado de acceso derivado de la suscripción (lógica pura, testeable). */
export type GateState =
  | { kind: "ok" }
  | { kind: "trial"; daysLeft: number }
  | { kind: "trial-expired" }
  | { kind: "suspended" };

const DAY_MS = 24 * 3600 * 1000;
/** Aviso solo cuando el trial está por vencer (o vencido); antes, silencio. */
const WARN_DAYS = 3;

export function subscriptionGate(
  sub: { status: string; trialEndsAt: Date | null },
  now: Date,
): GateState {
  if (sub.status === "suspended") return { kind: "suspended" };
  if (sub.status === "active") return { kind: "ok" };
  // trialing
  if (!sub.trialEndsAt) return { kind: "ok" };
  const msLeft = sub.trialEndsAt.getTime() - now.getTime();
  if (msLeft <= 0) return { kind: "trial-expired" };
  const daysLeft = Math.ceil(msLeft / DAY_MS);
  if (daysLeft <= WARN_DAYS) return { kind: "trial", daysLeft };
  return { kind: "ok" };
}
