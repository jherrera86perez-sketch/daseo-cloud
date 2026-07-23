import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { getDb } from "@/db";
import { listStatements } from "@/features/statements/queries";
import {
  StatementsView,
  type StatementDto,
} from "@/features/statements/statements-ui";

// Port fiel de la página "Estados de Cuenta" del ERP CubaOne (F8-M2).
export default async function StatementsPage() {
  const { orgId } = await requireOrg();
  const t = await getTranslations("app.statements");
  const rows = await listStatements(getDb(), orgId);

  const dtos: StatementDto[] = rows.map((s) => ({
    id: s.id,
    filename: s.filename,
    titular: s.titular,
    fechaInicio: s.fechaInicio,
    fechaFin: s.fechaFin,
    saldoInicial: s.saldoInicial,
    saldoFinal: s.saldoFinal,
    totalCreditos: s.totalCreditos,
    totalDebitos: s.totalDebitos,
    numOperaciones: s.numOperaciones,
    cuadrado: s.cuadrado,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <StatementsView statements={dtos} />
    </div>
  );
}
