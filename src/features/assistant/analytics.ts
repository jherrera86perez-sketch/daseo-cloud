import { sql } from "drizzle-orm";

/**
 * Motor del Asistente Directivo — port 1:1 de
 * `server/modules/administracion/services/asistenteAnalytics.js` del ERP
 * CubaOne (spec fiel: docs/research/spec-asistente-directivo-erp.md).
 *
 * Decisión de Javier (24-jul-2026): umbrales HARDCODED como en el ERP real
 * (la tabla asistente_config del ERP es código muerto — el motor nunca la lee).
 *
 * Conversiones SQLite→Postgres:
 *  · kardex tipo SALIDA_VENTA/SALIDA_PRODUCCION → inventory_movements con
 *    source_type IN ('sale','production_out') y qty < 0 (los contramovimientos
 *    de cancelación son positivos = las "reversiones" que el ERP excluye).
 *  · productos.stock/costo (denormalizados) → último movimiento por seq.
 *  · dinero: cents bigint → pesos float SOLO en este motor (los textos del
 *    ERP formatean $ con 2 decimales).
 *  · produccion.estado != 'COMPLETADO' → status = 'draft';
 *    merma_registrada → production_orders.waste_qty (migración 0018).
 *  · produccion_mano_obra → production_labor; empleado_evaluaciones (ricas)
 *    → employee_day_evaluations.
 *  · movimientos_cuenta → statement_movements (F8).
 */

// Cualquier instancia drizzle (Neon en prod, PGlite en tests)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type Rango = { desde?: string; hasta?: string };

