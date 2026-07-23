import { getTranslations } from "next-intl/server";
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
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <RafflesView history={history} />
    </div>
  );
}
