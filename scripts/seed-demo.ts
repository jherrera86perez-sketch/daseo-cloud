/**
 * Siembra la organización DEMO pública (slug "demo") con datos ficticios.
 *
 * Uso:  npx tsx scripts/seed-demo.ts
 * Env:  DATABASE_URL y BETTER_AUTH_SECRET (los de producción para la demo real).
 *
 * Idempotente a nivel de organización: si la org "demo" ya existe no toca nada
 * (para re-sembrar, borrar primero los datos de la org a mano).
 * Reutiliza las queries de los módulos para que ventas, kardex y producción
 * queden contablemente consistentes (numeración, promedios, contramovimientos).
 */
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { createAuth, DEFAULT_STAGES } from "../src/lib/auth";
import {
  organizations,
  members,
  orgSettings,
  pipelineStages,
  subscriptions,
  users,
} from "../src/db/schema";
import { createCustomer } from "../src/features/customers/queries";
import {
  createProduct,
  registerMovement,
} from "../src/features/inventory/queries";
import { addRate } from "../src/features/rates/queries";
import {
  createSale,
  confirmSale,
  addPayment,
} from "../src/features/sales/queries";
import { createDeal } from "../src/features/pipeline/queries";
import { createQuote, sendQuote } from "../src/features/quotes/queries";
import {
  createSupplier,
  createPurchase,
  confirmPurchase,
  addSupplierPayment,
} from "../src/features/purchases/queries";
import { createRecipe } from "../src/features/recipes/queries";
import {
  createOrder,
  confirmOrder,
  getOrderDetail,
} from "../src/features/production/queries";
import {
  createEmployee,
  createCommitment,
} from "../src/features/people/queries";

const DEMO_EMAIL = "demo@daseo.app";
const DEMO_PASSWORD = "demo-daseo-2026";
const DEMO_SLUG = "demo";

