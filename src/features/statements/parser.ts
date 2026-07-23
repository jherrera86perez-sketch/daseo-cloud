/**
 * Parser de estados de cuenta BPA (Banco Popular de Ahorro).
 * PORT FIEL 1:1 de server/services/bpaStatementParser.js del ERP CubaOne
 * (regla de oro: copia exacta). Parsea el texto de `pdftotext -layout`.
 *
 * Layout real por espacios iniciales (verificado contra PDFs reales):
 *   sp = 0        → línea de fecha: "DD/MM/YYYY [REF997 CR/DB]"
 *   sp ≈ 17-25    → línea solo-referencia (siguientes ops del mismo día)
 *   sp ≈ 35-52    → línea importe: "X XXX.XX  X XXX.XX  [OBSERVACION…]"
 *   sp ≥ 55       → continuación de observación (incluye saltos de página)
 */

// REF: 2 letras + 6+ alfanuméricos + 3 dígitos de sucursal + CR/DB.
// Cubre transferencias automáticas (suc. 341) y variante con 3 espacios.
const REF_REGEX = /([A-Z]{2}[A-Z0-9]{6,}\d{3})\s*(CR|DB)\b/;
const REF_ONLY_REGEX = /^([A-Z]{2}[A-Z0-9]{6,}\d{3})\s*$/;
const ORPHAN_OP_REGEX = /^(CR|DB)\s*$/;
const DATE_REGEX = /^\d{2}\/\d{2}\/\d{4}/;

export type Operacion = {
  fecha: string; // DD/MM/YYYY
  referencia: string; // ref + oper
  referencia_base: string;
  operacion: "CR" | "DB";
  importe: number | null;
  saldo: number | null;
  observacion: string;
  client_name: string | null;
  pan_origen: string | null;
  tipo_transaccion: "BANCA_MOVIL" | "SWITCH_CE" | "OTRO" | null;
};

export type CuentaInfo = {
  cuentaInterna?: string;
  cuentaEstandarizada?: string;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  titular?: string;
  saldoInicial?: number;
};

export type Validacion = {
  cuadrado: boolean;
  mensajes: string[];
  pdfDepositos: number | null;
  pdfExtracciones: number | null;
  pdfSaldoFinal: number | null;
};

export type Resumen = {
  totalOperaciones: number;
  totalCreditos: number;
  totalDebitos: number;
  saldoInicial: number;
  saldoFinal: number | null;
  validacion: Validacion;
};

function leadingSpaces(line: string): number {
  return line.length - line.trimStart().length;
}

/** Los montos usan ESPACIO como separador de miles: "1 850.00" → 1850.00 */
function parseAmount(str: string): number {
  if (!str) return 0;
  return parseFloat(str.replace(/\s/g, ""));
}

function extractAmountAndSaldo(trimmed: string) {
  const pattern = /^(\d[\d ]*\.\d{2})\s{2,}(\d[\d ]*\.\d{2})(?:\s+(.*))?$/;
  const m = trimmed.match(pattern);
  if (!m) return null;
  return {
    importe: parseAmount(m[1]),
    saldo: parseAmount(m[2]),
    obs: m[3] ? m[3].trim() : "",
  };
}

/** BancaMovil: "Ordenada por: NOMBRE PAN:" */
function extractClientName(obs: string): string | null {
  const m = obs.match(/Ordenada por:\s+(.+?)\s+PAN:/i);
  return m ? m[1].trim() : null;
}

/** Primera tarjeta enmascarada: 6 dígitos + 6 X + 4 dígitos */
function extractPAN(obs: string): string | null {
  const m = obs.match(/(\d{6}X{6}\d{4})/);
  return m ? m[1] : null;
}

/** Móvil cubano en la observación: 53[5-9] + 7 dígitos */
export function extractTelefono(obs: string | null): string | null {
  if (!obs) return null;
  const m = obs.match(/\b(53[5-9]\d{7})\b/);
  return m ? m[1] : null;
}

function getTipoTransaccion(obs: string): "BANCA_MOVIL" | "SWITCH_CE" | "OTRO" {
  const up = obs.toUpperCase();
  if (up.includes("BANCAMOVIL") || up.includes("BANCA MOVIL")) {
    return "BANCA_MOVIL";
  }
  if (up.includes("SWITCH CE")) return "SWITCH_CE";
  return "OTRO";
}

