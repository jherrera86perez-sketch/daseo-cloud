import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
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

export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    baseCurrency: text("base_currency").notNull(),
    locale: text("locale").notNull().default("es"),
    timezone: text("timezone").notNull().default("America/Havana"),
    fiscalCountry: text("fiscal_country"),
    fiscalSettings: jsonb("fiscal_settings"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("organizations_slug_idx").on(t.slug),
    check(
      "organizations_currency_check",
      sql`${t.baseCurrency} in ('CUP','USD','BRL')`,
    ),
  ],
);

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    locale: text("locale").notNull().default("es"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    role: text("role").notNull().default("member"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("memberships_user_org_idx").on(t.userId, t.orgId),
    check("memberships_role_check", sql`${t.role} in ('admin','member')`),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("invitations_token_idx").on(t.token)],
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
