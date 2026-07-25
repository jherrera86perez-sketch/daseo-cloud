import { cn } from "@/lib/utils";

/*
 * Sparkline del Panel de Control del ERP CubaOne.
 *
 * SVG puro, sin librería. El ERP usa ECharts para estas curvas, pero para una
 * línea con relleno el SVG es indistinguible y cuesta 0 KB de JavaScript —
 * el mismo criterio con el que Cloud ya dibuja la curva de Pareto de Top
 * Clientes y las barras del embudo.
 *
 * Server component.
 */
export function Sparkline({
  values,
  tone = "accent",
  className,
  filled = true,
}: {
  values: number[];
  tone?: "accent" | "primary" | "success" | "danger";
  className?: string;
  filled?: boolean;
}) {
  if (values.length < 2) return null;

  const W = 100;
  const H = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    // 2px de aire arriba y abajo para que la curva no se corte
    const y = H - 2 - ((v - min) / span) * (H - 4);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const line = `M${pts.join(" L")}`;
  const area = `${line} L${W},${H} L0,${H} Z`;

  const STROKE = {
    accent: "stroke-brand-accent",
    primary: "stroke-primary",
    success: "stroke-[#16A34A]",
    danger: "stroke-[#DC2626]",
  }[tone];

  const FILL = {
    accent: "fill-brand-accent/12",
    primary: "fill-primary/12",
    success: "fill-[#16A34A]/12",
    danger: "fill-[#DC2626]/12",
  }[tone];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn("h-7 w-full", className)}
    >
      {filled ? <path d={area} className={FILL} /> : null}
      <path
        d={line}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className={STROKE}
      />
    </svg>
  );
}

/*
 * Gráfico de dos series del ERP ("Ventas facturadas vs Cobros registrados").
 * Mismo criterio: SVG puro con rejilla punteada, como la del ERP.
 */
export function DualLineChart({
  labels,
  seriesA,
  seriesB,
  labelA,
  labelB,
  className,
}: {
  labels: string[];
  seriesA: number[];
  seriesB?: number[];
  labelA: string;
  labelB?: string;
  className?: string;
}) {
  if (seriesA.length < 2) return null;

  const W = 600;
  const H = 160;
  const PAD = 8;
  const all = [...seriesA, ...(seriesB ?? [])];
  const max = Math.max(...all) || 1;

  const path = (vals: number[]) =>
    "M" +
    vals
      .map((v, i) => {
        const x = PAD + (i / (vals.length - 1)) * (W - PAD * 2);
        const y = H - PAD - (v / max) * (H - PAD * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" L");

  return (
    <div className={className}>
      <div className="mb-3 flex items-center gap-4">
        <span className="t-label flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-brand-accent" aria-hidden />
          {labelA}
        </span>
        {seriesB && labelB ? (
          <span className="t-label flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
            {labelB}
          </span>
        ) : null}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${labelA} · ${labelB}`}
        className="h-40 w-full"
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={W - PAD}
            y1={PAD + f * (H - PAD * 2)}
            y2={PAD + f * (H - PAD * 2)}
            strokeDasharray="3 4"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            className="stroke-chart-grid"
          />
        ))}
        <path
          d={path(seriesA)}
          fill="none"
          strokeWidth={1.75}
          vectorEffect="non-scaling-stroke"
          className="stroke-brand-accent"
        />
        {seriesB ? (
          <path
            d={path(seriesB)}
            fill="none"
            strokeWidth={1.75}
            vectorEffect="non-scaling-stroke"
            className="stroke-primary"
          />
        ) : null}
      </svg>

      <div className="mt-2 flex justify-between">
        {labels.map((l) => (
          <span key={l} className="t-label">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
