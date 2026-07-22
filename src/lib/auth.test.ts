// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/test/db";
import { pipelineStages, orgSettings, members } from "@/db/schema";
import { createAuth } from "./auth";

let db: TestDb;
let auth: ReturnType<typeof createAuth>;
let cookie: string;

const EMAIL = "javier@daseo.test";
const PASSWORD = "clave-muy-segura-123";

beforeAll(async () => {
  ({ db } = await createTestDb());
  auth = createAuth(db, { secret: "secreto-de-test-1234567890" });
});

describe("registro y login (Better Auth)", () => {
  it("registra un usuario con email y contraseña", async () => {
    const res = await auth.api.signUpEmail({
      body: { email: EMAIL, password: PASSWORD, name: "Javier" },
      returnHeaders: true,
    });
    expect(res.response.user.email).toBe(EMAIL);
    cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("session_token");
  });

  it("rechaza contraseñas de menos de 10 caracteres", async () => {
    await expect(
      auth.api.signUpEmail({
        body: { email: "otro@daseo.test", password: "corta", name: "X" },
      }),
    ).rejects.toThrow();
  });

  it("rechaza login con contraseña incorrecta", async () => {
    await expect(
      auth.api.signInEmail({
        body: { email: EMAIL, password: "incorrecta-123" },
      }),
    ).rejects.toThrow();
  });

  it("acepta login con la contraseña correcta", async () => {
    const res = await auth.api.signInEmail({
      body: { email: EMAIL, password: PASSWORD },
    });
    expect(res.user.email).toBe(EMAIL);
  });
});

describe("rate limiting (respaldado en BD)", () => {
  it("bloquea con 429 los intentos repetidos de login fallido", async () => {
    const limited = createAuth(db, {
      secret: "secreto-de-test-1234567890",
      rateLimitEnabled: true,
    });
    // Via handler HTTP (con IP): el rate limiting opera a nivel de request
    let saw429 = false;
    for (let i = 0; i < 12; i++) {
      const res = await limited.handler(
        new Request("http://localhost:3000/api/auth/sign-in/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.7",
          },
          body: JSON.stringify({ email: EMAIL, password: "incorrecta-123" }),
        }),
      );
      if (res.status === 429) {
        saw429 = true;
        break;
      }
    }
    expect(saw429).toBe(true);
  });
});

describe("organización (plugin organization + aprovisionamiento)", () => {
  it("crea la org con el usuario como owner y siembra settings + 5 etapas", async () => {
    const org = await auth.api.createOrganization({
      body: { name: "Daseo", slug: "daseo" },
      headers: new Headers({ cookie }),
    });
    expect(org?.id).toBeTruthy();
    const orgId = org!.id;

    const membs = await db
      .select()
      .from(members)
      .where(eq(members.organizationId, orgId));
    expect(membs).toHaveLength(1);
    expect(membs[0].role).toBe("owner");

    const settings = await db
      .select()
      .from(orgSettings)
      .where(eq(orgSettings.orgId, orgId));
    expect(settings).toHaveLength(1);
    expect(settings[0].baseCurrency).toBe("CUP");

    const stages = await db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.orgId, orgId))
      .orderBy(pipelineStages.position);
    expect(stages.map((s) => s.name)).toEqual([
      "Prospecto",
      "Contactado",
      "Propuesta",
      "Ganado",
      "Perdido",
    ]);
    expect(stages[3].isWon).toBe(true);
    expect(stages[4].isLost).toBe(true);
  });
});
