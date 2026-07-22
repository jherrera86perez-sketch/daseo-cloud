import { getDb } from "./index";
import { organizations, orgSettings, pipelineStages } from "./schema";

/** Etapas que se siembran al crear toda organización (regla del plan). */
export const DEFAULT_STAGES = [
  { name: "Prospecto", position: 1 },
  { name: "Contactado", position: 2 },
  { name: "Propuesta", position: 3 },
  { name: "Ganado", position: 4, isWon: true },
  { name: "Perdido", position: 5, isLost: true },
];

async function seed() {
  const db = getDb();
  const [org] = await db
    .insert(organizations)
    .values({ name: "Daseo (demo)", slug: "daseo-demo" })
    .onConflictDoNothing()
    .returning();
  if (!org) {
    console.log("Seed: la org demo ya existe, nada que hacer.");
    return;
  }
  await db.insert(orgSettings).values({
    orgId: org.id,
    baseCurrency: "CUP",
    fiscalCountry: "CU",
  });
  await db
    .insert(pipelineStages)
    .values(DEFAULT_STAGES.map((s) => ({ ...s, orgId: org.id })));
  console.log(
    `Seed: org demo ${org.id} creada con ${DEFAULT_STAGES.length} etapas.`,
  );
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
