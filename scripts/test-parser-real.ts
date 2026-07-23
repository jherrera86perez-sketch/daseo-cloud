/**
 * Prueba del parser BPA portado contra un PDF REAL (texto ya extraído con
 * el pdftotext del ERP). Solo local — los datos reales jamás van al repo.
 * Uso: npx tsx scripts/test-parser-real.ts <ruta-al-txt>
 */
import { readFileSync } from "node:fs";
import { parseStatement } from "../src/features/statements/parser";

const txt = readFileSync(process.argv[2], "utf8");
const { operaciones, resumen, cuentaInfo } = parseStatement(txt);

console.log("cuentaInfo:", JSON.stringify(cuentaInfo));
console.log("resumen:", JSON.stringify(resumen, null, 1));
console.log("ops:", operaciones.length);
console.log(
  "con cliente:",
  operaciones.filter((o) => o.client_name).length,
  "· con PAN:",
  operaciones.filter((o) => o.pan_origen).length,
  "· con telefono:",
  operaciones.filter((o) => /\b53[5-9]\d{7}\b/.test(o.observacion)).length,
);
console.log(
  "primeras 2 ops:",
  JSON.stringify(operaciones.slice(0, 2), null, 1),
);
