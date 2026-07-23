/**
 * Activa manualmente la suscripción (plan pro / active) de las orgs dadas.
 * Uso: node scripts/activate-orgs.mjs demo daseo   (requiere DATABASE_URL)
 * Es el "cobro manual CU" por consola; el panel /admin hace lo mismo por UI.
 */
import { neon } from "@neondatabase/serverless";

const slugs = process.argv.slice(2);
if (slugs.length === 0) {
  console.error("Uso: node scripts/activate-orgs.mjs <slug> [slug...]");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const r = await sql.query(
  `insert into subscriptions (org_id, plan, status, activated_at, notes)
   select id, 'pro', 'active', now(), 'activacion manual'
   from organization where slug = any($1)
   on conflict (org_id) do update
     set plan = 'pro', status = 'active',
         activated_at = coalesce(subscriptions.activated_at, now())
   returning org_id`,
  [slugs],
);
const rows = r.rows ?? r;
console.log(`Suscripciones activadas: ${rows.length} (${slugs.join(", ")})`);
