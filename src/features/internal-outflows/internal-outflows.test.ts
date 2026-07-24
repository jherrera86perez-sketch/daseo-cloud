// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, consolidatedEntries } from "@/db/schema";
import {
  createProduct,
  registerMovement,
  getStock,
} from "@/features/inventory/queries";
import {
  createInternalOutflow,
  deleteInternalOutflow,
  updateInternalOutflow,
  listInternalOutflows,
} from "./queries";

let db: TestDb;
let orgA: string;
let orgB: string;
let jabonId: string;
let cloroId: string;
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "sia" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "B", slug: "sib" })
    .returning();
  orgA = a.id;
  orgB = b.id;

  const jabon = await createProduct(db, orgA, USER, {
    name: "Jabón líquido",
    unit: "L",
  });
  jabonId = jabon.id;
  await registerMovement(db, orgA, USER, {
    productId: jabonId,
    kind: "in",
    qty: "100",
    unitCostCents: 5000n, // 50.00
  });
  const cloro = await createProduct(db, orgA, USER, {
    name: "Cloro",
    unit: "L",
  });
  cloroId = cloro.id;
  await registerMovement(db, orgA, USER, {
    productId: cloroId,
    kind: "in",
    qty: "10",
    unitCostCents: 2000n,
  });
});

describe("validaciones con mensajes literales del ERP", () => {
  it("rechaza tipo inválido, línea sin producto, cantidad 0 y salida vacía", async () => {
    const base = {
      fecha: "2026-07-23",
      montoEfectivoCents: 0n,
      items: [{ productId: jabonId, qty: "1" }],
    };
    await expect(
      createInternalOutflow(db, orgA, USER, { ...base, tipo: "MERMA" }),
    ).rejects.toThrow(
      "tipo inválido (DONACION | REGALO | AUTOCONSUMO | TRABAJADORES)",
    );
    await expect(
      createInternalOutflow(db, orgA, USER, {
        ...base,
        tipo: "REGALO",
        items: [{ productId: "", qty: "1" }],
      }),
    ).rejects.toThrow("Cada línea debe tener un producto seleccionado");
    await expect(
      createInternalOutflow(db, orgA, USER, {
        ...base,
        tipo: "REGALO",
        items: [{ productId: jabonId, qty: "0" }],
      }),
    ).rejects.toThrow("La cantidad de cada producto debe ser mayor que 0");
    await expect(
      createInternalOutflow(db, orgA, USER, {
        ...base,
        tipo: "REGALO",
        montoEfectivoCents: -100n,
      }),
    ).rejects.toThrow("El monto en efectivo no puede ser negativo");
    await expect(
      createInternalOutflow(db, orgA, USER, {
        fecha: "2026-07-23",
        tipo: "REGALO",
        montoEfectivoCents: 0n,
        items: [],
      }),
    ).rejects.toThrow("Registra al menos un producto o un monto en efectivo");
  });

  it("valida stock AGREGADO por producto (líneas duplicadas se suman) sin tocar inventario", async () => {
    await expect(
      createInternalOutflow(db, orgA, USER, {
        fecha: "2026-07-23",
        tipo: "DONACION",
        montoEfectivoCents: 0n,
        items: [
          { productId: cloroId, qty: "6" },
          { productId: cloroId, qty: "6" },
        ],
      }),
    ).rejects.toThrow(
      'Stock insuficiente de "Cloro" (disponible 10, requerido 12)',
    );
    const stock = await getStock(db, orgA, cloroId);
    expect(stock.qtyMilli).toBe(10_000n);
  });
});

