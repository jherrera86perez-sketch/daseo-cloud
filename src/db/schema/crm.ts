import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  date,
  check,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { id, timestamps, organizations, users } from "./core";

export const customers = pgTable(
  "customers",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    taxId: text("tax_id"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    notes: text("notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("customers_org_idx").on(t.orgId, t.name)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    name: text("name").notNull(),
    role: text("role"),
    email: text("email"),
    phone: text("phone"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("contacts_org_customer_idx").on(t.orgId, t.customerId)],
);

export const interactions = pgTable(
  "interactions",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    userId: uuid("user_id").references(() => users.id),
    type: text("type").notNull(),
    content: text("content").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("interactions_org_customer_idx").on(
      t.orgId,
      t.customerId,
      t.occurredAt,
    ),
    check(
      "interactions_type_check",
      sql`${t.type} in ('call','meeting','email','whatsapp','note')`,
    ),
  ],
);

export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    isWon: boolean("is_won").notNull().default(false),
    isLost: boolean("is_lost").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("pipeline_stages_org_pos_idx").on(t.orgId, t.position)],
);

export const deals = pgTable(
  "deals",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => pipelineStages.id),
    title: text("title").notNull(),
    amountCents: bigint("amount_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("open"),
    lostReason: text("lost_reason"),
    expectedCloseDate: date("expected_close_date"),
    position: integer("position").notNull().default(0),
    ownerUserId: uuid("owner_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("deals_org_stage_idx").on(t.orgId, t.stageId, t.position),
    check("deals_amount_check", sql`${t.amountCents} >= 0`),
    check("deals_status_check", sql`${t.status} in ('open','won','lost')`),
  ],
);
