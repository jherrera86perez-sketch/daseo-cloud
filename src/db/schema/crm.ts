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
    // "aprendida" al vincular un cobro al banco (extraerPagador del ERP)
    referenciaBancaria: text("referencia_bancaria"),
    // ≈ compradores.tipo del ERP: CONSUMIDO de verdad — filtra CxC
    // (GET /cobros/cuentas-por-cobrar?tipo=CLIENTE|PDV). "Punto de Venta"
    // agrupa sus cuentas por cobrar bajo su propio filtro.
    customerType: text("customer_type").notNull().default("CLIENTE"),
    // Resto de campos del tab Financiero/Otros del ERP: informativos, se
    // muestran en la ficha, no se enforzan en ningún flujo (igual que el ERP)
    commercialType: text("commercial_type"), // Persona/Empresa/Gobierno/ONG
    paymentTerms: text("payment_terms"), // Contado/15 días/30 días/...
    creditDays: integer("credit_days"),
    creditLimitCents: bigint("credit_limit_cents", { mode: "bigint" }),
    discountDefaultPct: text("discount_default_pct"),
    category: text("category"), // VIP/Premium/Regular/Nuevo/Inactivo
    // ≈ clientes.fecha_nacimiento del ERP: alimenta el saludo de cumpleaños
    birthDate: date("birth_date"),
    active: boolean("active").notNull().default(true),
    blocked: boolean("blocked").notNull().default(false),
    blockReason: text("block_reason"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("customers_org_idx").on(t.orgId, t.name),
    check("customers_type_check", sql`${t.customerType} in ('CLIENTE','PDV')`),
    check(
      "customers_credit_limit_check",
      sql`${t.creditLimitCents} is null or ${t.creditLimitCents} >= 0`,
    ),
  ],
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
