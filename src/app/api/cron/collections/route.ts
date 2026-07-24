import { isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { orgSettings } from "@/db/schema";
import {
  buildCollectionsSummary,
  buildBirthdaySummary,
  logBirthdaysSent,
  sendTelegramMessage,
  type NotifySettings,
} from "@/features/platform/notify";

/**
 * Cron diario (vercel.json): envía el resumen de cobranza + saludos de
 * cumpleaños del día por Telegram a cada org que lo tenga configurado
 * (≈ cumpleanios-cron.js del ERP, plegado aquí — no en un cron aparte —
 * porque el plan Hobby de Vercel limita los cron jobs por proyecto).
 * Protegido con CRON_SECRET.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const orgs = await db
    .select()
    .from(orgSettings)
    .where(isNotNull(orgSettings.notifySettings));
  const now = new Date();
  let sent = 0;
  let birthdaysSent = 0;
  for (const org of orgs) {
    const notify = org.notifySettings as NotifySettings | null;
    if (!notify?.telegramBotToken || !notify?.telegramChatId) continue;
    const text = await buildCollectionsSummary(db, org.orgId, {
      diasMin: notify.cobranzaDiasMin,
      montoMinCents: notify.cobranzaMontoMinCents
        ? BigInt(notify.cobranzaMontoMinCents)
        : undefined,
    });
    const ok = await sendTelegramMessage(
      notify.telegramBotToken,
      notify.telegramChatId,
      text,
    );
    if (ok) sent++;

    const { text: birthdayText, customerIds } = await buildBirthdaySummary(
      db,
      org.orgId,
      now,
    );
    if (birthdayText) {
      const birthdayOk = await sendTelegramMessage(
        notify.telegramBotToken,
        notify.telegramChatId,
        birthdayText,
      );
      if (birthdayOk) {
        await logBirthdaysSent(
          db,
          org.orgId,
          customerIds,
          now.getUTCFullYear(),
        );
        birthdaysSent++;
      }
    }
  }
  return Response.json({ sent, birthdaysSent });
}
