// Verificación del piloto: conteos + muestra de stock/costos de una org.
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const q = async (t, p) => {
  const r = await sql.query(t, p);
  return r.rows ?? r;
};
const [org] = await q("select id,name from organization where slug=$1", [
  process.argv[2],
]);
const counts = {};
for (const t of [
  "customers",
  "products",
  "inventory_movements",
  "exchange_rates",
  "recipes",
  "recipe_items",
]) {
  counts[t] = (
    await q(`select count(*) c from ${t} where org_id=$1`, [org.id])
  )[0].c;
}
console.log(org.name, counts);
const stock = await q(
  `select p.name, m.balance_qty, m.balance_avg_cost_base_cents
   from inventory_movements m join products p on p.id=m.product_id
   where m.org_id=$1 order by m.balance_qty::numeric desc limit 6`,
  [org.id],
);
for (const s of stock)
  console.log(
    " ",
    s.name.slice(0, 40).padEnd(42),
    s.balance_qty.padStart(10),
    "@",
    (Number(s.balance_avg_cost_base_cents) / 100).toFixed(2),
  );
const [rate] = await q(
  "select currency, rate_to_base from exchange_rates where org_id=$1 order by effective_at desc limit 1",
  [org.id],
);
console.log("tasa vigente:", rate?.currency, "=", rate?.rate_to_base, "CUP");
