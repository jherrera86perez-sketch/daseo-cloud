/**
 * Parser del CSV bancario. Formato documentado (cabecera obligatoria):
 *   fecha,descripcion,monto[,referencia]
 * - Separador: coma o punto y coma (autodetectado por la cabecera)
 * - Fecha: yyyy-mm-dd o dd/mm/yyyy
 * - Monto: 1234.56 | 1.234,56 | -25,50 (signo: + entra, − sale)
 * Las filas inválidas se descartan en silencio (el import reporta conteos).
 */

export type BankCsvRow = {
  date: string; // yyyy-mm-dd
  description: string;
  amountCents: bigint;
  reference?: string;
};

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseDate(raw: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return raw;
  const latam = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (latam) return `${latam[3]}-${latam[2]}-${latam[1]}`;
  return null;
}

function parseAmountCents(raw: string): bigint | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  // "1.234,56" (BR/ES) → "1234.56" · "1,234.56" (US) → "1234.56"
  if (/,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const cents = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0") || "0");
  return negative ? -cents : cents;
}

export function parseBankCsv(text: string): BankCsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const rows: BankCsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line, sep);
    if (cols.length < 3) continue;
    const date = parseDate(cols[0]);
    const description = cols[1];
    const amountCents = parseAmountCents(cols[2]);
    if (!date || !description || amountCents === null || amountCents === 0n) {
      continue;
    }
    rows.push({
      date,
      description,
      amountCents,
      reference: cols[3] || undefined,
    });
  }
  return rows;
}