describe("crear salida: efecto inmediato en stock, kardex y banco", () => {
  let salidaId: string;

  it("descuenta stock al crear, congela costo promedio y suma valor_productos", async () => {
    const salida = await createInternalOutflow(db, orgA, USER, {
      fecha: "2026-07-20",
      tipo: "TRABAJADORES",
      destinoNombre: "Brigada de limpieza",
      montoEfectivoCents: 0n,
      items: [
        { productId: jabonId, qty: "4" },
        { productId: cloroId, qty: "2" },
      ],
    });
    salidaId = salida.id;
    // 4 L × 50.00 + 2 L × 20.00 = 240.00
    expect(salida.valorProductosCents).toBe(24000n);
    expect((await getStock(db, orgA, jabonId)).qtyMilli).toBe(96_000n);
    expect((await getStock(db, orgA, cloroId)).qtyMilli).toBe(8_000n);
    const [conItems] = await listInternalOutflows(db, orgA, {});
    expect(conItems.items).toHaveLength(2);
    expect(conItems.items.map((i) => i.productName).sort()).toEqual([
      "Cloro",
      "Jabón líquido",
    ]);
  });

  it("con efectivo crea egreso DB en el consolidado con origen salida_interna", async () => {
    const salida = await createInternalOutflow(db, orgA, USER, {
      fecha: "2026-07-21",
      tipo: "DONACION",
      destinoNombre: "Hogar de ancianos",
      montoEfectivoCents: 150_00n,
      motivo: "Aniversario",
      items: [],
    });
    expect(salida.consolidadoId).not.toBeNull();
    const [entry] = await db
      .select()
      .from(consolidatedEntries)
      .where(eq(consolidatedEntries.id, salida.consolidadoId!));
    expect(entry.tipoTransaccion).toBe("DB");
    expect(entry.importe).toBe("150.00");
    expect(entry.origen).toBe("salida_interna");
    expect(entry.categoria).toBe("Donaciones");
    expect(entry.subcategoria).toBe("DONACION");
    expect(entry.detalle).toBe("Hogar de ancianos");
    expect(entry.referencia).toBe("Aniversario");
    expect(entry.conciliado).toBe(false);
    expect(entry.auditStatus).toBe("MANUAL");
    expect(entry.archivoNombre).toBe("salida-interna");
  });

  it("eliminar revierte íntegro: stock devuelto y salida borrada", async () => {
    await deleteInternalOutflow(db, orgA, USER, salidaId);
    expect((await getStock(db, orgA, jabonId)).qtyMilli).toBe(100_000n);
    expect((await getStock(db, orgA, cloroId)).qtyMilli).toBe(10_000n);
    const list = await listInternalOutflows(db, orgA, {});
    expect(list.find((s) => s.id === salidaId)).toBeUndefined();
  });

  it("eliminar una salida con efectivo borra también su fila del consolidado", async () => {
    const [salida] = await listInternalOutflows(db, orgA, {});
    expect(salida.tipo).toBe("DONACION");
    const entryId = salida.consolidadoId!;
    await deleteInternalOutflow(db, orgA, USER, salida.id);
    const entries = await db
      .select()
      .from(consolidatedEntries)
      .where(eq(consolidatedEntries.id, entryId));
    expect(entries).toHaveLength(0);
  });
});

describe("editar = revertir + recrear (re-numera) y aislamiento", () => {
  it("editar aplica el neto correcto y devuelve un id nuevo", async () => {
    const original = await createInternalOutflow(db, orgA, USER, {
      fecha: "2026-07-22",
      tipo: "AUTOCONSUMO",
      destinoNombre: "Limpieza del taller",
      montoEfectivoCents: 0n,
      items: [{ productId: jabonId, qty: "10" }],
    });
    expect((await getStock(db, orgA, jabonId)).qtyMilli).toBe(90_000n);

    const editada = await updateInternalOutflow(db, orgA, USER, original.id, {
      fecha: "2026-07-22",
      tipo: "REGALO",
      destinoNombre: "Cliente fiel",
      montoEfectivoCents: 0n,
      items: [{ productId: jabonId, qty: "3" }],
    });
    expect(editada.id).not.toBe(original.id);
    expect(editada.tipo).toBe("REGALO");
    expect((await getStock(db, orgA, jabonId)).qtyMilli).toBe(97_000n);
    await deleteInternalOutflow(db, orgA, USER, editada.id);
  });

  it("otra org no ve ni puede borrar salidas ajenas", async () => {
    const salida = await createInternalOutflow(db, orgA, USER, {
      fecha: "2026-07-23",
      tipo: "REGALO",
      montoEfectivoCents: 0n,
      items: [{ productId: cloroId, qty: "1" }],
    });
    expect(await listInternalOutflows(db, orgB, {})).toHaveLength(0);
    await expect(
      deleteInternalOutflow(db, orgB, USER, salida.id),
    ).rejects.toThrow();
    expect((await getStock(db, orgA, cloroId)).qtyMilli).toBe(9_000n);
  });

  it("filtra por rango de fechas inclusivo", async () => {
    const list = await listInternalOutflows(db, orgA, {
      desde: "2026-07-23",
      hasta: "2026-07-23",
    });
    expect(list).toHaveLength(1);
    expect(list[0].tipo).toBe("REGALO");
  });
});
