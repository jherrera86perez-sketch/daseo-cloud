// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, statements, statementMovements } from "@/db/schema";
import {
  analyticsResumen,
  analyticsClientes,
  clienteFicha,
  heatmapDiaSemana,
} from "./analytics";

let db: TestDb;
let orgId: string;
const USERLESS_STMT = { filename: "test.pdf" };

// Inserta un movimiento CR/DB con fecha ISO (control preciso de períodos).
async function mov(
  stmtId: string,
  fechaIso: string,
  operacion: "CR" | "DB",
  importe: number,
  clientName: string | null,
  pan: string | null = null,
  telefono: string | null = null,
) {
  const [, anio, mes] = fechaIso.match(/^(\d{4})-(\d{2})/)!.map(Number)
    ? [null, Number(fechaIso.slice(0, 4)), Number(fechaIso.slice(5, 7))]
    : [null, null, null];
  await db.insert(statementMovements).values({
    orgId,
    statementId: stmtId,
    position: 0,
    fecha: null,
    fechaIso,
    mes,
    anio,
    referencia: "XX000000000997",
    operacion,
    importe: importe.toFixed(2),
    saldo: null,
    observacion: null,
    clientName,
    panOrigen: pan,
    tipoTransaccion: "BANCA_MOVIL",
    telefono,
  });
}

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [org] = await db
    .insert(organizations)
    .values({ name: "A", slug: "f8m3" })
    .returning();
  orgId = org.id;
  const [stmt] = await db
    .insert(statements)
    .values({ orgId, ...USERLESS_STMT })
    .returning();

  // CLIENTE UNO: activo en junio (prev) y julio (actual) → recurrente, delta
  await mov(
    stmt.id,
    "2026-06-10",
    "CR",
    100,
    "CLIENTE UNO",
    "P1",
    "5351111111",
  );
  await mov(stmt.id, "2026-07-01", "CR", 150, "CLIENTE UNO", "P1");
  await mov(stmt.id, "2026-07-15", "CR", 50, "CLIENTE UNO", "P1");
  // CLIENTE DOS: primera op en julio → es_nuevo
  await mov(stmt.id, "2026-07-08", "CR", 300, "CLIENTE DOS", "P2");
  // débito y movimiento sin cliente (excluidos del ranking)
  await mov(stmt.id, "2026-07-20", "DB", 80, "CLIENTE UNO", "P1");
  await mov(stmt.id, "2026-07-05", "CR", 999, null);
});

describe("analytics de estados de cuenta (F8-M3)", () => {
  it("resumen agrupa por mes con totales y clientes distintos", async () => {
    const rows = await analyticsResumen(db, orgId, { agrupacion: "mes" });
    const jul = rows.find((r) => r.periodo === 2026 && r.periodo2 === 7)!;
    expect(jul.total_creditos).toBe(1499); // 150+50+300+999
    expect(jul.total_debitos).toBe(80);
    expect(jul.num_operaciones).toBe(5);
    expect(jul.clientes_distintos).toBe(2);
  });

  it("clientes: métricas, delta vs mes anterior, es_nuevo y KPIs Pareto", async () => {
    const { rows, kpis } = await analyticsClientes(db, orgId, {
      anio: 2026,
      mes: 7,
    });
    expect(rows).toHaveLength(2);
    const [dos, uno] = rows; // orden: total_creditos desc → DOS(300), UNO(200)
    expect(dos.client_name).toBe("CLIENTE DOS");
    expect(dos.es_nuevo).toBe(true);
    expect(dos.delta_pct).toBeNull(); // sin mes anterior

    expect(uno.client_name).toBe("CLIENTE UNO");
    expect(uno.total_creditos).toBe(200);
    expect(uno.total_debitos).toBe(80);
    expect(uno.num_ops).toBe(3); // 2 CR + 1 DB en julio
    expect(uno.telefono).toBeNull(); // el teléfono vino en junio, no en julio
    expect(uno.es_nuevo).toBe(false); // su primera op global fue en junio
    expect(uno.total_mes_anterior).toBe(100);
    expect(uno.delta_pct).toBe(100); // (200-100)/100

    expect(kpis.total_clientes).toBe(2);
    expect(kpis.total_ingresos).toBe(500);
    expect(kpis.nuevos).toBe(1);
    expect(kpis.recurrentes).toBe(1);
    // top20: ceil(2*0.2)=1 → el top1 (300) sobre 500 = 60%
    expect(kpis.top20_pct).toBe(60);
  });

  it("ficha del cliente: stats, timeline y por_mes", async () => {
    const ficha = await clienteFicha(db, orgId, "CLIENTE UNO", "P1");
    expect(ficha.cliente?.telefono).toBe("5351111111");
    expect(ficha.stats?.num_creditos).toBe(3);
    expect(ficha.stats?.total_creditos).toBe(300);
    expect(ficha.stats?.meses_activo).toBe(2);
    expect(ficha.por_mes).toEqual([
      { mes: "2026-06", total: 100 },
      { mes: "2026-07", total: 200 },
    ]);
    const vacia = await clienteFicha(db, orgId, "NADIE");
    expect(vacia.cliente).toBeNull();
  });

  it("heatmap por día de semana (Lun→Dom, solo créditos)", async () => {
    const dias = await heatmapDiaSemana(db, orgId, { anio: 2026, mes: 7 });
    expect(dias).toHaveLength(7);
    expect(dias.map((d) => d.label)).toEqual([
      "Lun",
      "Mar",
      "Mié",
      "Jue",
      "Vie",
      "Sáb",
      "Dom",
    ]);
    // 2026-07-01 fue miércoles: CR de 150 ahí
    const mie = dias.find((d) => d.label === "Mié")!;
    expect(mie.num_ops).toBeGreaterThanOrEqual(1);
    const totalOps = dias.reduce((a, d) => a + d.num_ops, 0);
    expect(totalOps).toBe(4); // solo los 4 CR de julio... más el de junio? no: filtro mes=7 → 150,50,300,999
  });
});
