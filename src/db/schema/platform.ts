import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { id, timestamps, organizations } from "./core";
import { customers } from "./crm";

/**
 * API keys de la API pública /api/v1. Solo se guarda el hash SHA-256;
 * la key completa (dsk_...) se muestra UNA vez al crearla.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(), // dsk_xxxx… para identificarla en la UI
    keyHash: text("key_hash").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("api_keys_hash_idx").on(t.keyHash),
    index("api_keys_org_idx").on(t.orgId),
  ],
);

/**
 * F7: suscripción por organización (1:1). El cobro CU es manual: un
 * super-admin activa/suspende desde /admin. Stripe (BR) llegará como
 * segundo proveedor sobre este mismo estado.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    orgId: uuid("org_id")
      .primaryKey()
      .references(() => organizations.id),
    plan: text("plan").notNull().default("trial"),
    status: text("status").notNull().default("trialing"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    check("subscriptions_plan_check", sql`${t.plan} in ('trial','pro')`),
    check(
      "subscriptions_status_check",
      sql`${t.status} in ('trialing','active','suspended')`,
    ),
  ],
);

/**
 * ≈ tg_cumpleanios_log del ERP: idempotencia del saludo de cumpleaños por
 * (cliente, año) — el cron de cumpleaños solo corre una vez al día por org,
 * agregado al mismo chat de Telegram que ya usa F6 (Cloud no tiene chat_id
 * por cliente, a diferencia del ERP que sí tenía bot con entrada).
 */
export const telegramBirthdayLog = pgTable(
  "telegram_birthday_log",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    year: integer("year").notNull(),
    status: text("status").notNull().default("sent"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("telegram_birthday_log_customer_year_idx").on(
      t.customerId,
      t.year,
    ),
    index("telegram_birthday_log_org_idx").on(t.orgId, t.sentAt),
    check(
      "telegram_birthday_log_status_check",
      sql`${t.status} in ('sent','skipped')`,
    ),
  ],
);
