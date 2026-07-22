/**
 * Importador CubaOne ERP → Daseo Cloud.
 *
 * Uso:
 *   node scripts/import-cubaone.mjs --list
 *   node scripts/import-cubaone.mjs --org <slug> --file <export.json> [--dry]
 *
 * El JSON viene de exportar la BD SQLite local (solo lectura):
 * clientes, productos (+kardex saldo/costo), tasas, recetas, receta_insumos.
 * Importa: clientes → customers · productos → products · stock inicial →
 * inventory_movements (entrada al costo promedio) · última tasa → exchange_rates
 * · recetas → recipes/recipe_items. Idempotente por nombre (no duplica si se
 * corre dos veces).
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? true) : undefined;
};

const sql = neon(process.env.DATABASE_URL);
const q = async (text, params) => {
  const r = await sql.query(text, params);
  return r.rows ?? r;
};

if (flag("list")) {
  const orgs = await q(
    "select id, name, slug, created_at from organization order by created_at",
  );
  console.log("ORGS:");
  for (const o of orgs) console.log("  ", o.slug, "|", o.name, "|", o.id);
  const users = await q('select email from "user" order by created_at');
  console.log("USERS:");
  for (const u of users) console.log("  ", u.email);
  process.exit(0);
}

const slug = flag("org");
const file = flag("file");
const dry = Boolean(flag("dry"));
if (!slug || !file) {
  console.error("Falta --org <slug> o --file <export.json>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(file, "utf8"));
const orgRes = await q("select id, name from organization where slug = $1", [
  slug,
]);
if (!orgRes[0]) {
  console.error(`No existe la organización con slug "${slug}"`);
  process.exit(1);
}
const orgId = orgRes[0].id;
console.log(`Importando a: ${orgRes[0].name} (${orgId})${dry ? " [DRY]" : ""}`);

const toCents = (n) => Math.round(Number(n ?? 0) * 100);
const q3 = (n) => Number(n ?? 0).toFixed(3);
const unitOf = (u, recetaUnit) => {
  const s = String(recetaUnit ?? u ?? "").toLowerCase();
  if (s === "l" || s === "lt" || s === "litro") return "L";
  if (s === "kg") return "kg";
  return "unit";
};

// ---- clientes ----
let created = { customers: 0, products: 0, stock: 0, rates: 0, recipes: 0 };
const existingCustomers = await q(
  "select name from customers where org_id = $1",
  [orgId],
);
const haveCust = new Set(existingCustomers.map((r) => r.name));
for (const c of data.clientes) {
  const name = String(c.nombre ?? "").trim();
  if (!name || haveCust.has(name)) continue;
  if (!dry) {
    await q(
      `insert into customers (org_id, name, phone, address, email, notes)
       values ($1,$2,$3,$4,$5,$6)`,
      [
        orgId,
        name,
        c.telefono || null,
        c.direccion || null,
        c.email || null,
        c.tipo ? `Tipo (CubaOne): ${c.tipo}` : null,
      ],
    );
  }
  created.customers++;
}

// ---- productos (+ stock inicial) ----
const kardexByProduct = new Map(
  (data.kardex ?? []).map((k) => [k.producto_id, k]),
);
// unidad real: si alguna receta produce este producto, usar su unidad_base
const recipeUnitByProduct = new Map(
  (data.recetas ?? []).map((r) => [r.producto_final_id, r.unidad_base]),
);
const existingProducts = await q(
  "select id, name from products where org_id = $1",
  [orgId],
);
const productIdByName = new Map(existingProducts.map((r) => [r.name, r.id]));
const cloudIdByLocalId = new Map();

for (const p of data.productos) {
  const name = String(p.nombre ?? "").trim();
  if (!name) continue;
  let cloudId = productIdByName.get(name);
  if (!cloudId) {
    const unit = unitOf(p.unidad, recipeUnitByProduct.get(p.id));
    if (!dry) {
      const res = await q(
        `insert into products
           (org_id, name, sku, description, unit, price_cents, currency,
            is_sellable, is_component, is_producible, stock_min)
         values ($1,$2,$3,$4,$5,$6,'CUP',$7,$8,$9,$10)
         returning id`,
        [
          orgId,
          name,
          p.sku || null,
          p.descripcion || null,
          unit,
          toCents(p.precio),
          Boolean(p.es_vendible),
          Boolean(p.es_componente),
          Boolean(p.es_producible),
          q3(p.stock_minimo),
        ],
      );
      cloudId = res[0].id;
    }
    created.products++;
  }
  if (cloudId) cloudIdByLocalId.set(p.id, cloudId);

  // stock inicial desde el kardex (solo si el producto aún no tiene movimientos)
  const k = kardexByProduct.get(p.id);
  // saldos que redondean a 0.000 no entran (violarían qty <> 0)
  if (cloudId && k && Number(q3(k.saldo_cantidad)) > 0) {
    const has = await q(
      "select 1 from inventory_movements where org_id=$1 and product_id=$2 limit 1",
      [orgId, cloudId],
    );
    if (!has[0]) {
      const qty = q3(k.saldo_cantidad);
      const cost = toCents(k.costo_promedio);
      if (!dry) {
        await q(
          `insert into inventory_movements
             (org_id, product_id, type, qty, unit_cost_base_cents,
              balance_qty, balance_avg_cost_base_cents, source_type, note)
           values ($1,$2,'manual',$3,$4,$3,$4,'manual','Importado de CubaOne ERP')`,
          [orgId, cloudId, qty, cost],
        );
      }
      created.stock++;
    }
  }
}

// ---- tasa vigente (la más reciente USD→CUP) ----
const latest = (data.tasas ?? []).find(
  (t) => t.moneda_origen === "USD" && t.moneda_destino === "CUP",
);
if (latest) {
  const has = await q(
    "select 1 from exchange_rates where org_id=$1 and currency='USD' limit 1",
    [orgId],
  );
  if (!has[0]) {
    if (!dry) {
      await q(
        `insert into exchange_rates (org_id, currency, rate_to_base)
         values ($1,'USD',$2)`,
        [orgId, Number(latest.tasa).toFixed(6)],
      );
    }
    created.rates++;
  }
}

// ---- recetas ----
// Escala ×100: las fórmulas de CubaOne son "por 1 L" con insumos de
// milésimas (0.0021/L) que no caben en numeric(14,3). Por lote de 100
// conservan la precisión y reflejan los lotes reales.
const SCALE = 100;
const prodNameByLocalId = new Map(
  data.productos.map((p) => [p.id, String(p.nombre ?? "").trim()]),
);
for (const r of data.recetas ?? []) {
  const finalCloudId = cloudIdByLocalId.get(r.producto_final_id);
  if (!finalCloudId) continue;
  const rname = `Receta ${prodNameByLocalId.get(r.producto_final_id) ?? r.id}`;
  const has = await q(
    "select 1 from recipes where org_id=$1 and name=$2 and deleted_at is null limit 1",
    [orgId, rname],
  );
  if (has[0]) continue;
  const items = (data.receta_insumos ?? []).filter(
    (i) =>
      i.receta_id === r.id &&
      cloudIdByLocalId.get(i.producto_id) &&
      Number(q3(i.cantidad_por_unidad * SCALE)) > 0,
  );
  if (items.length === 0) continue;
  if (!dry) {
    const res = await q(
      `insert into recipes (org_id, product_id, name, output_qty)
       values ($1,$2,$3,$4) returning id`,
      [orgId, finalCloudId, rname, q3(r.cantidad_base * SCALE)],
    );
    for (const i of items) {
      await q(
        `insert into recipe_items (org_id, recipe_id, product_id, qty)
         values ($1,$2,$3,$4)`,
        [
          orgId,
          res[0].id,
          cloudIdByLocalId.get(i.producto_id),
          q3(i.cantidad_por_unidad * SCALE),
        ],
      );
    }
  }
  created.recipes++;
}

console.log("Importado:", created);
