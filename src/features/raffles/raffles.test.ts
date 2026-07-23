// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, statements, statementMovements } from "@/db/schema";
import {
  raffleParticipants,
  createRaffle,
  listRaffles,
  deleteRaffle,
} from "./queries";

let db: TestDb;
let orgA: string;
let orgB: string;
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "f8m4a" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "B", slug: "f8m4b" })
    .returning();
  orgA = a.id;
  orgB = b.id;
  const [stmt] = await db
    .insert(statements)
    .values({ orgId: orgA, filename: "jul.pdf" })
    .returning();

  const base = {
    orgId: orgA,
    statementId: stmt.id,
    position: 0,
    anio: 2026,
    mes: 7,
    tipoTransaccion: "BANCA_MOVIL",
  };
  // ANA: 2 transferencias CR (500 total); PEPE: 1 CR (80)
  await db.insert(statementMovements).values([
    {
      ...base,
      fechaIso: "2026-07-02",
      operacion: "CR",
      importe: "300.00",
      clientName: "ANA",
      panOrigen: "PA",
      telefono: "5351111111",
      referencia: "R1",
    },
    {
      ...base,
      fechaIso: "2026-07-09",
      operacion: "CR",
      importe: "200.00",
      clientName: "ANA",
      panOrigen: "PA",
      referencia: "R2",
    },
    {
      ...base,
      fechaIso: "2026-07-05",
      operacion: "CR",
      importe: "80.00",
      clientName: "PEPE",
      panOrigen: "PB",
      referencia: "R3",
    },
    // excluidos: débito, sin cliente, otro mes
    {
      ...base,
      fechaIso: "2026-07-11",
      operacion: "DB",
      importe: "50.00",
      clientName: "ANA",
      panOrigen: "PA",
      referencia: "R4",
    },
    {
      ...base,
      fechaIso: "2026-07-12",
      operacion: "CR",
      importe: "999.00",
      clientName: null,
      referencia: "R5",
    },
    {
      ...base,
      mes: 6,
      fechaIso: "2026-06-12",
      operacion: "CR",
      importe: "10.00",
      clientName: "PEPE",
      panOrigen: "PB",
      referencia: "R6",
    },
  ]);
});

describe("sorteos (F8-M4)", () => {
  it("participantes = clientes con CR del mes, agrupados y ordenados por total", async () => {
    const p = await raffleParticipants(db, orgA, 2026, 7);
    expect(p).toHaveLength(2);
    expect(p[0].client_name).toBe("ANA");
    expect(p[0].num_ops).toBe(2);
    expect(p[0].total_creditos).toBe(500);
    expect(p[0].telefono).toBe("5351111111");
    expect(p[1].client_name).toBe("PEPE");
    expect(p[1].total_creditos).toBe(80);
    // aislamiento
    expect(await raffleParticipants(db, orgB, 2026, 7)).toHaveLength(0);
  });

  it("registrar ganador con defaults del ERP y sin bloqueo por mes repetido", async () => {
    const r1 = await createRaffle(db, orgA, USER, {
      mes: 7,
      anio: 2026,
      ganadorClientName: "ANA",
      ganadorPan: "PA",
      ganadorTelefono: "5351111111",
      ganadorNumOps: 2,
      ganadorTotalCreditos: 500,
      numParticipantes: 2,
    });
    expect(r1.nombre).toBe("Sorteo 7/2026"); // default
    expect(r1.ganadorTotalCreditos).toBe("500.00");
    // repetir el mismo mes está permitido (fiel al ERP)
    const r2 = await createRaffle(db, orgA, USER, {
      nombre: "Sorteo especial",
      mes: 7,
      anio: 2026,
      ganadorClientName: "PEPE",
    });
    expect(r2.nombre).toBe("Sorteo especial");
    const list = await listRaffles(db, orgA);
    expect(list).toHaveLength(2);
    await expect(
      createRaffle(db, orgA, USER, {
        mes: 7,
        anio: 2026,
        ganadorClientName: "",
      }),
    ).rejects.toThrow(/Se requiere ganador, mes y anio/);
  });

  it("borrar del historial con aislamiento", async () => {
    const list = await listRaffles(db, orgA);
    await expect(deleteRaffle(db, orgB, USER, list[0].id)).rejects.toThrow();
    await deleteRaffle(db, orgA, USER, list[0].id);
    expect(await listRaffles(db, orgA)).toHaveLength(1);
  });
});
