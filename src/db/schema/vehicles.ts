import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  date,
  check,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { id, timestamps, organizations } from "./core";

/**
 * ≈ `vehicles` del ERP CubaOne: registro simple del parque vehicular para el
 * impuesto sobre el transporte terrestre (ONAT 071012, "La Chapa").
 * Confirmado en el ERP real: es PURAMENTE INFORMATIVO — la categoría fiscal
 * (`categoryCode`) solo alimenta la suma anual mostrada en la UI; el motor
 * fiscal (`TaxEngine.js`) no la referencia en absoluto, no genera ninguna
 * obligación. Se porta ese mismo comportamiento: NO se integra a
 * `computeMonthObligations`/`dj08Projection`.
 */
export const vehicles = pgTable(
  "vehicles",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    plate: text("plate").notNull(),
    brand: text("brand"),
    model: text("model"),
    // ≈ VEHICLE_TAX_CATEGORIES (fiscal.ts): A_MOTO/A_LIGERO/A_PANEL/
    // B_CARGA_LIGERA/B_CARGA_MEDIA — hardcoded como el ERP, sin pantalla de
    // config editable (mismas cuotas anuales que la tarifa ONAT 2026 real).
    categoryCode: text("category_code").notNull(),
    acquisitionDate: date("acquisition_date"),
    status: text("status").notNull().default("ACTIVE"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("vehicles_org_plate_idx").on(t.orgId, t.plate),
    index("vehicles_org_idx").on(t.orgId, t.status),
    check(
      "vehicles_category_check",
      sql`${t.categoryCode} in ('A_MOTO','A_LIGERO','A_PANEL','B_CARGA_LIGERA','B_CARGA_MEDIA')`,
    ),
    check(
      "vehicles_status_check",
      sql`${t.status} in ('ACTIVE','SOLD','JUNK')`,
    ),
  ],
);