function makeOp(fecha: string, ref: string, oper: "CR" | "DB"): Operacion {
  return {
    fecha,
    referencia: ref + oper,
    referencia_base: ref,
    operacion: oper,
    importe: null,
    saldo: null,
    observacion: "",
    client_name: null,
    pan_origen: null,
    tipo_transaccion: null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** DD/MM/YYYY → { fechaIso: YYYY-MM-DD, mes, anio } (nulls si no matchea) */
export function parseFecha(fecha: string | null): {
  fechaIso: string | null;
  mes: number | null;
  anio: number | null;
} {
  if (!fecha || !/^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) {
    return { fechaIso: null, mes: null, anio: null };
  }
  const [dd, mm, yyyy] = fecha.split("/");
  return {
    fechaIso: `${yyyy}-${mm}-${dd}`,
    mes: parseInt(mm, 10),
    anio: parseInt(yyyy, 10),
  };
}

export function parseStatement(rawText: string): {
  operaciones: Operacion[];
  resumen: Resumen;
  cuentaInfo: CuentaInfo;
} {
  const lines = rawText.split("\n");
  const operaciones: Operacion[] = [];
  let currentDate: string | null = null;
  let currentOp: Operacion | null = null;
  const cuentaInfo: CuentaInfo = {};

  // ── cabecera de cuenta (primeras ~100 líneas) ──
  for (let i = 0; i < Math.min(100, lines.length); i++) {
    const t = lines[i].trim();
    if (!t) continue;

    if (t.startsWith("Cuenta Interna:") && !cuentaInfo.cuentaInterna) {
      cuentaInfo.cuentaInterna = t.replace("Cuenta Interna:", "").trim();
    } else if (
      t.startsWith("Cuenta Estandarizada:") &&
      !cuentaInfo.cuentaEstandarizada
    ) {
      cuentaInfo.cuentaEstandarizada = t
        .replace("Cuenta Estandarizada:", "")
        .trim();
    } else if (t.startsWith("Fecha Inicial:") && !cuentaInfo.fechaInicio) {
      cuentaInfo.fechaInicio = t.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || null;
    } else if (t.startsWith("Fecha Final:") && !cuentaInfo.fechaFin) {
      cuentaInfo.fechaFin = t.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || null;
    } else if (
      !cuentaInfo.titular &&
      t.match(/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑA-Za-záéíóúñ\s]{8,}$/) &&
      ![
        "ESTADO DE CUENTA",
        "SUCURSAL",
        "BANCO",
        "FECHA",
        "SALDO",
        "FONDO",
        "CENTRO",
        "SOBREGIRO",
        "DISPONIBLE",
        "RESERVADO",
      ].some((k) => t.toUpperCase().includes(k))
    ) {
      cuentaInfo.titular = t;
    }
  }

  // ── saldo inicial (monto standalone tras la etiqueta) ──
  for (let i = 0; i < Math.min(80, lines.length); i++) {
    const t = lines[i].trim();
    if (t === "Saldo Inicial" || t === "SaldoInicial") {
      const nextTrimmed = (lines[i + 1] || "").trim();
      const val = parseAmount(nextTrimmed);
      if (!isNaN(val) && val > 0) {
        cuentaInfo.saldoInicial = val;
        break;
      }
    }
  }

  // ── totales declarados por el PDF (bloque final, últimas ~100 líneas) ──
  const pdfTotals: {
    depositos?: number;
    extracciones?: number;
    saldoFinal?: number;
  } = {};
  const tailStart = Math.max(0, lines.length - 100);
  for (let i = tailStart; i < lines.length; i++) {
    const t = lines[i].trim();
    // Saltar bloques por página "Al Cierre del …"
    if (t.startsWith("Al Cierre") || /^Dep.sitos\s+\d/.test(t)) continue;

    const label =
      t === "Depósitos" || t === "Depositos"
        ? ("depositos" as const)
        : t === "Extracciones"
          ? ("extracciones" as const)
          : t === "Saldo Final" || t === "SaldoFinal"
            ? ("saldoFinal" as const)
            : null;
    if (!label) continue;

    for (let j = 1; j <= 4 && i + j < lines.length; j++) {
      const nx = (lines[i + j] || "").trim();
      if (!nx) continue;
      if (/^\d[\d\s]*\.\d{2}$/.test(nx)) {
        pdfTotals[label] = parseAmount(nx);
      }
      break;
    }
  }

  // ── transacciones (máquina de estados por columna) ──
  let pendingOper: "CR" | "DB" | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sp = leadingSpaces(line);
    const tr = line.trim();

    if (!tr) continue;

    // línea de fecha (sp=0)
    if (sp === 0 && DATE_REGEX.test(tr)) {
      currentDate = tr.substring(0, 10);
      const rest = tr.substring(10).trim();
      const refM = rest.match(REF_REGEX);
      if (refM) {
        currentOp = makeOp(currentDate, refM[1], refM[2] as "CR" | "DB");
        operaciones.push(currentOp);
        pendingOper = null;
      }
      continue;
    }

    // "CR"/"DB" huérfano en su propia línea (sp ≥ 15)
    if (sp >= 15 && ORPHAN_OP_REGEX.test(tr)) {
      pendingOper = tr as "CR" | "DB";
      continue;
    }

    // línea solo-referencia (sp 17-25)
    if (sp >= 17 && sp <= 25) {
      const refM = tr.match(REF_REGEX);
      if (refM) {
        currentOp = makeOp(currentDate ?? "", refM[1], refM[2] as "CR" | "DB");
        operaciones.push(currentOp);
        pendingOper = null;
        continue;
      }
      const refOnlyM = tr.match(REF_ONLY_REGEX);
      if (refOnlyM && pendingOper) {
        currentOp = makeOp(currentDate ?? "", refOnlyM[1], pendingOper);
        operaciones.push(currentOp);
        pendingOper = null;
        continue;
      }
      continue;
    }

    // línea importe + saldo + obs (sp 35-52)
    if (sp >= 35 && sp <= 52 && currentOp && currentOp.importe === null) {
      const amtData = extractAmountAndSaldo(tr);
      if (amtData) {
        currentOp.importe = amtData.importe;
        currentOp.saldo = amtData.saldo;
        currentOp.observacion = amtData.obs;
      }
      continue;
    }

    // continuación de observación (sp ≥ 55)
    if (sp >= 55 && currentOp && currentOp.importe !== null) {
      currentOp.observacion += " " + tr;
    }
  }

  // ── post-proceso ──
  let totalCreditos = 0;
  let totalDebitos = 0;

  for (const op of operaciones) {
    op.observacion = op.observacion.trim().replace(/\s{2,}/g, " ");
    op.client_name = extractClientName(op.observacion);
    op.pan_origen = extractPAN(op.observacion);
    op.tipo_transaccion = getTipoTransaccion(op.observacion);

    if (op.operacion === "CR") totalCreditos += op.importe || 0;
    if (op.operacion === "DB") totalDebitos += op.importe || 0;
  }

  // saldo final = último saldo no-nulo
  let saldoFinal: number | null = null;
  for (let i = operaciones.length - 1; i >= 0; i--) {
    if (operaciones[i].saldo !== null) {
      saldoFinal = operaciones[i].saldo;
      break;
    }
  }

  // ── validación aritmética contra los totales del PDF (tolerancia 0.02) ──
  const saldoInicial = cuentaInfo.saldoInicial || 0;
  const validacion: Validacion = {
    cuadrado: true,
    mensajes: [],
    pdfDepositos: pdfTotals.depositos ?? null,
    pdfExtracciones: pdfTotals.extracciones ?? null,
    pdfSaldoFinal: pdfTotals.saldoFinal ?? null,
  };

  const approxEq = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol;

  if (
    pdfTotals.depositos != null &&
    !approxEq(totalCreditos, pdfTotals.depositos)
  ) {
    validacion.cuadrado = false;
    validacion.mensajes.push(
      `Depósitos: PDF declara ${round2(pdfTotals.depositos)} pero se sumaron ${round2(totalCreditos)} (diferencia ${round2(pdfTotals.depositos - totalCreditos)})`,
    );
  }
  if (
    pdfTotals.extracciones != null &&
    !approxEq(totalDebitos, pdfTotals.extracciones)
  ) {
    validacion.cuadrado = false;
    validacion.mensajes.push(
      `Extracciones: PDF declara ${round2(pdfTotals.extracciones)} pero se sumaron ${round2(totalDebitos)} (diferencia ${round2(pdfTotals.extracciones - totalDebitos)})`,
    );
  }
  if (pdfTotals.saldoFinal != null) {
    const saldoCalculado = saldoInicial + totalCreditos - totalDebitos;
    if (!approxEq(saldoCalculado, pdfTotals.saldoFinal)) {
      validacion.cuadrado = false;
      validacion.mensajes.push(
        `Saldo Final: PDF declara ${round2(pdfTotals.saldoFinal)} pero (SaldoInicial + Créditos - Débitos) da ${round2(saldoCalculado)}`,
      );
    }
  }

  const resumen: Resumen = {
    totalOperaciones: operaciones.length,
    totalCreditos: round2(totalCreditos),
    totalDebitos: round2(totalDebitos),
    saldoInicial: round2(saldoInicial),
    saldoFinal,
    validacion,
  };

  return { operaciones, resumen, cuentaInfo };
}
