import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/layout/page-header";
import { PageLayout } from "@/components/ui/layout/page-layout";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listRaffles } from "@/features/raffles/queries";
import { RafflesView, type RaffleDto } from "@/features/raffles/raffles-ui";

// Port fiel de la página "Sorteos" del ERP CubaOne (F8-M4).
export default async function RafflesPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.raffles");
  const rows = await listRaffles(getDb(), orgId);

  const history: RaffleDto[] = rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    mes: r.mes,
    anio: r.anio,
    numParticipantes: r.numParticipantes,
    ganadorClientName: r.ganadorClientName,
    ganadorTelefono: r.ganadorTelefono,
    ganadorNumOps: r.ganadorNumOps,
    ganadorTotalCreditos: r.ganadorTotalCreditos,
    fechaSorteo: r.fechaSorteo.toISOString(),
  }));

  return (
    <PageLayout
      header={<PageHeader title={t("title")} subtitle={t("subtitle")} />}
    >
      <div className="flex flex-col gap-4">
        <RafflesView history={history} />
      </div>
    </PageLayout>
  );
}
