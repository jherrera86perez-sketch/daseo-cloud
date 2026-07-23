"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { parseDecimalToCents } from "@/lib/money";
import {
  createEmployee,
  updateEmployee,
  softDeleteEmployee,
  listEmployees,
  createCommitment,
  deactivateCommitment,
} from "./queries";

export type ActionState = { error?: string } | null;

export async function createEmployeeAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(200),
      role: z.string().trim().max(100).optional(),
      salary: z.string().regex(/^\d+(?:[.,]\d{1,2})?$/),
    })
    .safeParse({
      name: form.get("name"),
      role: String(form.get("role") ?? "") || undefined,
      salary: String(form.get("salary") ?? ""),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  await createEmployee(getDb(), orgId, userId, {
    name: parsed.data.name,
    role: parsed.data.role,
    salaryCents: parseDecimalToCents(parsed.data.salary),
  });
  revalidatePath("/[locale]/employees", "page");
  return null;
}

export async function toggleEmployeeAction(id: string): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const db = getDb();
  const list = await listEmployees(db, orgId);
  const emp = list.find((e) => e.id === id);
  if (!emp) return { error: "no encontrado" };
  await updateEmployee(db, orgId, userId, id, {
    name: emp.name,
    role: emp.role ?? undefined,
    salaryCents: emp.salaryCents,
    active: emp.active === "yes" ? "no" : "yes",
  });
  revalidatePath("/[locale]/employees", "page");
  return null;
}

export async function deleteEmployeeAction(id: string): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  await softDeleteEmployee(getDb(), orgId, userId, id);
  revalidatePath("/[locale]/employees", "page");
  return null;
}

export async function createCommitmentAction(
  customerId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = z
    .object({
      description: z.string().trim().min(1).max(300),
      frequency: z.enum(["weekly", "monthly"]),
    })
    .safeParse({
      description: form.get("description"),
      frequency: form.get("frequency"),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  try {
    await createCommitment(getDb(), orgId, userId, {
      customerId,
      ...parsed.data,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath(`/[locale]/customers/${customerId}`, "page");
  return null;
}

export async function deactivateCommitmentAction(
  id: string,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  try {
    await deactivateCommitment(getDb(), orgId, userId, id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/customers/[id]", "page");
  return null;
}

const evaluationSchema = z.object({
  employeeId: z.string().uuid(),
  score: z.coerce.number().int().min(1).max(5),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export async function addEvaluationAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { orgId, userId } = await requireOrg();
  const parsed = evaluationSchema.safeParse({
    employeeId: form.get("employeeId"),
    score: form.get("score"),
    notes: form.get("notes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  try {
    const { addEvaluation } = await import("./queries");
    await addEvaluation(getDb(), orgId, userId, {
      employeeId: parsed.data.employeeId,
      score: parsed.data.score,
      notes: parsed.data.notes || undefined,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
  revalidatePath("/[locale]/employees", "page");
  return null;
}
