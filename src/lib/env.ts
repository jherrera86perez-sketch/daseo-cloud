import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Validación de entorno en build: un .env mal configurado falla aquí,
 * nunca en runtime frente a un cliente.
 * M1 añadirá DATABASE_URL; M2 añadirá AUTH_SECRET.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    SENTRY_DSN: z.string().url().optional(),
  },
  client: {
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    SENTRY_DSN: process.env.SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  emptyStringAsUndefined: true,
});
