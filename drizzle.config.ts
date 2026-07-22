import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Solo necesario para migrate/push contra Neon; generate no conecta.
    url: process.env.DATABASE_URL ?? "",
  },
});
