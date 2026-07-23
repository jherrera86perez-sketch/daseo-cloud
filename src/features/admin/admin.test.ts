// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations } from "@/db/schema";
import {
  getSubscription,
  listOrgsWithSubscriptions,
  setSubscription,
} from "./queries";

let db: TestDb;
let orgA: string;
let orgB: string;
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "Fábrica A", slug: "f7a" })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "Fábrica B", slug: "f7b" })
    .returning();
  orgA = a.id;
  orgB = b.id;
});

describe("suscripciones (F7)", () => {
  it("getSubscription aprovisiona el trial por defecto", async () => {
    const sub = await getSubscription(db, orgA);
    expect(sub.plan).toBe("trial");
    expect(sub.status).toBe("trialing");
    expect(sub.trialEndsAt).toBeInstanceOf(Date);
    expect(sub.trialEndsAt!.getTime()).toBeGreaterThan(Date.now());
    // idempotente: segunda llamada devuelve la misma fila
    const again = await getSubscription(db, orgA);
    expect(again.orgId).toBe(sub.orgId);
  });

  it("activar fija plan pro y activatedAt una sola vez", async () => {
    const sub = await setSubscription(db, USER, orgA, { status: "active" });
    expect(sub.status).toBe("active");
    expect(sub.plan).toBe("pro");
    expect(sub.activatedAt).toBeInstanceOf(Date);
    const first = sub.activatedAt!.getTime();
    // re-activar no mueve la fecha original de activación
    const again = await setSubscription(db, USER, orgA, { status: "active" });
    expect(again.activatedAt!.getTime()).toBe(first);
  });

  it("suspender conserva plan y activatedAt", async () => {
    const sub = await setSubscription(db, USER, orgA, {
      status: "suspended",
      notes: "impago",
    });
    expect(sub.status).toBe("suspended");
    expect(sub.plan).toBe("pro");
    expect(sub.activatedAt).toBeInstanceOf(Date);
    expect(sub.notes).toBe("impago");
  });

  it("listOrgsWithSubscriptions trae todas las orgs con su estado", async () => {
    const rows = await listOrgsWithSubscriptions(db);
    const a = rows.find((r) => r.id === orgA);
    const b = rows.find((r) => r.id === orgB);
    expect(a?.status).toBe("suspended");
    // orgB nunca pidió suscripción: aparece sin fila (null = pre-F7)
    expect(b?.status).toBeNull();
    expect(typeof a?.memberCount).toBe("number");
  });
});
