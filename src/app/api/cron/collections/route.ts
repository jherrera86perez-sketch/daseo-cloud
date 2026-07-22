import { eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { orgSettings } from "@/db/schema";
import {
  buildCollectionsSummary,
  sendTelegramMessage,
} from "@/features/platform/notify";

/**
 * Cron diario (vercel.json): envía el resumen de cobranza por Telegram a
 * cada org que lo tenga configurado. Protegido con CRON_SECRET.
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
  let sent = 0;
  for (const org of orgs) {
    const notify = org.notifySettings as {
      telegramBotToken?: string;
      telegramChatId?: string;
    } | null;
    if (!notify?.telegramBotToken || !notify?.telegramChatId) continue;
    const text = await buildCollectionsSummary(db, org.orgId);
    const ok = await sendTelegramMessage(
      notify.telegramBotToken,
      notify.telegramChatId,
      text,
    );
    if (ok) sent++;
  }
  return Response.json({ sent });
}

void eq;
