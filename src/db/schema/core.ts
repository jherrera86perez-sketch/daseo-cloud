import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  boolean,
  bigint as bigintCol,
  check,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/*
 * Tablas de auth: Better Auth (plugin organization) es el DUEÑO de su forma.
 * Nombres de tabla/columna según su convención; ids uuid vía generateId.
 * Los datos de negocio de la org viven en org_settings (1:1), no aquí.
 */

export const users = pgTable("user", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  ...timestamps,
});

export const sessions = pgTable(
  "session",
  {
    id: id(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeOrganizationId: uuid("active_organization_id"),
    ...timestamps,
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "account",
  {
    id: id(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verifications = pgTable("verification", {
  id: id(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

export const organizations = pgTable("organization", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const members = pgTable(
  "member",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("member_user_org_idx").on(t.userId, t.organizationId)],
);

export const invitations = pgTable(
  "invitation",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("invitation_org_idx").on(t.organizationId)],
);

/** Almacén del rate limiting de Better Auth (storage: "database"). */
export const rateLimits = pgTable("rate_limit", {
  id: id(),
  key: text("key").notNull(),
  count: integer("count").notNull().default(0),
  lastRequest: bigintCol("last_request", { mode: "number" }).notNull(),
});

/** Datos de negocio de la organización (1:1 con organization). */
export const orgSettings = pgTable(
  "org_settings",
  {
    orgId: uuid("org_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    baseCurrency: text("base_currency").notNull(),
    locale: text("locale").notNull().default("es"),
    timezone: text("timezone").notNull().default("America/Havana"),
    fiscalCountry: text("fiscal_country"),
    fiscalSettings: jsonb("fiscal_settings"),
    ...timestamps,
  },
  (t) => [
    check(
      "org_settings_currency_check",
      sql`${t.baseCurrency} in ('CUP','USD','BRL')`,
    ),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    orgId: uuid("org_id").references(() => organizations.id),
    userId: uuid("user_id").references(() => users.id),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_logs_org_entity_idx").on(t.orgId, t.entity, t.entityId)],
);

export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    currency: text("currency").notNull(),
    rateToBase: numeric("rate_to_base", { precision: 18, scale: 6 }).notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("exchange_rates_org_currency_idx").on(
      t.orgId,
      t.currency,
      t.effectiveAt,
    ),
    check("exchange_rates_positive_check", sql`${t.rateToBase} > 0`),
    check(
      "exchange_rates_currency_check",
      sql`${t.currency} in ('CUP','USD','BRL')`,
    ),
  ],
);

export const documentSequences = pgTable(
  "document_sequences",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    docType: text("doc_type").notNull(),
    series: text("series").notNull().default("A"),
    year: integer("year").notNull(),
    nextNumber: integer("next_number").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("document_sequences_scope_idx").on(
      t.orgId,
      t.docType,
      t.series,
      t.year,
    ),
  ],
);
