import { and, desc, eq, ilike } from "drizzle-orm";
import { customers, contacts, interactions } from "@/db/schema";
import { assertOwnedByOrg, notDeleted } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import type { CustomerInput, ContactInput, InteractionInput } from "./schemas";

/*
 * Capa de datos del módulo (patrón para todos los módulos):
 * - Toda función recibe (db, orgId, userId, …) y filtra por org SIEMPRE.
 * - Mutaciones registran auditoría.
 * - Las referencias se verifican con assertOwnedByOrg antes de escribir.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type UserId = string | null;

export async function listCustomers(
  db: Db,
  orgId: string,
  opts: { search?: string },
) {
  const filters = [eq(customers.orgId, orgId), notDeleted(customers)];
  if (opts.search) {
    filters.push(ilike(customers.name, `%${opts.search}%`));
  }
  return db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      email: customers.email,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(and(...filters))
    .orderBy(customers.name);
}

async function getOwnedCustomer(db: Db, orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), notDeleted(customers)));
  return assertOwnedByOrg(row, orgId);
}

export async function getCustomerDetail(db: Db, orgId: string, id: string) {
  const customer = await getOwnedCustomer(db, orgId, id);
  const contactRows = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.orgId, orgId),
        eq(contacts.customerId, id),
        notDeleted(contacts),
      ),
    )
    .orderBy(contacts.name);
  const interactionRows = await db
    .select()
    .from(interactions)
    .where(and(eq(interactions.orgId, orgId), eq(interactions.customerId, id)))
    .orderBy(desc(interactions.occurredAt));
  return { customer, contacts: contactRows, interactions: interactionRows };
}

export async function createCustomer(
  db: Db,
  orgId: string,
  userId: UserId,
  input: CustomerInput,
) {
  const [row] = await db
    .insert(customers)
    .values({ ...input, orgId })
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "customer",
    entityId: row.id,
    action: "create",
    after: input,
  });
  return row;
}

export async function updateCustomer(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
  input: CustomerInput,
) {
  const before = await getOwnedCustomer(db, orgId, id);
  const [row] = await db
    .update(customers)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.orgId, orgId)))
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "customer",
    entityId: id,
    action: "update",
    before: { name: before.name },
    after: input,
  });
  return row;
}

export async function softDeleteCustomer(
  db: Db,
  orgId: string,
  userId: UserId,
  id: string,
) {
  await getOwnedCustomer(db, orgId, id);
  await db
    .update(customers)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.orgId, orgId)));
  await logAudit(db, {
    orgId,
    userId,
    entity: "customer",
    entityId: id,
    action: "delete",
  });
}

export async function addContact(
  db: Db,
  orgId: string,
  userId: UserId,
  customerId: string,
  input: ContactInput,
) {
  await getOwnedCustomer(db, orgId, customerId);
  const [row] = await db
    .insert(contacts)
    .values({ ...input, orgId, customerId })
    .returning();
  await logAudit(db, {
    orgId,
    userId,
    entity: "contact",
    entityId: row.id,
    action: "create",
    after: input,
  });
  return row;
}

export async function addInteraction(
  db: Db,
  orgId: string,
  userId: UserId,
  customerId: string,
  input: InteractionInput,
) {
  await getOwnedCustomer(db, orgId, customerId);
  const [row] = await db
    .insert(interactions)
    .values({ ...input, orgId, customerId, userId })
    .returning();
  return row;
}
