import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import * as schema from "@/db/schema";
import { pipelineStages, orgSettings } from "@/db/schema";
import { getDb } from "@/db";
import { env } from "@/lib/env";

/** Etapas sembradas en toda organización nueva (regla del plan). */
export const DEFAULT_STAGES = [
  { name: "Prospecto", position: 1 },
  { name: "Contactado", position: 2 },
  { name: "Propuesta", position: 3 },
  { name: "Ganado", position: 4, isWon: true },
  { name: "Perdido", position: 5, isLost: true },
] as const;

// Cualquier instancia drizzle (Neon en prod, PGlite en tests)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Factory inyectable: los tests pasan PGlite; producción usa Neon vía getAuth().
 * Regla "BD manda": el rol se verifica contra la tabla member en cada request
 * (requireOrg), el token solo lleva identidad.
 */
export function createAuth(
  db: Db,
  opts: { secret: string; baseURL?: string; rateLimitEnabled?: boolean } = {
    secret: env.BETTER_AUTH_SECRET ?? "",
  },
) {
  return betterAuth({
    baseURL: opts.baseURL ?? "http://localhost:3000",
    secret: opts.secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        organization: schema.organizations,
        member: schema.members,
        invitation: schema.invitations,
        rateLimit: schema.rateLimits,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
    },
    // Persistido en Postgres: sobrevive el ciclo de vida serverless de Vercel.
    // DISABLE_RATE_LIMIT=1 solo para E2E (los tests encadenan signups desde una IP).
    rateLimit: {
      enabled: opts.rateLimitEnabled ?? process.env.DISABLE_RATE_LIMIT !== "1",
      storage: "database",
      window: 60,
      max: 30,
    },
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
    plugins: [
      organization({
        organizationHooks: {
          afterCreateOrganization: async ({ organization: org }) => {
            await db
              .insert(orgSettings)
              .values({ orgId: org.id, baseCurrency: "CUP" });
            await db
              .insert(pipelineStages)
              .values(DEFAULT_STAGES.map((s) => ({ ...s, orgId: org.id })));
          },
        },
      }),
    ],
  });
}

let _auth: ReturnType<typeof createAuth> | undefined;

/** Instancia de producción (lazy: no conecta ni exige env en build). */
export function getAuth() {
  _auth ??= createAuth(getDb(), {
    secret: env.BETTER_AUTH_SECRET ?? "",
    baseURL: env.BETTER_AUTH_URL,
  });
  return _auth;
}
