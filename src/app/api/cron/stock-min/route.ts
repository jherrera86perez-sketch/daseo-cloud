import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { recalcularStockMinimoAuto } from "@/features/inventory/queries";

/**
 * Cron diario (vercel.json): recalcula el stock mínimo de los productos en
 * modo 'auto' — equivalente al setInterval de 24h del ERP (index.js:485).
 * Protegido con CRON_SECRET.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const orgs = await db.select({ id: organizations.id }).from(organizations);
  let totalActualizados = 0;
  for (const org of orgs) {
    const r = await recalcularStockMinimoAuto(db, org.id);
    totalActualizados += r.actualizados;
  }
  return Response.json({ orgs: orgs.length, actualizados: totalActualizados });
}