async function main() {
  const db = getDb();

  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, DEMO_SLUG));
  if (existing[0]) {
    console.log(
      `La org "${DEMO_SLUG}" ya existe (${existing[0].id}). Nada que hacer.`,
    );
    return;
  }

  // --- usuario demo (signup real de Better Auth; si ya existe, se reutiliza) ---
  const auth = createAuth(db, {
    secret: process.env.BETTER_AUTH_SECRET ?? "",
    rateLimitEnabled: false,
  });
  try {
    await auth.api.signUpEmail({
      body: { name: "Cuenta Demo", email: DEMO_EMAIL, password: DEMO_PASSWORD },
    });
    console.log("Usuario demo creado.");
  } catch {
    console.log("Usuario demo ya existía, se reutiliza.");
  }
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEMO_EMAIL));
  if (!user) throw new Error("No se pudo crear/encontrar el usuario demo");
  const userId = user.id;

  // --- org + provisioning (espejo del hook afterCreateOrganization) ---
  const [org] = await db
    .insert(organizations)
    .values({ name: "Daseo Demo", slug: DEMO_SLUG })
    .returning();
  const orgId: string = org.id;
  await db.insert(members).values({
    organizationId: orgId,
    userId,
    role: "owner",
  });
  await db.insert(orgSettings).values({ orgId, baseCurrency: "CUP" });
  await db
    .insert(pipelineStages)
    .values(DEFAULT_STAGES.map((s) => ({ ...s, orgId })));
  // La demo siempre activa: sin banners de trial para los visitantes (F7).
  await db.insert(subscriptions).values({
    orgId,
    plan: "pro",
    status: "active",
    activatedAt: new Date(),
    notes: "Org demo pública",
  });
  console.log(`Org demo creada: ${orgId}`);

  // --- tasa vigente ---
  await addRate(db, orgId, userId, { currency: "USD", rateToBase: "320" });

  // --- clientes ---
  const bodega = await createCustomer(db, orgId, userId, {
    name: "Bodega La Estrella",
    phone: "+53 5 234 5678",
    address: "Calle Real 45, Matanzas",
  });
  const cafeteria = await createCustomer(db, orgId, userId, {
    name: "Cafetería El Portal",
    phone: "+53 5 876 5432",
  });
  const hotel = await createCustomer(db, orgId, userId, {
    name: "Hotel Costa Azul",
    email: "compras@costaazul.example",
    notes: "Paga en USD. Pedidos quincenales.",
  });
  const mercado = await createCustomer(db, orgId, userId, {
    name: "Mercado Buenavista",
  });
  const restaurante = await createCustomer(db, orgId, userId, {
    name: "Restaurante Doña Marta",
    phone: "+53 5 111 2233",
  });

  // --- productos ---
  const detergente = await createProduct(db, orgId, userId, {
    name: "Detergente líquido",
    sku: "DET-L",
    unit: "L",
    isSellable: true,
    isProducible: true,
    stockMin: "30",
  });
  const suavizante = await createProduct(db, orgId, userId, {
    name: "Suavizante de ropa",
    sku: "SUA-L",
    unit: "L",
    isSellable: true,
    isProducible: true,
  });
  const sulfato = await createProduct(db, orgId, userId, {
    name: "Sulfato industrial",
    sku: "MP-SUL",
    unit: "kg",
    isSellable: false,
    isComponent: true,
    stockMin: "10",
  });
  const aroma = await createProduct(db, orgId, userId, {
    name: "Esencia de lavanda",
    sku: "MP-LAV",
    unit: "L",
    isSellable: false,
    isComponent: true,
  });
  const envase = await createProduct(db, orgId, userId, {
    name: "Envase plástico 1L",
    sku: "MP-ENV",
    unit: "unit",
    isSellable: false,
    isComponent: true,
    stockMin: "50",
  });
  const jabon = await createProduct(db, orgId, userId, {
    name: "Jabón de tocador",
    sku: "REV-JAB",
    unit: "unit",
    isSellable: true,
  });

  // --- stock inicial (entradas manuales al costo) ---
  await registerMovement(db, orgId, userId, {
    productId: sulfato.id,
    kind: "in",
    qty: "80",
    unitCostCents: 55_00n,
    note: "Stock inicial demo",
  });
  await registerMovement(db, orgId, userId, {
    productId: aroma.id,
    kind: "in",
    qty: "12",
    unitCostCents: 320_00n,
    note: "Stock inicial demo",
  });
  await registerMovement(db, orgId, userId, {
    productId: envase.id,
    kind: "in",
    qty: "400",
    unitCostCents: 18_00n,
    note: "Stock inicial demo",
  });
  await registerMovement(db, orgId, userId, {
    productId: jabon.id,
    kind: "in",
    qty: "150",
    unitCostCents: 90_00n,
    note: "Stock inicial demo",
  });
  console.log("Clientes, productos y stock listos.");

  // --- receta + producción confirmada (kardex al costo real) ---
  const receta = await createRecipe(db, orgId, userId, {
    productId: detergente.id,
    name: "Detergente estándar (lote 100 L)",
    outputQty: "100",
    items: [
      { productId: sulfato.id, qty: "12" },
      { productId: aroma.id, qty: "1.5" },
      { productId: envase.id, qty: "100" },
    ],
  });
  const orden = await createOrder(db, orgId, userId, {
    recipeId: receta.id,
    note: "Lote semanal",
  });
  const detalle = await getOrderDetail(db, orgId, orden.id);
  await confirmOrder(db, orgId, userId, orden.id, {
    producedQty: "98",
    laborCostBaseCents: 1500_00n,
    overheadBaseCents: 800_00n,
    inputs: detalle.inputs.map((i: { id: string; plannedQty: string }) => ({
      inputId: i.id,
      actualQty: i.plannedQty,
    })),
  });
  console.log("Producción confirmada (98 L de detergente).");

  // --- compra confirmada con lote (CxP con pago parcial) ---
  const quimica = await createSupplier(db, orgId, userId, {
    name: "Química del Caribe SRL",
    email: "ventas@quimicaribe.example",
  });
  const compra = await createPurchase(db, orgId, userId, {
    supplierId: quimica.id,
    currency: "USD",
    rateToBase: "320",
    idempotencyKey: "00000000-0000-4000-8000-000000000101",
    items: [
      {
        productId: sulfato.id,
        description: "Sulfato industrial saco 25kg",
        qty: "50",
        unitCostCents: 150n, // 1.50 USD/kg → 480 CUP/kg al kardex
        lotCode: "SUL-2026-08",
        expiryDate: "2027-01-31",
      },
    ],
  });
  await confirmPurchase(db, orgId, userId, compra.id);
  await addSupplierPayment(db, orgId, userId, compra.id, {
    amountCents: 40_00n, // 40 USD
    currency: "USD",
    rateFixed: "320",
    appliedCents: 40_00n,
    method: "transfer",
  });
  console.log("Compra confirmada con lote y pago parcial.");

  // --- ventas ---
  // 1) CUP, confirmada y cobrada completa
  const venta1 = await createSale(db, orgId, userId, {
    customerId: bodega.id,
    currency: "CUP",
    rateToBase: "1",
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
    items: [
      {
        productId: detergente.id,
        description: "Detergente líquido",
        qty: "20",
        unitPriceCents: 95_00n,
      },
      {
        productId: jabon.id,
        description: "Jabón de tocador",
        qty: "10",
        unitPriceCents: 150_00n,
      },
    ],
  });
  await confirmSale(db, orgId, userId, venta1.id);
  await addPayment(db, orgId, userId, venta1.id, {
    amountCents: 3400_00n,
    currency: "CUP",
    rateFixed: "1",
    appliedCents: 3400_00n,
    method: "cash",
  });

  // 2) USD, confirmada, cobro parcial en moneda cruzada (CUP → USD)
  const venta2 = await createSale(db, orgId, userId, {
    customerId: hotel.id,
    currency: "USD",
    rateToBase: "320",
    idempotencyKey: "00000000-0000-4000-8000-000000000002",
    dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    items: [
      {
        productId: detergente.id,
        description: "Detergente líquido",
        qty: "40",
        unitPriceCents: 50n, // 0.50 USD/L
      },
    ],
  });
  await confirmSale(db, orgId, userId, venta2.id);
  await addPayment(db, orgId, userId, venta2.id, {
    amountCents: 3200_00n, // cobró 3.200 CUP
    currency: "CUP",
    rateFixed: "320",
    appliedCents: 10_00n, // aplicados 10 USD → quedan 10 USD de saldo
    method: "cash",
  });

  // 3) Borrador (para que la demo tenga algo editable)
  await createSale(db, orgId, userId, {
    customerId: cafeteria.id,
    currency: "CUP",
    rateToBase: "1",
    idempotencyKey: "00000000-0000-4000-8000-000000000003",
    items: [
      {
        productId: detergente.id,
        description: "Detergente líquido",
        qty: "15",
        unitPriceCents: 95_00n,
      },
    ],
  });
  console.log("Ventas sembradas (cobrada, parcial en USD y borrador).");

  // --- pipeline + cotización enviada ---
  await createDeal(db, orgId, userId, {
    customerId: mercado.id,
    title: "Pedido mensual de detergente",
    amountCents: 25_000_00n,
    currency: "CUP",
  });
  await createDeal(db, orgId, userId, {
    customerId: restaurante.id,
    title: "Suministro de suavizante",
    amountCents: 60_00n,
    currency: "USD",
  });
  const cotizacion = await createQuote(db, orgId, userId, {
    customerId: mercado.id,
    currency: "CUP",
    rateToBase: "1",
    validUntil: new Date(Date.now() + 15 * 24 * 3600 * 1000),
    items: [
      {
        productId: detergente.id,
        description: "Detergente líquido (mensual)",
        qty: "60",
        unitPriceCents: 90_00n,
      },
    ],
  });
  await sendQuote(db, orgId, userId, cotizacion.id);
  console.log("Pipeline y cotización listos.");

  // --- personas ---
  await createEmployee(db, orgId, userId, {
    name: "Yandy Pérez",
    role: "Operario de producción",
    salaryCents: 6500_00n,
  });
  await createCommitment(db, orgId, userId, {
    customerId: bodega.id,
    description: "Entrega semanal de 20 L de detergente",
    frequency: "weekly",
  });
  console.log("Empleado y compromiso creados.");

  console.log(
    `\nDEMO LISTA → login: ${DEMO_EMAIL} / ${DEMO_PASSWORD} (org "${DEMO_SLUG}")`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
