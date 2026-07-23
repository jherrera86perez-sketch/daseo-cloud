import { describe, expect, it } from "vitest";
import { subscriptionGate } from "./gate";

const now = new Date("2026-07-23T12:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 24 * 3600 * 1000);

describe("subscriptionGate (F7-M2)", () => {
  it("suspendida bloquea siempre, aunque tenga trial vigente", () => {
    expect(
      subscriptionGate({ status: "suspended", trialEndsAt: days(10) }, now),
    ).toEqual({ kind: "suspended" });
  });

  it("activa pasa sin avisos", () => {
    expect(
      subscriptionGate({ status: "active", trialEndsAt: days(-30) }, now),
    ).toEqual({ kind: "ok" });
  });

  it("trial lejos del vencimiento pasa en silencio", () => {
    expect(
      subscriptionGate({ status: "trialing", trialEndsAt: days(10) }, now),
    ).toEqual({ kind: "ok" });
  });

  it("trial por vencer avisa con los días restantes", () => {
    expect(
      subscriptionGate({ status: "trialing", trialEndsAt: days(2) }, now),
    ).toEqual({ kind: "trial", daysLeft: 2 });
  });

  it("trial vencido avisa como expirado (sin bloquear)", () => {
    expect(
      subscriptionGate({ status: "trialing", trialEndsAt: days(-1) }, now),
    ).toEqual({ kind: "trial-expired" });
  });

  it("trial sin fecha (datos pre-F7) pasa", () => {
    expect(
      subscriptionGate({ status: "trialing", trialEndsAt: null }, now),
    ).toEqual({ kind: "ok" });
  });
});
