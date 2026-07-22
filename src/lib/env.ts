import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Validación de entorno en build: un .env mal configurado falla aquí,
 * nunca en runtime frente a un cliente.
 * M2 añadirá AUTH_SECRET.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    // Opcional hasta que exista la cuenta de Neon; getDb() falla con mensaje claro
    DATABASE_URL: z.string().url().optional(),
    BETTER_AUTH_SECRET: z.string().min(20).optional(),
    BETTER_AUTH_URL: z.string().url().optional(),
    SENTRY_DSN: z.string().url().optional(),
  },
  client: {
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    SENTRY_DSN: process.env.SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  emptyStringAsUndefined: true,
});
