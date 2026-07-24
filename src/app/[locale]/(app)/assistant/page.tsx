import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import {
  obtenerKPIs,
  generarRecomendaciones,
  type Rango,
} from "@/features/assistant/analytics";
import { listFollowups } from "@/features/assistant/followups";
import { PanelNegocioView } from "@/features/assistant/panel-ui";

// Port fiel de la página "Panel del Negocio" del ERP CubaOne (PanelNegocio.tsx):
// KPIs del asistente + "Acciones más urgentes" agrupadas por categoría +
// seguimiento de recomendaciones (TablaRecomendaciones + asistente_seguimiento).
const pad = (n: number) => String(n).padStart(2, "0");

export default async function AssistantPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ periodo?: string; y?: string; m?: string }>;
}>) {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.assistantPanel");
  const sp = await searchParams;

  const ahora = new Date();
  const y = Number(sp.y) || ahora.getFullYear();
  const m = Number(sp.m) || ahora.getMonth() + 1;
  const periodo =
    sp.periodo === "hoy" ? "hoy" : sp.periodo === "todos" ? "todos" : "mes";

  // hoy → un día; mes → mes calendario; todos → default del motor (90 días)
  let rango: Rango = {};
  if (periodo === "hoy") {
    const d = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;
    rango = { desde: d, hasta: d };
  } else if (periodo === "mes") {
    const ultimoDia = new Date(y, m, 0).getDate();
    rango = { desde: `${y}-${pad(m)}-01`, hasta: `${y}-${pad(m)}-${pad(ultimoDia)}` };
  }

  const db = getDb();
  const [kpis, recomendaciones, followups] = await Promise.all([
    obtenerKPIs(db, orgId, rango),
    generarRecomendaciones(db, orgId, rango),
    listFollowups(db, orgId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <PanelNegocioView
        kpis={kpis}
        recomendaciones={recomendaciones}
        followups={followups.map((f) => ({
          recommendationId: f.recommendationId,
          status: f.status,
          notes: f.notes,
        }))}
        periodo={periodo}
        y={y}
        m={m}
      />
    </div>
  );
}
