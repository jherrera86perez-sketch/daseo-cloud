"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import {
  customerInputSchema,
  contactInputSchema,
  interactionInputSchema,
} from "./schemas";
import {
  createCustomer,
  updateCustomer,
  softDeleteCustomer,
  addContact,
  addInteraction,
} from "./queries";

export type ActionState = { error?: string } | null;

function fromForm(form: FormData, keys: string[]) {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = form.get(k);
    if (typeof v === "string" && v !== "") out[k] = v;
  }
  return out;
}

export async function createCustomerAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = customerInputSchema.safeParse(
    fromForm(form, ["name", "taxId", "email", "phone", "address", "notes"]),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const row = await createCustomer(getDb(), orgId, userId, parsed.data);
  revalidatePath("/[locale]/customers", "page");
  redirect({ href: `/customers/${row.id}`, locale: await getLocale() });
  return null;
}

export async function updateCustomerAction(
  id: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = customerInputSchema.safeParse(
    fromForm(form, ["name", "taxId", "email", "phone", "address", "notes"]),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  await updateCustomer(getDb(), orgId, userId, id, parsed.data);
  revalidatePath(`/[locale]/customers/${id}`, "page");
  redirect({ href: `/customers/${id}`, locale: await getLocale() });
  return null;
}

export async function deleteCustomerAction(id: string): Promise<void> {
  const { orgId, userId } = await requireOrg();
  await softDeleteCustomer(getDb(), orgId, userId, id);
  revalidatePath("/[locale]/customers", "page");
  redirect({ href: "/customers", locale: await getLocale() });
}

export async function addContactAction(
  customerId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = contactInputSchema.safeParse(
    fromForm(form, ["name", "role", "email", "phone"]),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  await addContact(getDb(), orgId, userId, customerId, parsed.data);
  revalidatePath(`/[locale]/customers/${customerId}`, "page");
  return null;
}

export async function addInteractionAction(
  customerId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = interactionInputSchema.safeParse({
    type: form.get("type"),
    content: form.get("content"),
    occurredAt: new Date(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  await addInteraction(getDb(), orgId, userId, customerId, parsed.data);
  revalidatePath(`/[locale]/customers/${customerId}`, "page");
  return null;
}
