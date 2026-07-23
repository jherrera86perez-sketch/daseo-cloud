// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations } from "@/db/schema";
import {
  uploadStatement,
  listStatements,
  getStatementDetail,
  deleteStatement,
} from "./queries";

let db: TestDb;
let orgA: string;
let orgB: string;
const USER = null;

// Fixture mínimo válido en layout BPA 2026 (datos ficticios).
const L = (sp: number, text: string) => " ".repeat(sp) + text;
const FIXTURE = [
  "Cuenta Interna: 40310000000001",
  "Cuenta Estandarizada: 1299770000000001",
  "EMPRESA DEMO LIMPIEZA",
  L(43, "Saldo Inicial"),
  L(47, "1 000.00"),
  "Fecha Inicial: 01/01/2026",
  "Fecha Final: 31/01/2026",
  "01/01/2026          BR601AAAAA997 CR",
  L(
    39,
    "375.00    1 375.00 Transferencia por BancaMovil BPA. Ordenada por: CLIENTE UNO DEMO PAN:",
  ),
  L(65, "920612XXXXXX1111 ID CUBACEL: 1111111111 5351111111"),
  "02/01/2026          AY600EEEEE997 DB",
  L(39, "125.00    1 250.00 RETIRO EN CAJERO AUTOMATICO"),
  L(19, "Depósitos"),
  L(19, "375.00"),
  L(19, "Extracciones"),
  L(19, "125.00"),
  L(19, "Saldo Final"),
  L(19, "1 250.00"),
].join("\n");

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "f8a" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "B", slug: "f8b" })
    .returning();
  orgA = a.id;
  orgB = b.id;
});

describe("estados de cuenta (F8-M1)", () => {
  let stmtId: string;

  it("upload parsea, valida y persiste cabecera + movimientos", async () => {
    const res = await uploadStatement(db, orgA, USER, {
      rawText: FIXTURE,
      filename: "Enero.pdf",
    });
    stmtId = res.statement.id;
    expect(res.numOperaciones).toBe(2);
    expect(res.statement.cuadrado).toBe(true);
    expect(res.statement.titular).toBe("EMPRESA DEMO LIMPIEZA");
    expect(res.statement.totalCreditos).toBe("375.00");
    expect(res.statement.saldoFinal).toBe("1250.00");

    const { movements } = await getStatementDetail(db, orgA, stmtId);
    expect(movements).toHaveLength(2);
    const [cr, dbop] = movements;
    expect(cr.operacion).toBe("CR");
    expect(cr.fechaIso).toBe("2026-01-01");
    expect(cr.mes).toBe(1);
    expect(cr.anio).toBe(2026);
    expect(cr.clientName).toBe("CLIENTE UNO DEMO");
    expect(cr.panOrigen).toBe("920612XXXXXX1111");
    expect(cr.telefono).toBe("5351111111");
    expect(cr.tipoTransaccion).toBe("BANCA_MOVIL");
    expect(dbop.operacion).toBe("DB");
    expect(dbop.importe).toBe("125.00");
  });

  it("dedup por triplete con el mensaje exacto del ERP", async () => {
    await expect(
      uploadStatement(db, orgA, USER, { rawText: FIXTURE }),
    ).rejects.toThrow(/ya fue importado \(ID: /);
  });

  it("texto sin operaciones lanza el mensaje exacto del ERP", async () => {
    await expect(
      uploadStatement(db, orgA, USER, { rawText: "esto no es un estado" }),
    ).rejects.toThrow(/No se encontraron operaciones en el PDF/);
  });

  it("aislamiento multi-tenant: la org B no ve el estado de A", async () => {
    expect(await listStatements(db, orgB)).toHaveLength(0);
    await expect(getStatementDetail(db, orgB, stmtId)).rejects.toThrow();
    // y la misma cuenta/período se puede importar en la org B (dedup por org)
    const res = await uploadStatement(db, orgB, USER, { rawText: FIXTURE });
    expect(res.numOperaciones).toBe(2);
  });

  it("borrar elimina en cascada los movimientos", async () => {
    const del = await deleteStatement(db, orgA, USER, stmtId);
    expect(del.movimientos).toBe(2);
    expect(await listStatements(db, orgA)).toHaveLength(0);
    await expect(getStatementDetail(db, orgA, stmtId)).rejects.toThrow(
      /no encontrado/,
    );
  });
});
