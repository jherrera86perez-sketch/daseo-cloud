import { accountsReceivable } from "@/features/sales/queries";
import { listCommitmentsWithStatus } from "@/features/people/queries";
import { centsToDecimalString } from "@/lib/money";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Texto del resumen de cobranza (CxC + compromisos incumplidos). */
export async function buildCollectionsSummary(
  db: Db,
  orgId: string,
): Promise<string> {
  const [ar, commitments] = await Promise.all([
    accountsReceivable(db, orgId),
    listCommitmentsWithStatus(db, orgId),
  ]);
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
