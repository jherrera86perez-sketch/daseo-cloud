// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";
import { organizations, orgSettings, pipelineStages } from "@/db/schema";
import { DEFAULT_STAGES } from "@/lib/auth";
import { createCustomer } from "@/features/customers/queries";
import {
  listStagesWithDeals,
  createDeal,
  moveDeal,
  createStage,
  renameStage,
  deleteStage,
} from "./queries";
import {
  createQuote,
  sendQuote,
  acceptQuote,
  rejectQuote,
  getQuoteDetail,
} from "@/features/quotes/queries";
import { getSaleDetail } from "@/features/sales/queries";

let db: TestDb;
let orgA: string;
let customerId: string;
let stages: { id: string; name: string; isWon: boolean; isLost: boolean }[];
const USER = null;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const [a] = await db
    .insert(organizations)
    .values({ name: "A", slug: "m6a" })
    .returning();
  orgA = a.id;
  await db.insert(orgSettings).values({ orgId: orgA, baseCurrency: "CUP" });
  await db
    .insert(pipelineStages)
    .values(DEFAULT_STAGES.map((s) => ({ ...s, orgId: orgA })));
  const c = await createCustomer(db, orgA, USER, { name: "Cliente M6" });
  customerId = c.id;
  const board = await listStagesWithDeals(db, orgA);
  stages = board.map((b) => b.stage);
});

describe("pipeline", () => {
  let dealId: string;

  it("crea un deal en la primera etapa", async () => {
    const deal = await createDeal(db, orgA, USER, {
      customerId,
      title: "Pedido grande",
      amountCents: 50000n,
      currency: "CUP",
    });
    dealId = deal.id;
    expect(deal.status).toBe("open");
    const board = await listStagesWithDeals(db, orgA);
    expect(board[0].deals.map((d) => d.title)).toContain("Pedido grande");
  });

  it("mover a Ganado marca won; mover a Perdido marca lost", async () => {
    const won = stages.find((s) => s.isWon)!;
    let moved = await moveDeal(db, orgA, USER, dealId, won.id);
    expect(moved.status).toBe("won");
    const lost = stages.find((s) => s.isLost)!;
    moved = await moveDeal(db, orgA, USER, dealId, lost.id);
    expect(moved.status).toBe("lost");
    const middle = stages[1];
    moved = await moveDeal(db, orgA, USER, dealId, middle.id);
    expect(moved.status).toBe("open");
  });
});

describe("cotizaciones", () => {
  let quoteId: string;
  let dealId: string;

  it("crea cotización numerada con totales en servidor", async () => {
    const deal = await createDeal(db, orgA, USER, {
      customerId,
      title: "Deal cotizado",
      amountCents: 0n,
      currency: "USD",
    });
    dealId = deal.id;
    const q = await createQuote(db, orgA, USER, {
      customerId,
      dealId,
      currency: "USD",
      rateToBase: "320",
      items: [
        { description: "Detergente", qty: "10", unitPriceCents: 200n },
        { description: "Flete", qty: "1", unitPriceCents: 500n },
      ],
    });
    quoteId = q.id;
    expect(q.status).toBe("draft");
    expect(q.number).toBe(1);
    expect(q.totalCents).toBe(2500n);
  });

  it("enviar y rechazar cambian el estado", async () => {
    const sent = await sendQuote(db, orgA, USER, quoteId);
    expect(sent.status).toBe("sent");
    const q2 = await createQuote(db, orgA, USER, {
      customerId,
      currency: "CUP",
      rateToBase: "1",
      items: [{ description: "x", qty: "1", unitPriceCents: 100n }],
    });
    const rejected = await rejectQuote(db, orgA, USER, q2.id);
    expect(rejected.status).toBe("rejected");
  });

  it("aceptar crea venta borrador con las mismas líneas y gana el deal", async () => {
    const { saleId } = await acceptQuote(db, orgA, USER, quoteId);
    const detail = await getQuoteDetail(db, orgA, quoteId);
    expect(detail.quote.status).toBe("accepted");

    const sale = await getSaleDetail(db, orgA, saleId);
    expect(sale.sale.status).toBe("draft");
    expect(sale.sale.totalCents).toBe(2500n);
    expect(sale.sale.currency).toBe("USD");
    expect(sale.items.map((i) => i.description)).toEqual([
      "Detergente",
      "Flete",
    ]);

    const board = await listStagesWithDeals(db, orgA);
    const wonCol = board.find((b) => b.stage.isWon)!;
    expect(wonCol.deals.map((d) => d.id)).toContain(dealId);
  });

  it("no se acepta dos veces", async () => {
    await expect(acceptQuote(db, orgA, USER, quoteId)).rejects.toThrow();
  });
});

describe("etapas editables (F7+)", () => {
  it("createStage entra justo antes de Ganado/Perdido", async () => {
    const nueva = await createStage(db, orgA, USER, "Negociación");
    const board = await listStagesWithDeals(db, orgA);
    const names = board.map((b) => b.stage.name);
    expect(names).toEqual([
      "Prospecto",
      "Contactado",
      "Propuesta",
      "Negociación",
      "Ganado",
      "Perdido",
    ]);
    expect(nueva.isWon).toBe(false);
    await expect(createStage(db, orgA, USER, "negociación")).rejects.toThrow(
      /ya existe/i,
    );
  });

  it("renameStage cambia el nombre", async () => {
    const board = await listStagesWithDeals(db, orgA);
    const negociacion = board.find((b) => b.stage.name === "Negociación")!;
    await renameStage(db, orgA, USER, negociacion.stage.id, "Cierre");
    const after = await listStagesWithDeals(db, orgA);
    expect(after.map((b) => b.stage.name)).toContain("Cierre");
  });

  it("deleteStage borra vacías; protege terminales y ocupadas", async () => {
    const board = await listStagesWithDeals(db, orgA);
    const cierre = board.find((b) => b.stage.name === "Cierre")!;
    const ganado = board.find((b) => b.stage.isWon)!;
    const conDeals = board.find((b) => b.deals.length > 0)!;
    await expect(deleteStage(db, orgA, USER, ganado.stage.id)).rejects.toThrow(
      /no se pueden borrar/i,
    );
    await expect(
      deleteStage(db, orgA, USER, conDeals.stage.id),
    ).rejects.toThrow(/oportunidades/i);
    await deleteStage(db, orgA, USER, cierre.stage.id);
    const after = await listStagesWithDeals(db, orgA);
    expect(after.map((b) => b.stage.name)).not.toContain("Cierre");
  });
});
