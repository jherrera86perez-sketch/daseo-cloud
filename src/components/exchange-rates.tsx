import { cn } from "@/lib/utils";

/*
 * Widget de tasas portado del ERP CubaOne
 * (`src/components/ExchangeRatesWidget.tsx`). Pastillas de 4px/10px, texto de
 * 12px sobre borde y fondo de superficie, con el código de moneda en su color:
 * USD verde, MLC violeta, EUR amarillo — los tres literales del original.
 *
 * En el ERP las monedas están fijas a USD/MLC/EUR. Aquí se muestran las que la
 * organización tenga tasa vigente, porque Cloud es multi-tenant y multi-moneda:
 * la lista fija sería mentira para una org brasileña.
 *
 * Server component.
 */
const CURRENCY_COLORS: Record<string, string> = {
  USD: "bg-[rgba(16,185,129,0.15)] text-[#10b981]",
  MLC: "bg-[rgba(139,92,246,0.15)] text-[#8b5cf6]",
  EUR: "bg-[rgba(234,179,8,0.15)] text-[#eab308]",
};

export function ExchangeRates({
  rates,
  className,
}: {
  rates: Array<{ currency: string; value: string }>;
  className?: string;
}) {
  if (rates.length === 0) return null;

  return (
    <div
      className={cn(
        "hidden items-center gap-1.5 rounded-[6px] border border-border bg-background px-2.5 py-1 xl:flex",
        className,
      )}
    >
      {rates.map(({ currency, value }, i) => (
        <span key={currency} className="flex items-center gap-1.5">
          {i > 0 ? (
            <span className="text-text-muted" aria-hidden>
              ·
            </span>
          ) : null}
          <span
            className={cn(
              "rounded px-1 py-0.5 text-[10px] font-semibold",
              CURRENCY_COLORS[currency] ??
                "bg-surface-200 text-muted-foreground",
            )}
          >
            {currency}
          </span>
          <span className="t-num text-xs text-foreground">{value}</span>
        </span>
      ))}
    </div>
  );
}
