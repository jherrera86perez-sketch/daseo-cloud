import { eq, and } from "drizzle-orm";
import { accountsReceivable, diasAtraso } from "@/features/sales/queries";
import { listCommitmentsWithStatus } from "@/features/people/queries";
import { birthdaysToday } from "@/features/customers/queries";
import { telegramBirthdayLog } from "@/db/schema";
import { centsToDecimalString } from "@/lib/money";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Forma de `org_settings.notify_settings` (jsonb, sin tipar en columna) —
 * compartida entre esta feature (F6/Telegram) y el asistente (F5). */
export type NotifySettings = {
  telegramBotToken?: string;
  telegramChatId?: string;
  cobranzaDiasMin?: number;
  cobranzaMontoMinCents?: string; // bigint serializado
  salesGoalBase?: string;
  overdueLimitBase?: string;
};

/** ≈ cobranza_dias_min / cobranza_monto_min del ERP (TaxEngine aparte, este
 * es tg_bots): por defecto solo se avisa lo realmente atrasado y relevante. */
export type CollectionsThresholds = {
  diasMin?: number;
  montoMinCents?: bigint;
};

/** Texto del resumen de cobranza (CxC + compromisos incumplidos). */
export async function buildCollectionsSummary(
  db: Db,
  orgId: string,
  thresholds: CollectionsThresholds = {},
): Promise<string> {
  const diasMin = thresholds.diasMin ?? 7;
  const montoMinCents = thresholds.montoMinCents ?? 10_000n; // $100.00
  const [arAll, commitments] = await Promise.all([
    accountsReceivable(db, orgId),
    listCommitmentsWithStatus(db, orgId),
  ]);
  const ar = arAll.filter(
    (r) => diasAtraso(r) > diasMin && r.balanceCents > montoMinCents,
  );
  const lines: string[] = ["📊 Resumen de cobranza — Daseo Cloud", ""];
  if (ar.length === 0) {
    lines.push("✅ Sin cuentas por cobrar pendientes.");
  } else {
    lines.push(`💰 Cuentas por cobrar (${ar.length}):`);
    for (const r of ar.slice(0, 10)) {
      const label = r.number ? `${r.series}-${r.number}` : "borrador";
      const overdue = r.dueDate && r.dueDate < new Date() ? " ⚠️ VENCIDA" : "";
      lines.push(
        `  • ${label} ${r.customerName}: ${centsToDecimalString(r.balanceCents)} ${r.currency}${overdue}`,
      );
    }
  }
  const due = commitments.filter((c) => !c.fulfilled);
  if (due.length > 0) {
    lines.push("", `📌 Compromisos sin cumplir (${due.length}):`);
    for (const c of due.slice(0, 5)) {
      lines.push(`  • ${c.customerName}: ${c.description}`);
    }
  }
  return lines.join("\n");
}

/**
 * ≈ cumpleanios-cron.js del ERP: clientes cuyo mes-día de nacimiento es hoy,
 * excluyendo a quienes ya se saludaron este año (tg_cumpleanios_log). Cloud
 * no tiene chat_id por cliente (sin bot de entrada) — el saludo se agrega al
 * mismo chat de Telegram que ya usa la cobranza F6.
 */
export async function buildBirthdaySummary(
  db: Db,
  orgId: string,
  now: Date = new Date(),
): Promise<{ text: string | null; customerIds: string[] }> {
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const year = now.getUTCFullYear();
  const candidates = await birthdaysToday(db, orgId, month, day);
  if (candidates.length === 0) return { text: null, customerIds: [] };
  const already = await db
    .select({ customerId: telegramBirthdayLog.customerId })
    .from(telegramBirthdayLog)
    .where(
      and(
        eq(telegramBirthdayLog.orgId, orgId),
        eq(telegramBirthdayLog.year, year),
      ),
    );
  const seen = new Set(
    already.map((r: { customerId: string }) => r.customerId),
  );
  const fresh = candidates.filter((c) => !seen.has(c.id));
  if (fresh.length === 0) return { text: null, customerIds: [] };
  const lines = fresh.map((c) => `🎂 ¡Feliz cumpleaños, ${c.name}! 🎉`);
  return { text: lines.join("\n"), customerIds: fresh.map((c) => c.id) };
}

/** Registra el saludo enviado — idempotencia por (cliente, año). */
export async function logBirthdaysSent(
  db: Db,
  orgId: string,
  customerIds: string[],
  year: number,
): Promise<void> {
  if (customerIds.length === 0) return;
  await db
    .insert(telegramBirthdayLog)
    .values(
      customerIds.map((customerId) => ({
        orgId,
        customerId,
        year,
        status: "sent" as const,
      })),
    )
    .onConflictDoNothing();
}

/** Envío por la API de bots de Telegram (el token es de la org). */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<boolean> {
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    },
  );
  return res.ok;
}
