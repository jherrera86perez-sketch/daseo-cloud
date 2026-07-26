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
const incluirConDatos = process.argv.includes("--incluir-huerfanas-con-datos");

// Candidatas por FIRMA, no por prefijo de slug.
//
// Antes esto era una lista blanca de prefijos ('e2e-%', 'org-m%', 'org-f%',
// 'org-ad-%'). Falla en silencio: el spec de paridad visual estrenó el prefijo
// 'org-vh-' y la limpieza dejó de verlo — 141 orgs acumuladas en producción
// entre el 24 y el 26 de julio, sin que nada avisara. Cada spec nuevo con
// prefijo nuevo reabría el agujero.
//
// La firma de una org de prueba no es su nombre: es que TODOS sus miembros
// sean usuarios @daseo.test. Eso no cambia cuando alguien inventa un prefijo.
//
// Se exige `having count(*) > 0`: una org SIN miembros no es candidata. Podría
// ser una org real a medio crear, y el coste de equivocarse es asimétrico.
const PROTEGIDAS = ["daseo", "demo"]; // piloto real y demo pública
const orgs = await q(
  `select o.id, o.slug from organization o
   where o.slug <> all($1::text[])
     and exists (select 1 from member m where m.organization_id = o.id)
     and not exists (
       select 1 from member m join "user" u on u.id = m.user_id
       where m.organization_id = o.id and u.email not like '%@daseo.test')`,
  [PROTEGIDAS],
);

// Segunda pasada del mismo criterio, por org, para poder informar cuál se
// excluye y por qué. Redundante con la query de arriba a propósito: es la
// comprobación que impide un borrado en producción, no una optimización.
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
// Tablas de negocio descubiertas por columna org_id (a prueba de fases
// futuras: una tabla nueva jamás vuelve a romper esta limpieza). Borrado en
// pasadas repetidas hasta que las FKs dejen de estorbar.
const discovered = await q(
  `select distinct table_name from information_schema.columns
   where column_name = 'org_id' and table_schema = 'public'`,
);
const tablas = discovered.map((t) => t.table_name);

// SEGUNDA FIRMA: orgs huérfanas — cero miembros Y cero filas en TODAS las
// tablas de negocio. Los specs E2E dejan estos cascarones cuando abortan antes
// de crear el usuario; sin miembro, la firma de arriba no las ve nunca.
//
// El "cero filas en todas las tablas" no es adorno: una org sin miembros pero
// CON datos sería un accidente de otro tipo (miembro borrado a mano, migración
// a medias) y borrarla perdería información. Esas se informan y se dejan.
const huerfanas = await q(
  `select o.id, o.slug from organization o
   where o.slug <> all($1::text[])
     and not exists (select 1 from member m where m.organization_id = o.id)`,
  [PROTEGIDAS],
);
// Una consulta POR TABLA preguntando qué org_ids aparecen, no una por org y
// tabla: con 141 huérfanas y ~30 tablas, lo segundo son 4.200 viajes HTTP a
// Neon y agota el timeout. Así son ~30.
const idsHuerfanas = huerfanas.map((o) => o.id);
const conDatos = new Map(); // orgId -> ["tabla=n", ...]
if (idsHuerfanas.length > 0) {
  for (const t of tablas) {
    const filas = await q(
      `select org_id, count(*)::int n from "${t}"
       where org_id = any($1::uuid[]) group by org_id`,
      [idsHuerfanas],
    );
    for (const f of filas) {
      if (!conDatos.has(f.org_id)) conDatos.set(f.org_id, []);
      conDatos.get(f.org_id).push(`${t}=${f.n}`);
    }
  }
}
// Tablas que se llenan solas al crear una org (hook afterCreateOrganization de
// auth.ts y el alta de suscripción). Tener filas SOLO aquí no es información:
// es el estado por defecto que recibe cualquier org, real o no.
const SEMBRADAS_AL_CREAR = ["org_settings", "pipeline_stages", "subscriptions"];

const vacias = [];
const conContenido = [];
for (const o of huerfanas) {
  const tocadas = (conDatos.get(o.id) ?? []).map((s) => s.split("=")[0]);
  const propias = tocadas.filter((t) => !SEMBRADAS_AL_CREAR.includes(t));
  if (propias.length === 0) vacias.push(o.id);
  else conContenido.push(o);
}

// Huérfanas CON contenido propio: sin miembros nadie puede alcanzarlas por la
// app, así que casi siempre son restos de un spec que abortó. Pero el borrado
// es irreversible y en producción, así que por defecto NO se tocan: hace falta
// que un humano vea los recuentos y lo pida con la bandera.
// Precedente: el 26/07 fueron 141 orgs 'org-vh-*' con 262 vehicles creados por
// el spec de vehículos, y se borraron tras respaldar a JSON.
if (conContenido.length > 0) {
  const resumen = new Map();
  for (const o of conContenido)
    for (const par of conDatos.get(o.id) ?? []) {
      const [t, n] = par.split("=");
      resumen.set(t, (resumen.get(t) ?? 0) + Number(n));
    }
  console.log(
    `\nHuérfanas con contenido propio: ${conContenido.length} — ${[...resumen]
      .map(([t, n]) => `${t}=${n}`)
      .join(" ")}`,
  );
  if (incluirConDatos) {
    console.log("  --incluir-huerfanas-con-datos: se incluyen en el borrado.");
    vacias.push(...conContenido.map((o) => o.id));
  } else {
    console.log(
      "  NO se borran. Revisa los recuentos y, si son restos de tests,",
      "repite con --incluir-huerfanas-con-datos (respalda antes).",
    );
  }
}

console.log(
  `Orgs de prueba con usuarios @daseo.test: ${orgs.length} · a borrar: ${safe.length}`,
);
console.log(
  `Orgs huérfanas sin miembros: ${huerfanas.length} · vacías y a borrar: ${vacias.length}`,
);
safe.push(...vacias);
console.log(`TOTAL a borrar: ${safe.length}`);
if (safe.length === 0) process.exit(0);

let pending = tablas.concat(["invitation"]);

if (apply) {
  for (let pass = 0; pass < 10 && pending.length > 0; pass++) {
    const next = [];
    for (const t of pending) {
      const col = t === "invitation" ? "organization_id" : "org_id";
      try {
        const del = await q(
          `delete from "${t}" where ${col} = any($1::uuid[]) returning 1`,
          [safe],
        );
        console.log(`  ${t}: ${del.length} filas borradas`);
      } catch {
        next.push(t); // FK aún referenciada: próxima pasada
      }
    }
    if (next.length === pending.length) {
      console.error("Sin progreso; quedan:", next.join(", "));
      process.exit(1);
    }
    pending = next;
  }
} else {
  for (const t of pending) {
    const col = t === "invitation" ? "organization_id" : "org_id";
    const c = await q(
      `select count(*) c from "${t}" where ${col} = any($1::uuid[])`,
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
  // assistant_followups.user_id también referencia usuarios (FK sin cascade)
  await q(
    `update assistant_followups set user_id = null where user_id in
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
