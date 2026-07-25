import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listStagesWithDeals } from "@/features/pipeline/queries";
import { listCustomers } from "@/features/customers/queries";
import { PipelineBoard } from "@/features/pipeline/board";

export default async function PipelinePage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.pipeline");
  const db = getDb();
  const [board, customers] = await Promise.all([
    listStagesWithDeals(db, orgId),
    listCustomers(db, orgId, {}),
  ]);

  const dealsByStage: Record<
    string,
    Array<{
      id: string;
      title: string;
      customerName?: string;
      amountCents: string;
      currency: string;
      stageId: string;
    }>
  > = {};
  for (const col of board) {
    dealsByStage[col.stage.id] = col.deals.map((d) => ({
      id: d.id,
      title: d.title,
      customerName: d.customerName,
      amountCents: d.amountCents.toString(),
      currency: d.currency,
      stageId: d.stageId,
    }));
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="t-display text-2xl tracking-[-0.025em]">{t("title")}</h1>
      {customers.length === 0 ? (
        <p className="rounded-md border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {t("needCustomer")}
        </p>
      ) : (
        <PipelineBoard
          stages={board.map((b) => ({
            id: b.stage.id,
            name: b.stage.name,
            isWon: b.stage.isWon,
            isLost: b.stage.isLost,
          }))}
          dealsByStage={dealsByStage}
          customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        />
      )}
    </div>
  );
}