async function q<T>(db: Db, query: ReturnType<typeof sql>): Promise<T[]> {
  const res = await db.execute(query);
  return (res.rows ?? res) as T[];
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Resuelve el rango de fechas a usar (default: 90 días hacia atrás). */
export function resolverRango(opts: Rango & { diasDefault?: number } = {}): {
  desdeISO: string;
  hastaISO: string;
  dias: number;
} {
  const diasDefault = opts.diasDefault || 90;
  let hastaDate: Date;
  let desdeDate: Date;

  if (opts.hasta) {
    // Aceptar 'YYYY-MM-DD' como fecha local de fin de día
    hastaDate =
      opts.hasta.length === 10
        ? new Date(opts.hasta + "T23:59:59.999Z")
        : new Date(opts.hasta);
  } else {
    hastaDate = new Date();
  }

  if (opts.desde) {
    desdeDate =
      opts.desde.length === 10
        ? new Date(opts.desde + "T00:00:00.000Z")
        : new Date(opts.desde);
  } else {
    desdeDate = new Date(
      hastaDate.getTime() - diasDefault * 24 * 60 * 60 * 1000,
    );
  }

  const dias = Math.max(
    Math.ceil(
      (hastaDate.getTime() - desdeDate.getTime()) / (24 * 60 * 60 * 1000),
    ),
    1,
  );

  return {
    desdeISO: desdeDate.toISOString(),
    hastaISO: hastaDate.toISOString(),
    dias,
  };
}

// ───────────────────────── INVENTARIO ─────────────────────────

export type ProductoAnotado = {
  id: string;
  nombre: string;
  unidad: string;
  es_vendible: boolean;
  es_componente: boolean;
  es_producible: boolean;
  stock: number;
  stock_minimo: number;
  precio: number;
  costo: number;
  valor_inventario: number;
  valor_venta: number;
  salidas_total_historicas: number;
  movimientos_periodo: number;
  consumo_diario: number;
  consumo_diario_periodo: number;
  consumo_diario_historico: number;
  dias_stock: number | null;
  dias_sin_movimiento: number | null;
  estado: "OK" | "AGOTADO" | "BAJO_MIN" | "CRITICO" | "BAJO" | "SIN_MOVIMIENTO";
  sin_precio: boolean;
};

export type AnalisisInventario = {
  inventario: ProductoAnotado[];
  stockBajo: ProductoAnotado[];
  sinMovimiento: ProductoAnotado[];
  sinPrecio: ProductoAnotado[];
  topPorValor: ProductoAnotado[];
  totalProductos: number;
  productosVendibles: number;
  productosComponentes: number;
  valorTotalInventario: number;
  valorTotalVenta: number;
  totalInversionParalizada: number;
  diasAnalisis: number;
  desde: string;
  hasta: string;
  alertasCount: number;
};

export async function analisisInventario(
  db: Db,
  orgId: string,
  rango: Rango = {},
): Promise<AnalisisInventario> {
  const { desdeISO, hastaISO, dias } = resolverRango({
    ...rango,
    diasDefault: 90,
  });

  type Row = {
    id: string;
    nombre: string;
    unidad: string;
    es_vendible: boolean;
    es_componente: boolean;
    es_producible: boolean;
    stock: number;
    stock_minimo: number;
    precio: number;
    costo: number;
    salidas_periodo: number;
    movimientos_periodo: number;
    salidas_total_historicas: number;
    primera_salida: string | Date | null;
    ultimo_movimiento: string | Date | null;
  };
  const inventario = await q<Row>(
    db,
    sql`
      SELECT
        p.id,
        p.name AS nombre,
        p.unit AS unidad,
        p.is_sellable AS es_vendible,
        p.is_component AS es_componente,
        p.is_producible AS es_producible,
        COALESCE(b.stock, 0)::float AS stock,
        p.stock_min::float AS stock_minimo,
        (p.price_cents::float / 100) AS precio,
        (COALESCE(b.costo_cents, 0)::float / 100) AS costo,
        COALESCE(s.salidas_periodo, 0)::float AS salidas_periodo,
        COALESCE(s.movimientos_periodo, 0)::int AS movimientos_periodo,
        COALESCE(h.salidas_hist, 0)::float AS salidas_total_historicas,
        h.primera_salida,
        h.ultimo_movimiento
      FROM products p
      LEFT JOIN LATERAL (
        SELECT m.balance_qty::float AS stock,
               m.balance_avg_cost_base_cents AS costo_cents
        FROM inventory_movements m
        WHERE m.org_id = p.org_id AND m.product_id = p.id
        ORDER BY m.seq DESC LIMIT 1
      ) b ON true
      LEFT JOIN LATERAL (
        SELECT SUM(ABS(m.qty)) AS salidas_periodo, COUNT(*) AS movimientos_periodo
        FROM inventory_movements m
        WHERE m.org_id = p.org_id AND m.product_id = p.id
          AND m.qty < 0 AND m.source_type IN ('sale', 'production_out')
          AND m.created_at >= ${desdeISO}::timestamptz
      ) s ON true
      LEFT JOIN LATERAL (
        SELECT SUM(ABS(m.qty)) AS salidas_hist,
               MIN(m.created_at) AS primera_salida,
               MAX(m.created_at) AS ultimo_movimiento
        FROM inventory_movements m
        WHERE m.org_id = p.org_id AND m.product_id = p.id
          AND m.qty < 0 AND m.source_type IN ('sale', 'production_out')
      ) h ON true
      WHERE p.org_id = ${orgId} AND p.deleted_at IS NULL
      ORDER BY (COALESCE(b.stock, 0) * COALESCE(b.costo_cents, 0)) DESC
    `,
  );

  const productosAnotados: ProductoAnotado[] = inventario.map((p) => {
    const consumoPeriodo = p.salidas_periodo / dias || 0;

    // Consumo histórico: total salidas / días desde primera salida (cap 1 día)
    let consumoHistorico = 0;
    if (p.salidas_total_historicas > 0 && p.primera_salida) {
      const diasDesdePrimera = Math.max(
        (Date.now() - new Date(p.primera_salida as string).getTime()) /
          (24 * 60 * 60 * 1000),
        1,
      );
      consumoHistorico = p.salidas_total_historicas / diasDesdePrimera;
    }

    // Consumo efectivo: actividad reciente o fallback al histórico
    const consumoEfectivo =
      consumoPeriodo > 0 ? consumoPeriodo : consumoHistorico;

    const diasStock = consumoEfectivo > 0 ? p.stock / consumoEfectivo : null;
    const stockMin = p.stock_minimo || 0;
    const sinPrecio = p.es_vendible && (p.precio == null || p.precio === 0);

    let estado: ProductoAnotado["estado"] = "OK";
    if (p.stock <= 0) estado = "AGOTADO";
    else if (stockMin > 0 && p.stock < stockMin) estado = "BAJO_MIN";
    else if (diasStock !== null && diasStock < 7) estado = "CRITICO";
    else if (diasStock !== null && diasStock < 14) estado = "BAJO";
    else if (p.movimientos_periodo === 0 && p.salidas_total_historicas === 0)
      estado = "SIN_MOVIMIENTO";

    let diasSinMovimiento: number | null = null;
    if (p.ultimo_movimiento) {
      const diff =
        Date.now() - new Date(p.ultimo_movimiento as string).getTime();
      diasSinMovimiento = Math.floor(diff / (24 * 60 * 60 * 1000));
    }

    return {
      id: p.id,
      nombre: p.nombre,
      unidad: p.unidad,
      es_vendible: p.es_vendible,
      es_componente: p.es_componente,
      es_producible: p.es_producible,
      stock: p.stock,
      stock_minimo: p.stock_minimo,
      precio: p.precio,
      costo: p.costo,
      valor_inventario: p.stock * p.costo,
      valor_venta: p.stock * p.precio,
      salidas_total_historicas: p.salidas_total_historicas,
      movimientos_periodo: p.movimientos_periodo,
      consumo_diario: consumoEfectivo,
      consumo_diario_periodo: consumoPeriodo,
      consumo_diario_historico: consumoHistorico,
      dias_stock: diasStock,
      dias_sin_movimiento: diasSinMovimiento,
      estado,
      sin_precio: sinPrecio,
    };
  });

  const stockBajo = productosAnotados.filter(
    (p) =>
      p.estado === "AGOTADO" ||
      p.estado === "CRITICO" ||
      p.estado === "BAJO_MIN" ||
      p.estado === "BAJO",
  );
  const sinMovimiento = productosAnotados.filter(
    (p) => p.estado === "SIN_MOVIMIENTO" && p.stock > 0,
  );
  const sinPrecio = productosAnotados.filter(
    (p) => p.sin_precio && p.stock > 0,
  );

  const valorTotalInventario = productosAnotados.reduce(
    (sum, p) => sum + (p.valor_inventario || 0),
    0,
  );
  const valorTotalVenta = productosAnotados.reduce(
    (sum, p) => sum + (p.valor_venta || 0),
    0,
  );
  const inversionParalizada = sinMovimiento.reduce(
    (sum, p) => sum + (p.valor_inventario || 0),
    0,
  );
  const topPorValor = [...productosAnotados]
    .sort((a, b) => b.valor_inventario - a.valor_inventario)
    .slice(0, 10);

  return {
    inventario: productosAnotados,
    stockBajo,
    sinMovimiento,
    sinPrecio,
    topPorValor,
    totalProductos: productosAnotados.length,
    productosVendibles: productosAnotados.filter((p) => p.es_vendible).length,
    productosComponentes: productosAnotados.filter((p) => p.es_componente)
      .length,
    valorTotalInventario,
    valorTotalVenta,
    totalInversionParalizada: inversionParalizada,
    diasAnalisis: dias,
    desde: desdeISO,
    hasta: hastaISO,
    alertasCount: stockBajo.length + sinMovimiento.length + sinPrecio.length,
  };
}

// ───────────────────────── PRODUCCIÓN ─────────────────────────

export type OrdenResumen = {
  id: string;
  fecha: string | Date;
  producto_nombre: string;
  cantidad: number | null;
  costo_unitario: number | null;
  costo_total: number | null;
  merma_registrada?: number | null;
  porcentaje_merma?: number | null;
  estado: string | null;
};

export type ProduccionPorProducto = {
  id: string;
  nombre: string;
  es_vendible: boolean;
  costo_promedio: number | null;
  precio_venta: number;
  ordenes_producidas: number;
  cantidad_total: number | null;
  inversion_total: number | null;
  merma_total: number;
  margen_absoluto: number;
  margen_porcentaje: number | null;
  es_critico: boolean;
  es_bajo: boolean;
};

export type AnalisisProduccion = {
  ordenesPendientes: OrdenResumen[];
  produccionesRecientes: OrdenResumen[];
  produccionPorProducto: ProduccionPorProducto[];
  mermaRegistrada: OrdenResumen[];
  totalMerma: number;
  totalOrdenesPeriodo: number;
  inversionTotalPeriodo: number;
  costosAltos: ProduccionPorProducto[];
  diasAnalisis: number;
  desde: string;
  hasta: string;
  alertasCount: number;
};

// Costo real de una orden confirmada: el asiento production_in del kardex
const COSTO_ORDEN = sql`
  LEFT JOIN LATERAL (
    SELECT (m.unit_cost_base_cents::float / 100) AS costo_unitario,
           (ABS(m.qty)::float * m.unit_cost_base_cents::float / 100) AS costo_total
    FROM inventory_movements m
    WHERE m.org_id = o.org_id AND m.source_type = 'production_in'
      AND m.source_id = o.id
    LIMIT 1
  ) c ON true
`;

export async function analisisProduccion(
  db: Db,
  orgId: string,
  rango: Rango = {},
): Promise<AnalisisProduccion> {
  const { desdeISO, hastaISO, dias } = resolverRango({
    ...rango,
    diasDefault: 90,
  });

  // Órdenes pendientes (borradores). El ERP guarda el costo planificado en la
  // orden; el Cloud no lo persiste → se estima al promedio vigente de cada
  // insumo + mano de obra/indirectos ya anotados.
  const ordenesPendientes = await q<OrdenResumen>(
    db,
    sql`
      SELECT o.id, o.created_at AS fecha, p.name AS producto_nombre,
        o.produced_qty::float AS cantidad,
        NULL::float AS costo_unitario,
        (COALESCE(est.insumos, 0)
          + (o.labor_cost_base_cents + o.overhead_base_cents)::float / 100
        ) AS costo_total,
        o.status AS estado
      FROM production_orders o
      JOIN products p ON p.id = o.product_id
      LEFT JOIN LATERAL (
        SELECT SUM(pi.planned_qty::float * COALESCE(c.avg_cents, 0) / 100) AS insumos
        FROM production_inputs pi
        LEFT JOIN LATERAL (
          SELECT m.balance_avg_cost_base_cents::float AS avg_cents
          FROM inventory_movements m
          WHERE m.org_id = o.org_id AND m.product_id = pi.product_id
          ORDER BY m.seq DESC LIMIT 1
        ) c ON true
        WHERE pi.order_id = o.id
      ) est ON true
      WHERE o.org_id = ${orgId} AND o.status = 'draft'
      ORDER BY o.created_at ASC
      LIMIT 20
    `,
  );

  const produccionesRecientes = await q<OrdenResumen>(
    db,
    sql`
      SELECT o.id, o.created_at AS fecha, p.name AS producto_nombre,
        o.produced_qty::float AS cantidad,
        c.costo_unitario, c.costo_total,
        o.waste_qty::float AS merma_registrada,
        o.status AS estado
      FROM production_orders o
      JOIN products p ON p.id = o.product_id
      ${COSTO_ORDEN}
      WHERE o.org_id = ${orgId} AND o.status <> 'cancelled'
        AND o.created_at >= ${desdeISO}::timestamptz
      ORDER BY o.created_at DESC
      LIMIT 20
    `,
  );

  const mermaRegistrada = await q<OrdenResumen>(
    db,
    sql`
      SELECT o.id, o.created_at AS fecha, p.name AS producto_nombre,
        o.produced_qty::float AS cantidad,
        o.waste_qty::float AS merma_registrada,
        ROUND((o.waste_qty / NULLIF(o.produced_qty, 0) * 100)::numeric, 2)::float
          AS porcentaje_merma,
        o.status AS estado
      FROM production_orders o
      JOIN products p ON p.id = o.product_id
      WHERE o.org_id = ${orgId} AND o.status <> 'cancelled'
        AND o.waste_qty > 0 AND o.created_at >= ${desdeISO}::timestamptz
      ORDER BY o.created_at DESC
      LIMIT 20
    `,
  );

  type PorProductoRow = Omit<
    ProduccionPorProducto,
    "margen_absoluto" | "margen_porcentaje" | "es_critico" | "es_bajo"
  >;
  const produccionPorProducto: ProduccionPorProducto[] = (
    await q<PorProductoRow>(
      db,
      sql`
        SELECT p.id, p.name AS nombre, p.is_sellable AS es_vendible,
          AVG(c.costo_unitario) AS costo_promedio,
          (p.price_cents::float / 100) AS precio_venta,
          COUNT(*)::int AS ordenes_producidas,
          SUM(o.produced_qty)::float AS cantidad_total,
          SUM(c.costo_total)::float AS inversion_total,
          COALESCE(SUM(COALESCE(o.waste_qty, 0)), 0)::float AS merma_total
        FROM production_orders o
        JOIN products p ON p.id = o.product_id
        ${COSTO_ORDEN}
        WHERE o.org_id = ${orgId} AND o.status <> 'cancelled'
          AND o.created_at >= ${desdeISO}::timestamptz
        GROUP BY p.id, p.name, p.is_sellable, p.price_cents
        ORDER BY ordenes_producidas DESC, cantidad_total DESC
      `,
    )
  ).map((row) => {
    const precio = row.precio_venta || 0;
    // Igual que el ERP: precio - null coerce a precio (JS); AVG ignora NULLs
    const margen = precio - (row.costo_promedio as number);
    const margenPct = precio > 0 ? (margen / precio) * 100 : null;
    // Solo los VENDIBLES disparan alerta de margen (los intermedios tienen
    // precio nominal y generan falsos positivos).
    const esVendible = !!row.es_vendible;
    return {
      ...row,
      margen_absoluto: margen,
      margen_porcentaje: margenPct,
      es_critico: esVendible && (margenPct === null || margenPct < 10),
      es_bajo:
        esVendible && margenPct !== null && margenPct >= 10 && margenPct < 25,
    };
  });

  const costosAltos = produccionPorProducto.filter((p) => p.es_critico);
  const totalMerma = mermaRegistrada.reduce(
    (sum, m) => sum + (m.merma_registrada || 0),
    0,
  );
  const totalOrdenesPeriodo = produccionesRecientes.length;
  const inversionTotalPeriodo = produccionPorProducto.reduce(
    (sum, p) => sum + (p.inversion_total || 0),
    0,
  );

  return {
    ordenesPendientes,
    produccionesRecientes,
    produccionPorProducto,
    mermaRegistrada,
    totalMerma,
    totalOrdenesPeriodo,
    inversionTotalPeriodo,
    costosAltos,
    diasAnalisis: dias,
    desde: desdeISO,
    hasta: hastaISO,
    alertasCount:
      ordenesPendientes.length +
      (mermaRegistrada.length > 0 ? 1 : 0) +
      costosAltos.length,
  };
}

// ───────────────────────── EMPLEADOS ─────────────────────────

export type EmpleadoProductividad = {
  id: string;
  nombre: string;
  salario: number;
  cargo: string | null;
  ordenes_totales: number;
  horas_totales: number;
  salario_devengado: number;
  unidades_producidas: number;
  dias_registrados: number;
  costo_hora_promedio: number;
  unidades_por_hora: number | null;
  ordenes_por_hora: number | null;
  merma_total: number;
  defectos_total: number;
};

export type EmpleadoEficiencia = EmpleadoProductividad & {
  costo_por_unidad: number;
  costo_por_orden: number;
  aprovechamiento_salario: number | null;
  cumple_meta: boolean;
};

export type AnalisisEmpleados = {
  productividad: EmpleadoProductividad[];
  bajoRendimiento: EmpleadoProductividad[];
  costoEficiencia: EmpleadoEficiencia[];
  produccionPromedio: number;
  promedioUnidades: number;
  diasAnalisis: number;
  desde: string;
  hasta: string;
  alertasCount: number;
};

export async function analisisEmpleados(
  db: Db,
  orgId: string,
  rango: Rango = {},
): Promise<AnalisisEmpleados> {
  const { desdeISO, hastaISO, dias } = resolverRango({
    ...rango,
    diasDefault: 90,
  });

  const productividad = await q<EmpleadoProductividad>(
    db,
    sql`
      SELECT
        e.id,
        e.name AS nombre,
        (e.salary_cents::float / 100) AS salario,
        e.role AS cargo,
        COALESCE(prod.ordenes, 0)::int AS ordenes_totales,
        COALESCE(prod.horas, 0)::float AS horas_totales,
        COALESCE(prod.devengado, 0)::float AS salario_devengado,
        COALESCE(prod.unidades, 0)::float AS unidades_producidas,
        COALESCE(prod.dias_trabajados, 0)::int AS dias_registrados,
        COALESCE(prod.costo_hora_promedio, 0)::float AS costo_hora_promedio,
        ROUND((COALESCE(prod.unidades, 0) /
          NULLIF(COALESCE(prod.horas, 0), 0))::numeric, 2)::float AS unidades_por_hora,
        ROUND((COALESCE(prod.ordenes, 0) /
          NULLIF(COALESCE(prod.horas, 0), 0))::numeric, 2)::float AS ordenes_por_hora,
        COALESCE(eval_data.merma_total, 0)::float AS merma_total,
        COALESCE(eval_data.defectos_total, 0)::int AS defectos_total
      FROM employees e
      LEFT JOIN (
        SELECT
          pl.employee_id,
          COUNT(DISTINCT pl.order_id) AS ordenes,
          SUM(pl.hours) AS horas,
          -- Devengado = horas*costo_hora (el ERP no confía en subtotales)
          SUM(pl.hours * pl.cost_hour_cents::float / 100) AS devengado,
          SUM(COALESCE(o.produced_qty, 0) - COALESCE(o.waste_qty, 0)) AS unidades,
          COUNT(DISTINCT o.created_at::date) AS dias_trabajados,
          AVG(pl.cost_hour_cents::float / 100) AS costo_hora_promedio
        FROM production_labor pl
        JOIN production_orders o ON pl.order_id = o.id
        WHERE o.org_id = ${orgId} AND o.created_at >= ${desdeISO}::timestamptz
        GROUP BY pl.employee_id
      ) prod ON e.id = prod.employee_id
      LEFT JOIN (
        SELECT
          employee_id,
          SUM(waste_produced) AS merma_total,
          SUM(defects) AS defectos_total
        FROM employee_day_evaluations
        WHERE org_id = ${orgId} AND date >= ${desdeISO}::timestamptz::date
        GROUP BY employee_id
      ) eval_data ON e.id = eval_data.employee_id
      WHERE e.org_id = ${orgId} AND e.deleted_at IS NULL
      ORDER BY ordenes_totales DESC, horas_totales DESC
    `,
  );

  // Solo personal de PRODUCCIÓN con actividad real (los roles no productivos
  // generan falsos positivos — p.ej. el director).
  const ROLES_NO_PRODUCTIVOS = /admin|vigilante|portero|seren|chofer|limpieza/i;
  const conActividad = productividad.filter(
    (e) => e.horas_totales > 0 && !ROLES_NO_PRODUCTIVOS.test(e.cargo || ""),
  );

  const promedioOrdenes =
    conActividad.reduce((s, e) => s + e.ordenes_totales, 0) /
    Math.max(conActividad.length, 1);
  const promedioUnidades =
    conActividad.reduce((s, e) => s + e.unidades_producidas, 0) /
    Math.max(conActividad.length, 1);

  // Producción por día trabajado: normaliza a quien trabajó menos días
  const ordenesPorDia = (e: EmpleadoProductividad) =>
    e.dias_registrados > 0 ? e.ordenes_totales / e.dias_registrados : 0;
  const promedioOrdenesDia =
    conActividad.reduce((s, e) => s + ordenesPorDia(e), 0) /
    Math.max(conActividad.length, 1);

  // Bajo rendimiento: <70% del promedio con muestra mínima de 8 días
  const MIN_DIAS_MUESTRA = 8;
  const bajoRendimiento = conActividad.filter(
    (e) =>
      e.dias_registrados >= MIN_DIAS_MUESTRA &&
      ordenesPorDia(e) < promedioOrdenesDia * 0.7,
  );

  const costoEficiencia: EmpleadoEficiencia[] = conActividad
    .map((e) => {
      const salarioFijo = e.salario || 0;
      const devengado = e.salario_devengado || 0;
      const costoPorUnidad =
        e.unidades_producidas > 0 ? devengado / e.unidades_producidas : 0;
      const costoPorOrden =
        e.ordenes_totales > 0 ? devengado / e.ordenes_totales : 0;
      const aprovechamiento =
        salarioFijo > 0 ? (devengado / salarioFijo) * 100 : null;
      return {
        ...e,
        costo_por_unidad: costoPorUnidad,
        costo_por_orden: costoPorOrden,
        aprovechamiento_salario: aprovechamiento,
        cumple_meta: (e.ordenes_por_hora ?? 0) >= 2,
      };
    })
    .sort((a, b) => b.unidades_producidas - a.unidades_producidas);

  return {
    productividad,
    bajoRendimiento,
    costoEficiencia,
    produccionPromedio: Math.round(promedioOrdenes),
    promedioUnidades: Math.round(promedioUnidades),
    diasAnalisis: dias,
    desde: desdeISO,
    hasta: hastaISO,
    alertasCount: bajoRendimiento.length,
  };
}

// ───────────────────────── PRECIOS ─────────────────────────

export type MargenProducto = {
  id: string;
  nombre: string;
  precio: number;
  costo: number;
  margen_absoluto: number;
  margen_porcentaje: number;
  stock: number;
  inversion_total: number;
};

export type AnalisisPrecios = {
  margenBajo: MargenProducto[];
  oportunidadAumento: MargenProducto[];
  topMargenes: MargenProducto[];
  promedioMargen: number;
  alertasCount: number;
};

/** Analiza precios y márgenes (no depende de rango — estado actual). */
export async function analisisPrecios(
  db: Db,
  orgId: string,
): Promise<AnalisisPrecios> {
  type Row = {
    id: string;
    nombre: string;
    precio: number;
    costo: number;
    stock: number;
  };
  const margenes: MargenProducto[] = (
    await q<Row>(
      db,
      sql`
        SELECT p.id, p.name AS nombre,
          (p.price_cents::float / 100) AS precio,
          (COALESCE(b.costo_cents, 0)::float / 100) AS costo,
          COALESCE(b.stock, 0)::float AS stock
        FROM products p
        LEFT JOIN LATERAL (
          SELECT m.balance_qty::float AS stock,
                 m.balance_avg_cost_base_cents AS costo_cents
          FROM inventory_movements m
          WHERE m.org_id = p.org_id AND m.product_id = p.id
          ORDER BY m.seq DESC LIMIT 1
        ) b ON true
        WHERE p.org_id = ${orgId} AND p.deleted_at IS NULL
          AND p.is_sellable = true AND p.price_cents > 0
      `,
    )
  )
    .map((p) => ({
      ...p,
      margen_absoluto: p.precio - p.costo,
      margen_porcentaje: round2(((p.precio - p.costo) / p.precio) * 100),
      inversion_total: p.stock * p.precio,
    }))
    .sort((a, b) => a.margen_porcentaje - b.margen_porcentaje);

  const margenBajo = margenes.filter((p) => {
    const margen = p.margen_porcentaje || 0;
    return margen < 15 && p.stock > 0;
  });
  const oportunidadAumento = margenes.filter((p) => {
    const margen = p.margen_porcentaje || 0;
    return margen > 15 && margen < 25 && p.stock > 5;
  });
  const topMargenes = margenes
    .filter((p) => p.stock > 0)
    .sort((a, b) => (b.margen_porcentaje || 0) - (a.margen_porcentaje || 0))
    .slice(0, 5);

  return {
    margenBajo,
    oportunidadAumento,
    topMargenes,
    promedioMargen: Math.round(
      margenes.reduce((sum, p) => sum + (p.margen_porcentaje || 0), 0) /
        margenes.length,
    ),
    alertasCount: margenBajo.length,
  };
}

// ───────────────────── FRACCIONAMIENTO BPA ─────────────────────

export type Fraccionador = {
  cliente: string;
  dias: Array<{ dia: string; ops: number; total: number; tarjetas: number }>;
  totalOps: number;
  totalMonto: number;
  maxDiaOps: number;
  maxDiaTotal: number;
};

/**
 * Detecta clientes que FRACCIONAN pagos para esquivar el límite diario de
 * transferencias BPA (~$2500/día): 2+ transferencias CR el MISMO día de la
 * misma persona (union-find por nombre o tarjeta compartidos).
 */
export async function detectarFraccionamientoTransferencias(
  db: Db,
  orgId: string,
  rango: Rango = {},
): Promise<Fraccionador[]> {
  const { desdeISO, hastaISO } = resolverRango({ ...rango, diasDefault: 90 });

  type Mov = {
    cliente: string | null;
    dia: string;
    importe: number;
    tarjeta: string | null;
  };
  const movs = await q<Mov>(
    db,
    sql`
      SELECT TRIM(sm.client_name) AS cliente,
        to_char(sm.fecha_iso, 'YYYY-MM-DD') AS dia,
        sm.importe::float AS importe,
        TRIM(sm.pan_origen) AS tarjeta
      FROM statement_movements sm
      WHERE sm.org_id = ${orgId}
        AND sm.operacion = 'CR'
        AND sm.fecha_iso IS NOT NULL
        AND ((sm.client_name IS NOT NULL AND TRIM(sm.client_name) <> '')
          OR (sm.pan_origen IS NOT NULL AND TRIM(sm.pan_origen) <> ''))
        AND sm.fecha_iso >= ${desdeISO}::timestamptz::date
        AND sm.fecha_iso <= ${hastaISO}::timestamptz::date
      ORDER BY sm.created_at ASC, sm.position ASC
    `,
  );

  // Agrupar por día; dentro de cada día, unir por nombre O tarjeta (union-find)
  const porDia = new Map<string, Mov[]>();
  for (const m of movs) {
    if (!porDia.has(m.dia)) porDia.set(m.dia, []);
    porDia.get(m.dia)!.push(m);
  }

  const porEntidad = new Map<string, Fraccionador>();
  for (const [dia, lista] of porDia) {
    const parent = lista.map((_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const union = (a: number, b: number) => {
      parent[find(a)] = find(b);
    };
    const porNombre = new Map<string, number>();
    const porTarjeta = new Map<string, number>();
    lista.forEach((m, i) => {
      const n = m.cliente || "";
      const t = m.tarjeta || "";
      if (n) {
        if (porNombre.has(n)) union(i, porNombre.get(n)!);
        else porNombre.set(n, i);
      }
      if (t) {
        if (porTarjeta.has(t)) union(i, porTarjeta.get(t)!);
        else porTarjeta.set(t, i);
      }
    });
    const clusters = new Map<number, Mov[]>();
    lista.forEach((m, i) => {
      const r = find(i);
      if (!clusters.has(r)) clusters.set(r, []);
      clusters.get(r)!.push(m);
    });
    for (const grupo of clusters.values()) {
      if (grupo.length < 2) continue; // 2+ transferencias el mismo día
      // nombre representativo: el más frecuente no vacío; si no, la tarjeta
      const cuentaNombre = new Map<string, number>();
      for (const x of grupo) {
        const n = (x.cliente || "").trim();
        if (n) cuentaNombre.set(n, (cuentaNombre.get(n) || 0) + 1);
      }
      let nombre = cuentaNombre.size
        ? [...cuentaNombre.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : "";
      const tarjeta = (grupo.find((x) => x.tarjeta) || {}).tarjeta || "";
      if (!nombre)
        nombre = tarjeta
          ? `Tarjeta …${tarjeta.slice(-4)}`
          : "Cliente sin nombre";
      const total = round2(
        grupo.reduce((s, x) => s + (Number(x.importe) || 0), 0),
      );
      const tarjetas = new Set(grupo.map((x) => x.tarjeta).filter(Boolean))
        .size;
      // identidad entre días: la tarjeta si existe; si no, el nombre
      const ent = tarjeta ? `T:${tarjeta}` : `N:${nombre}`;
      const cur: Fraccionador = porEntidad.get(ent) || {
        cliente: nombre,
        dias: [],
        totalOps: 0,
        totalMonto: 0,
        maxDiaOps: 0,
        maxDiaTotal: 0,
      };
      // si teníamos un nombre genérico de tarjeta y ahora hay uno real, úsalo
      if (
        cur.cliente.startsWith("Tarjeta") &&
        nombre &&
        !nombre.startsWith("Tarjeta")
      )
        cur.cliente = nombre;
      cur.dias.push({ dia, ops: grupo.length, total, tarjetas });
      cur.totalOps += grupo.length;
      cur.totalMonto = round2(cur.totalMonto + total);
      if (grupo.length > cur.maxDiaOps) cur.maxDiaOps = grupo.length;
      if (total > cur.maxDiaTotal) cur.maxDiaTotal = total;
      porEntidad.set(ent, cur);
    }
  }
  return Array.from(porEntidad.values()).sort(
    (a, b) => b.dias.length - a.dias.length || b.maxDiaTotal - a.maxDiaTotal,
  );
}

// ───────────────────── RECOMENDACIONES ─────────────────────

export type Recomendacion = {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: "inventario" | "produccion" | "empleados" | "precios" | "clientes";
  impacto: "Alto" | "Medio" | "Bajo";
  accion: string;
  score: number;
  urgencia: number;
  posicion?: number;
};

/**
 * Genera recomendaciones ordenadas por urgencia. Siempre dinámicas desde el
 * estado actual de la base — no se almacenan ni cachean (el asistente
 * "aprende" con cada nuevo dato).
 */
export async function generarRecomendaciones(
  db: Db,
  orgId: string,
  rango: Rango = {},
): Promise<Recomendacion[]> {
  const [inventario, produccion, empleados, precios] = await Promise.all([
    analisisInventario(db, orgId, rango),
    analisisProduccion(db, orgId, rango),
    analisisEmpleados(db, orgId, rango),
    analisisPrecios(db, orgId),
  ]);

  const recomendaciones: Recomendacion[] = [];

  // INVENTARIO
  if (inventario.stockBajo.length > 0) {
    inventario.stockBajo.forEach((p) => {
      const consumo = p.consumo_diario || 0.1;
      const diasStock =
        p.dias_stock !== null ? p.dias_stock : p.stock / consumo;
      const score = diasStock < 7 ? 9 : diasStock < 14 ? 8 : 7;
      recomendaciones.push({
        id: `inv_${p.id}`,
        titulo: `Stock bajo: ${p.nombre}`,
        descripcion: `Quedan ${p.stock} unidades (${diasStock.toFixed(1)} días de consumo)`,
        categoria: "inventario",
        impacto: "Alto",
        accion: `Ordenar al menos ${Math.ceil(consumo * 30)} unidades`,
        score,
        urgencia: score,
      });
    });
  }

  if (inventario.sinMovimiento.length > 0) {
    inventario.sinMovimiento.slice(0, 3).forEach((p) => {
      recomendaciones.push({
        id: `inv_obsoleto_${p.id}`,
        titulo: `Producto obsoleto: ${p.nombre}`,
        descripcion: `${p.stock} unidades sin movimiento (inversión: $${p.valor_inventario?.toFixed(2)})`,
        categoria: "inventario",
        impacto: "Medio",
        accion: "Revisar viabilidad de venta, descuento o donación",
        score: 6,
        urgencia: 5,
      });
    });
  }

  // PRODUCCIÓN
  if (produccion.ordenesPendientes.length > 0) {
    recomendaciones.push({
      id: "prod_pendientes",
      titulo: `${produccion.ordenesPendientes.length} órdenes pendientes`,
      descripcion: `Costo total pendiente: $${produccion.ordenesPendientes
        .reduce((sum, o) => sum + (o.costo_total || 0), 0)
        .toFixed(2)}`,
      categoria: "produccion",
      impacto: "Alto",
      accion: "Revisar cuello de botella y asignar recursos",
      score: 9,
      urgencia: 9,
    });
  }

  if (produccion.totalMerma > 0) {
    recomendaciones.push({
      id: "prod_merma",
      titulo: `Merma detectada: ${produccion.totalMerma.toFixed(2)} unidades`,
      descripcion: `Últimos 30 días: ${produccion.mermaRegistrada.length} registros`,
      categoria: "produccion",
      impacto: "Medio",
      accion: "Investigar causas de merma y mejorar procesos",
      score: 7,
      urgencia: 7,
    });
  }

  if (produccion.costosAltos.length > 0) {
    produccion.costosAltos.forEach((p) => {
      const margenNegativo = (p.costo_promedio as number) > p.precio_venta;
      recomendaciones.push({
        id: `prod_costo_${p.id}`,
        titulo: `Costo ${margenNegativo ? "superior" : "cercano"} al precio: ${p.nombre}`,
        descripcion: `Costo: $${p.costo_promedio?.toFixed(2)} vs Precio: $${p.precio_venta?.toFixed(2)}`,
        categoria: "produccion",
        impacto: margenNegativo ? "Alto" : "Medio",
        accion: "Revisar proceso de producción o ajustar precio",
        score: margenNegativo ? 9 : 7,
        urgencia: margenNegativo ? 9 : 6,
      });
    });
  }

  // EMPLEADOS
  if (empleados.bajoRendimiento.length > 0) {
    empleados.bajoRendimiento.forEach((e) => {
      recomendaciones.push({
        id: `emp_rendimiento_${e.id}`,
        titulo: `Bajo rendimiento: ${e.nombre}`,
        descripcion: `${e.ordenes_totales} órdenes en 30 días (promedio: ${empleados.produccionPromedio})`,
        categoria: "empleados",
        impacto: "Medio",
        accion: "Capacitar, reasignar o ajustar metas",
        score: 6,
        urgencia: 6,
      });
    });
  }

  const sobrecargado = empleados.costoEficiencia.find(
    (e) => (e.ordenes_por_hora ?? 0) > 5,
  );
  if (sobrecargado) {
    recomendaciones.push({
      id: `emp_sobrecarga_${sobrecargado.id}`,
      titulo: `Empleado sobrecargado: ${sobrecargado.nombre}`,
      descripcion: `${sobrecargado.ordenes_por_hora} órdenes/hora (límite recomendado: 3)`,
      categoria: "empleados",
      impacto: "Medio",
      accion: "Distribuir carga de trabajo, prevenir burnout",
      score: 5,
      urgencia: 5,
    });
  }

  // PRECIOS
  if (precios.margenBajo.length > 0) {
    precios.margenBajo.slice(0, 3).forEach((p) => {
      recomendaciones.push({
        id: `precio_bajo_${p.id}`,
        titulo: `Margen bajo: ${p.nombre}`,
        descripcion: `${p.margen_porcentaje}% margen (inversión: $${p.inversion_total?.toFixed(2)})`,
        categoria: "precios",
        impacto: "Medio",
        accion: `Aumentar precio o revisar costo`,
        score: 6,
        urgencia: 5,
      });
    });
  }

  if (precios.oportunidadAumento.length > 0) {
    precios.oportunidadAumento.slice(0, 2).forEach((p) => {
      recomendaciones.push({
        id: `precio_suba_${p.id}`,
        titulo: `Oportunidad de aumento: ${p.nombre}`,
        descripcion: `Margen actual ${p.margen_porcentaje}% - Potencial: +5-10%`,
        categoria: "precios",
        impacto: "Bajo",
        accion: `Aumentar precio a $${(p.precio * 1.05).toFixed(2)}`,
        score: 4,
        urgencia: 2,
      });
    });
  }

  // RIESGO: clientes que fraccionan transferencias (tope BPA $2500/día)
  const fraccionadores = await detectarFraccionamientoTransferencias(
    db,
    orgId,
    rango,
  );
  if (fraccionadores.length > 0) {
    const fmt = (n: number) => "$" + Number(n || 0).toFixed(2);
    fraccionadores.slice(0, 6).forEach((c) => {
      const nDias = c.dias.length;
      const grave = c.maxDiaOps >= 3 || c.maxDiaTotal > 5000 || nDias >= 3;
      const diasResumen = c.dias
        .slice()
        .sort((a, b) => b.total - a.total)
        .slice(0, 4)
        .map((d) => `${d.dia}: ${d.ops} transf. = ${fmt(d.total)}`)
        .join(" · ");
      recomendaciones.push({
        id: `fracc_${c.cliente.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
        titulo: `Pagos fraccionados: ${c.cliente}`,
        descripcion: `${nDias} día(s) con 2+ transferencias el mismo día (compras repetidas; posible fraccionamiento para esquivar el tope BPA de $2500/día). ${diasResumen}${c.dias.length > 4 ? " · …" : ""}`,
        categoria: "clientes",
        impacto: grave ? "Alto" : "Medio",
        accion:
          "Cuando un cliente ya transfirió hoy, pedir otra forma de pago o registrar la compra a su nombre; revisar estos días con la dependienta para cortar la práctica.",
        score: grave ? 9 : 7,
        urgencia: grave ? 9 : 7,
      });
    });
  }

  return recomendaciones
    .sort((a, b) => b.score - a.score || b.urgencia - a.urgencia)
    .map((r, idx) => ({ ...r, posicion: idx + 1 }));
}

// ───────────────────────── KPIs ─────────────────────────

export type KPIs = {
  inventario: {
    stockBajoCount: number;
    productosObsoletos: number;
    inversionParalizada: number;
  };
  produccion: {
    ordenesPendientes: number;
    costoTotalPendiente: number;
    mermaTotal: number;
  };
  empleados: {
    totalEmpleados: number;
    produccionPromedio: number;
    empleadosBajoRendimiento: number;
  };
  precios: {
    margenPromedio: number;
    productosMargenBajo: number;
    oportunidadesAumento: number;
  };
  alertasTotal: number;
};

export async function obtenerKPIs(
  db: Db,
  orgId: string,
  rango: Rango = {},
): Promise<KPIs> {
  const [inventario, produccion, empleados, precios] = await Promise.all([
    analisisInventario(db, orgId, rango),
    analisisProduccion(db, orgId, rango),
    analisisEmpleados(db, orgId, rango),
    analisisPrecios(db, orgId),
  ]);

  return {
    inventario: {
      stockBajoCount: inventario.stockBajo.length,
      productosObsoletos: inventario.sinMovimiento.length,
      inversionParalizada: inventario.totalInversionParalizada,
    },
    produccion: {
      ordenesPendientes: produccion.ordenesPendientes.length,
      costoTotalPendiente: produccion.ordenesPendientes.reduce(
        (sum, o) => sum + (o.costo_total || 0),
        0,
      ),
      mermaTotal: produccion.totalMerma,
    },
    empleados: {
      totalEmpleados: empleados.productividad.length,
      produccionPromedio: empleados.produccionPromedio,
      empleadosBajoRendimiento: empleados.bajoRendimiento.length,
    },
    precios: {
      margenPromedio: precios.promedioMargen,
      productosMargenBajo: precios.margenBajo.length,
      oportunidadesAumento: precios.oportunidadAumento.length,
    },
    alertasTotal:
      inventario.alertasCount +
      produccion.alertasCount +
      empleados.alertasCount +
      precios.alertasCount,
  };
}

// ───────────────────────── TENDENCIAS ─────────────────────────

export type Tendencia = {
  mes: string;
  ventas_cantidad: number;
  ventas_total: number;
  produccion_ordenes: number;
  produccion_cantidad: number;
  produccion_costo: number;
  produccion_merma: number;
  empleados_ordenes: number;
  empleados_horas: number;
  empleados_activos: number;
};

/** Tendencias históricas de los últimos N meses (gaps rellenados). */
export async function tendencias(
  db: Db,
  orgId: string,
  meses = 6,
): Promise<Tendencia[]> {
  type VentaMes = { mes: string; cantidad: number; total: number };
  const ventas = await q<VentaMes>(
    db,
    sql`
      SELECT to_char(s.sold_at, 'YYYY-MM') AS mes,
        COUNT(*)::int AS cantidad,
        (COALESCE(SUM(s.total_base_cents), 0)::float / 100) AS total
      FROM sales s
      WHERE s.org_id = ${orgId} AND s.status = 'confirmed'
        AND s.sold_at >= now() - make_interval(months => ${meses})
      GROUP BY 1
      ORDER BY 1 ASC
    `,
  );

  type ProdMes = {
    mes: string;
    ordenes: number;
    cantidad_total: number;
    costo_total: number;
    merma_total: number;
  };
  const produccion = await q<ProdMes>(
    db,
    sql`
      SELECT to_char(o.created_at, 'YYYY-MM') AS mes,
        COUNT(*)::int AS ordenes,
        COALESCE(SUM(o.produced_qty), 0)::float AS cantidad_total,
        COALESCE(SUM(c.costo_total), 0)::float AS costo_total,
        COALESCE(SUM(o.waste_qty), 0)::float AS merma_total
      FROM production_orders o
      ${COSTO_ORDEN}
      WHERE o.org_id = ${orgId} AND o.status <> 'cancelled'
        AND o.created_at >= now() - make_interval(months => ${meses})
      GROUP BY 1
      ORDER BY 1 ASC
    `,
  );

  type EvalMes = {
    mes: string;
    ordenes_totales: number;
    horas_totales: number;
    merma_total: number;
    empleados_activos: number;
  };
  const productividad = await q<EvalMes>(
    db,
    sql`
      SELECT to_char(ev.date, 'YYYY-MM') AS mes,
        COALESCE(SUM(ev.orders_produced), 0)::int AS ordenes_totales,
        COALESCE(SUM(ev.hours_worked), 0)::float AS horas_totales,
        COALESCE(SUM(ev.waste_produced), 0)::float AS merma_total,
        COUNT(DISTINCT ev.employee_id)::int AS empleados_activos
      FROM employee_day_evaluations ev
      WHERE ev.org_id = ${orgId}
        AND ev.date >= (now() - make_interval(months => ${meses}))::date
      GROUP BY 1
      ORDER BY 1 ASC
    `,
  );

  // Lista de meses para rellenar gaps (igual que el ERP: meses locales)
  const mesesArr: string[] = [];
  const ahora = new Date();
  for (let i = meses - 1; i >= 0; i--) {
    const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    mesesArr.push(
      `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`,
    );
  }

  return mesesArr.map((mes) => {
    const v = ventas.find((x) => x.mes === mes) || { cantidad: 0, total: 0 };
    const p = produccion.find((x) => x.mes === mes) || {
      ordenes: 0,
      cantidad_total: 0,
      costo_total: 0,
      merma_total: 0,
    };
    const e = productividad.find((x) => x.mes === mes) || {
      ordenes_totales: 0,
      horas_totales: 0,
      merma_total: 0,
      empleados_activos: 0,
    };
    return {
      mes,
      ventas_cantidad: v.cantidad,
      ventas_total: v.total,
      produccion_ordenes: p.ordenes,
      produccion_cantidad: p.cantidad_total,
      produccion_costo: p.costo_total,
      produccion_merma: p.merma_total,
      empleados_ordenes: e.ordenes_totales,
      empleados_horas: e.horas_totales,
      empleados_activos: e.empleados_activos,
    };
  });
}
