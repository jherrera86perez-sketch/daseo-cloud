/**
 * Higiene: elimina organizaciones de prueba (E2E) y sus usuarios @daseo.test.
 * PROTEGIDO: jamás toca la org con slug "daseo" ni usuarios con email real.
 * Uso: node scripts/clean-test-orgs.mjs [--apply]   (sin --apply: solo cuenta)
 */
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const q = async (t, p) => {
  const r = await sql.query(t, p);
  return r.rows ?? r;
};
const apply = process.argv.includes("--apply");

// candidatas por patrón de los specs E2E, nunca la real
const orgs = await q(`
  select id, slug from organization
  where slug <> 'daseo'
    and (slug like 'e2e-%' or slug like 'org-m%' or slug = 'daseo-demo')
`);

// seguridad: si alguna tiene un miembro con email que NO es @daseo.test, se excluye
const safe = [];
for (const o of orgs) {
  const humans = await q(
    `select u.email from member m join "user" u on u.id = m.user_id
     where m.organization_id = $1 and u.email not like '%@daseo.test'`,
    [o.id],
  );
  if (humans.length === 0) safe.push(o.id);
  else
    console.log(
      "EXCLUIDA (tiene usuario real):",
      o.slug,
      humans.map((h) => h.email),
    );
}
console.log(`Orgs candidatas: ${orgs.length} · a borrar: ${safe.length}`);
if (safe.length === 0) process.exit(0);

const tables = [
  "payments",
  "sale_items",
  "sales",
  "quote_items",
  "quotes",
  "deals",
  "production_inputs",
  "production_orders",
  "recipe_items",
  "recipes",
  "inventory_movements",
  "interactions",
  "contacts",
  "customers",
  "products",
  "exchange_rates",
  "document_sequences",
  "pipeline_stages",
  "org_settings",
  "audit_logs",
  "invitation",
];

for (const t of tables) {
  const col = t === "invitation" ? "organization_id" : "org_id";
  if (apply) {
    const del = await q(
      `delete from ${t} where ${col} = any($1::uuid[]) returning 1`,
      [safe],
    );
    console.log(`  ${t}: ${del.length} filas borradas`);
  } else {
    const c = await q(
      `select count(*) c from ${t} where ${col} = any($1::uuid[])`,
      [safe],
    );
    console.log(`  ${t}: ${c[0].c} filas`);
  }
}

if (apply) {
  const delOrgs = await q(
    "delete from organization where id = any($1::uuid[]) returning 1",
    [safe],
  );
  console.log(`organizaciones borradas: ${delOrgs.length}`);
  // audit_logs de eventos de auth (org_id null) referencian usuarios
  await q(
    `delete from audit_logs where user_id in
       (select id from "user" where email like '%@daseo.test')`,
  );
  const delUsers = await q(
    `delete from "user" where email like '%@daseo.test' returning email`,
  );
  console.log(`usuarios de prueba borrados: ${delUsers.length}`);
} else {
  const u = await q(
    `select count(*) c from "user" where email like '%@daseo.test'`,
  );
  console.log(`usuarios de prueba: ${u[0].c}`);
  console.log("\n[SIMULACIÓN] — ejecuta con --apply para borrar");
}
