// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations } from "@/db/schema";
import {
  listCustomers,
  getCustomerDetail,
  createCustomer,
  updateCustomer,
  softDeleteCustomer,
  addContact,
  addInteraction,
} from "./queries";

let db: TestDb;
let orgA: string;
let orgB: string;
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "m3a" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "B", slug: "m3b" })
    .returning();
  orgA = a.id;
  orgB = b.id;
});

describe("clientes: CRUD con aislamiento y soft delete", () => {
  let customerId: string;

  it("crea y lista clientes de la org", async () => {
    const c = await createCustomer(db, orgA, USER, {
      name: "Bodega El Sol",
      phone: "+53 5555",
    });
    customerId = c.id;
    await createCustomer(db, orgB, USER, { name: "Cliente Ajeno" });

    const list = await listCustomers(db, orgA, {});
    expect(list.map((x) => x.name)).toEqual(["Bodega El Sol"]);
  });

  it("busca por nombre (insensible a mayúsculas)", async () => {
    await createCustomer(db, orgA, USER, { name: "Panadería Luz" });
    const found = await listCustomers(db, orgA, { search: "panader" });
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe("Panadería Luz");
  });

  it("actualiza validando pertenencia a la org", async () => {
    const updated = await updateCustomer(db, orgA, USER, customerId, {
      name: "Bodega El Sol 2",
    });
    expect(updated.name).toBe("Bodega El Sol 2");
    await expect(
      updateCustomer(db, orgB, USER, customerId, { name: "hack" }),
    ).rejects.toThrow();
  });

  it("soft delete: desaparece de la lista pero la fila persiste", async () => {
    await softDeleteCustomer(db, orgA, USER, customerId);
    const list = await listCustomers(db, orgA, {});
    expect(list.find((x) => x.id === customerId)).toBeUndefined();
    await expect(getCustomerDetail(db, orgA, customerId)).rejects.toThrow();
  });
});

describe("ficha: contactos e interacciones", () => {
  it("agrega contactos e interacciones y arma el timeline descendente", async () => {
    const c = await createCustomer(db, orgA, USER, { name: "Mercado Norte" });
    await addContact(db, orgA, USER, c.id, {
      name: "María",
      phone: "+53 1111",
    });
    await addInteraction(db, orgA, USER, c.id, {
      type: "call",
      content: "Primera llamada",
      occurredAt: new Date("2026-07-01T10:00:00Z"),
    });
    await addInteraction(db, orgA, USER, c.id, {
      type: "whatsapp",
      content: "Pedido confirmado",
      occurredAt: new Date("2026-07-10T10:00:00Z"),
    });

    const detail = await getCustomerDetail(db, orgA, c.id);
    expect(detail.customer.name).toBe("Mercado Norte");
    expect(detail.contacts.map((x) => x.name)).toEqual(["María"]);
    expect(detail.interactions.map((x) => x.content)).toEqual([
      "Pedido confirmado",
      "Primera llamada",
    ]);
  });

  it("rechaza contactos/interacciones sobre clientes de otra org", async () => {
    const ajeno = await createCustomer(db, orgB, USER, { name: "Ajeno 2" });
    await expect(
      addContact(db, orgA, USER, ajeno.id, { name: "X" }),
    ).rejects.toThrow();
    await expect(
      addInteraction(db, orgA, USER, ajeno.id, {
        type: "note",
        content: "x",
        occurredAt: new Date(),
      }),
    ).rejects.toThrow();
  });
});
