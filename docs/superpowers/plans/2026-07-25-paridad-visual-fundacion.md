# Paridad visual con el ERP CubaOne — Fundación (fases 0–3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Daseo Cloud adopte por completo el sistema de diseño del ERP CubaOne —tokens, primitivas, chrome— de modo que las 48 pantallas cambien de aspecto sin editar lógica de negocio, dejando la base sobre la que después se clonan las 22 pantallas del ERP una a una.

**Architecture:** Cascada en tres capas. (1) Los valores de `:root`/`.dark` en `globals.css` se reemplazan por los del ERP; como los 98 `.tsx` de Cloud sólo consumen nombres semánticos de Tailwind, toda la app se repinta sin tocar componentes. (2) Los 5 primitivos actuales se sustituyen en sitio por ~20 portados del ERP, conservando nombre de archivo y superficie de importación. (3) La sidebar se extrae de `layout.tsx` a componente propio y se clona junto con el header. Nada de esto toca queries, server actions ni esquema.

**Tech Stack:** Next.js 16 (App Router, RSC) · React 19 · Tailwind v4 (`@theme inline`) · TypeScript · next-intl (ES/PT) · next-themes · Vitest · Playwright (Desktop Chrome + Pixel 7).

## Global Constraints

- **Fuente de verdad de todo valor visual: `C:\Mi Carpeta\Herramientas\Laika\daseo-erp\src\styles\index.css`.** El bloque `colors` de `tailwind.config.js` del ERP es configuración muerta (1.155 usos de `var(--color-surface*)` contra 1 de clase Tailwind) — **no se lee nunca**.
- **No se toca lógica de negocio.** Prohibido modificar `src/features/**/queries.ts`, `actions.ts`, `schemas.ts`, `src/db/**` y `drizzle/**`. Este plan es exclusivamente de presentación.
- **`"use client"` selectivo.** Sólo lo lleva un componente con interactividad real. Card, Badge, StatCard, PageHeader, EmptyState, SectionHeader, StatusDot y TableEmptyRow **se quedan como server components**.
- **Los componentes nunca declaran hex crudos.** Sólo la capa de tokens los declara; los componentes consumen `var(--…)` o clases Tailwind semánticas.
- **No se replican los bugs confirmados del ERP** (regla vigente de la maratón funcional de julio).
- **i18n intacto:** cada texto visible sale de `messages/es.json` / `messages/pt.json`. No se hardcodea copy.
- **Las capturas de referencia del ERP nunca se commitean** — contienen datos reales de clientes y el repo es público. Viven sólo en el scratchpad de sesión.
- **Suite verde en cada tarea:** `npm test` (268 unit) + `npm run typecheck` + `npm run build`. `npm run test:e2e` (34) al cierre de cada tarea que toque chrome o primitivas interactivas.
- **Rama:** `feat/paridad-visual-erp` (ya creada).

## Alcance de ESTE plan

Cubre las **fases 0–3** del spec: referencias, tokens, componentes y chrome. Es un entregable completo y verificable por sí solo: al terminarlo, la app entera se ve como el ERP y la suite sigue verde.

**La fase 4 (clonar las 22 pantallas en 5 lotes) recibe su propio plan por lote, escrito después de la Tarea 1.** Razón: las tareas de clonado se redactan cotejando la captura real de cada pantalla contra el componente que la va a renderizar. Escribirlas ahora, sin las capturas y sin saber qué primitivas quedaron disponibles, produciría pasos inventados — exactamente lo que este formato prohíbe.

**Diferidos conscientes de este plan**, porque su único consumidor está en la fase 4 y portarlos antes sería código sin uso:

| Componente | Llega con |
|---|---|
| `ui/charts/` (`CustomCartesianGrid`, `CustomTooltip`, `constants`) + ECharts | Lote 3 — Dashboard, Panel del Negocio |
| `forms/combobox.tsx` | Lote 1 — el selector de cliente de Ventas es su primer consumidor real |
| `forms/file-dropzone.tsx` | Lote 4 — la carga de PDF de Estados de Cuenta |
| `ui/pagination.tsx`, `ui/skeletons/` | Lote 1, cuando se sepa qué listas paginan de verdad |

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/app/globals.css` | **Modificar.** Única declaración de tokens y del lenguaje de interacción Linear |
| `src/app/[locale]/layout.tsx` | **Modificar.** Cambia las fuentes Geist por las tres del ERP |
| `src/components/ui/forms/{button,input,select,textarea,checkbox,switch}.tsx` | **Crear.** Primitivas de formulario |
| `src/components/ui/form-field.tsx` | **Crear.** Etiqueta + control + error, envoltorio de las anteriores |
| `src/components/ui/{card,badge,stat-card,kpi-strip}.tsx` | **Crear/Modificar.** Tarjetas y cifras |
| `src/components/ui/atoms/{section-header,status-dot,table-empty-row}.tsx` | **Crear.** Átomos presentacionales |
| `src/components/ui/data-table.tsx` | **Crear.** Piel de tabla; el filtrado sigue en servidor |
| `src/components/ui/modal.tsx`, `modal-portal.tsx` | **Crear.** Diálogo, que Cloud no tiene |
| `src/components/ui/feedback/{alert,confirm-dialog,empty-state,tooltip}.tsx` | **Crear.** Realimentación |
| `src/components/ui/layout/{page-layout,page-header}.tsx` | **Crear.** Marco común de página |
| `src/components/app-sidebar.tsx` | **Crear.** Extraída de `layout.tsx` y clonada |
| `src/components/app-header.tsx` | **Modificar.** De 65 líneas a la versión del ERP |
| `src/app/[locale]/(app)/layout.tsx` | **Modificar.** Adelgaza: deja de contener la sidebar |
| `src/components/ui/{button,card,input,label}.tsx` | **Eliminar** tras migrar sus consumidores |

---

### Task 1: Capturar las 22 pantallas de referencia del ERP

**Files:**
- Create: `<scratchpad>/erp-ref/` (fuera del repo — **no se commitea nada**)
- Create: `docs/superpowers/plans/2026-07-25-inventario-referencias.md` (índice sin imágenes)

**Interfaces:**
- Consumes: nada.
- Produces: `<scratchpad>/erp-ref/<pantalla>.png` para las 22 pantallas, e `inventario-referencias.md` con la tabla `pantalla ERP → ruta Cloud → nombre de archivo de captura`, que consumen todas las tareas posteriores y los planes de la fase 4.

- [x] **Step 1: Levantar el backend del ERP**

```bash
cd "C:/Mi Carpeta/Herramientas/Laika/daseo-erp"
npm run server
```

Espera `listening` / health en `http://localhost:3001/api/health`. Déjalo corriendo en segundo plano.

- [x] **Step 2: Levantar el frontend del ERP**

```bash
cd "C:/Mi Carpeta/Herramientas/Laika/daseo-erp"
npm run dev
```

Vite sirve en `http://localhost:5176`. **No se usa Electron**: el ERP es una app web dentro de Electron, y en navegador se ve igual.

- [x] **Step 3: Verificar que carga con datos**

Abre `http://localhost:5176` y confirma que el Dashboard muestra cifras (la BD `cubaone.db` tiene 8 MB de datos reales). Si pide login, usa las credenciales locales del ERP.

Si el frontend no arranca o la BD está vacía: **detente y repórtalo**. Sin referencias no se puede clonar, y adivinar el aspecto es exactamente lo que este trabajo evita.

- [x] **Step 4: Capturar las 22 pantallas**

Con las herramientas de navegador, captura a viewport 1440×900 cada una y guarda en el scratchpad:

| # | Pantalla ERP | Archivo |
|---|---|---|
| 1 | Dashboard (`/`) | `dashboard.png` |
| 2 | Ventas | `ventas.png` |
| 3 | Compras | `compras.png` |
| 4 | Inventario | `inventario.png` |
| 5 | Cuentas por Cobrar | `cxc.png` |
| 6 | Cuentas por Pagar | `cxp.png` |
| 7 | Producción | `produccion.png` |
| 8 | Kardex | `kardex.png` |
| 9 | Salidas Internas | `salidas-internas.png` |
| 10 | Trazabilidad | `trazabilidad.png` |
| 11 | Compromisos | `compromisos.png` |
| 12 | Panel del Negocio | `panel-negocio.png` |
| 13 | Top Clientes | `top-clientes.png` |
| 14 | Estados de Cuenta | `estados-cuenta.png` |
| 15 | Conciliación | `conciliacion.png` |
| 16 | Modelos Fiscales | `modelos-fiscales.png` |
| 17 | Vehículos | `vehiculos.png` |
| 18 | Configuración | `configuracion.png` |
| 19 | Catálogos | `catalogos.png` |
| 20 | Auditoría | `audit-logs.png` |
| 21 | Sorteos | `sorteos.png` |
| 22 | Login | `login.png` |

- [ ] **Step 5: Capturar los estados que no se ven en reposo** — ⚠️ BLOQUEADO: el banner de licencia del ERP intercepta los clics de todo el header (toggle de tema y colapso de sidebar inalcanzables). Reintentar cuando la licencia esté resuelta. NO bloquea las fases 1–3: los tokens de modo oscuro se portan de `index.css:599`.

Además de las 22, captura: un **modal abierto** (Nueva Venta), la **sidebar colapsada**, y una pantalla en **modo oscuro**. Son los tres estados que definen el sistema y no aparecen en ninguna captura de reposo.

Archivos: `estado-modal-nueva-venta.png`, `estado-sidebar-colapsada.png`, `estado-dark.png`.

- [x] **Step 6: Escribir el índice**

Crea `docs/superpowers/plans/2026-07-25-inventario-referencias.md` con la tabla anterior más la columna "ruta Cloud equivalente" (`/dashboard`, `/sales`, `/purchases`, `/products`, `/receivables`, `/payables`, `/production`, `/products/[id]`, `/internal-outflows`, `/products/[id]`, `/customers/[id]`, `/assistant`, `/top-clients`, `/statements`, `/reconciliation`, `/fiscal`, `/vehicles`, `/settings`, `/settings`, `/audit`, `/raffles`, `/login`).

**El documento no lleva imágenes**, sólo la tabla: las capturas se quedan en el scratchpad.

- [x] **Step 7: Verificar que no se coló ninguna captura al repo**

```bash
cd "C:/dev/crmventas" && git status --short && git check-ignore -v docs/superpowers/plans/*.png 2>/dev/null || echo "sin PNG en docs/"
```

Expected: ningún `.png` en la salida de `git status`.

- [x] **Step 8: Commit**

```bash
cd "C:/dev/crmventas"
git add docs/superpowers/plans/2026-07-25-inventario-referencias.md
git commit -m "docs: inventario de referencias visuales del ERP (22 pantallas + 3 estados)"
```

---

### Task 2: Capa de tokens

**Files:**
- Modify: `src/app/globals.css` (líneas 1–103: bloques `:root` y `.dark`)
- Modify: `src/app/globals.css` (bloque `@theme inline`, líneas 105–152)

**Interfaces:**
- Consumes: `<scratchpad>/erp-ref/ventas.png` de la Tarea 1 como referencia de verificación.
- Produces: los tokens semánticos existentes (`--background`, `--card`, `--border`, `--primary`, `--muted-foreground`, `--sidebar*`…) con valores del ERP, más los tokens nuevos `--surface-100`, `--surface-200`, `--surface-hover`, `--border-hover`, `--btn-*`, `--shadow-*`, `--chart-*`, y las escalas 50–900 de success/warning/danger/info. Todas las tareas siguientes los consumen.

- [ ] **Step 1: Reemplazar el bloque `:root` de tema claro**

En `src/app/globals.css`, sustituye el `:root` completo por:

```css
:root {
  --radius: 8px;

  /* ── Superficies — paleta neutra Linear (index.css:434) ── */
  --background: #FAFAFA;
  --foreground: #1A1A1F;
  --card: #FFFFFF;
  --card-foreground: #1A1A1F;
  --popover: #FFFFFF;
  --popover-foreground: #1A1A1F;
  --surface-100: #F4F4F5;
  --surface-200: #E9E9EB;
  --surface-hover: rgba(0, 0, 0, 0.03);

  /* ── Marca — navy primario ── */
  --primary: #1E3A5F;
  --primary-foreground: #FFFFFF;
  --primary-hover: #2B5D9B;
  --primary-active: #162B47;
  --primary-muted: rgba(30, 58, 95, 0.10);

  /* ── Acento — amber tostado ── */
  --secondary: #B45309;
  --secondary-foreground: #FFFFFF;

  --muted: #F4F4F5;
  --muted-foreground: #8B8D94;
  --accent: #E9E9EB;
  --accent-foreground: #1A1A1F;

  /* ── Semánticos (valor base = el "oscuro" del ERP, para texto sobre claro) ── */
  --destructive: #7F1D1D;
  --destructive-foreground: #FFFFFF;
  --success: #14532D;
  --success-foreground: #FFFFFF;
  --warning: #78350F;
  --warning-foreground: #FFFFFF;

  --border: #E1E1E3;
  --border-hover: #CDCDD1;
  --input: #E1E1E3;
  --ring: #2B5D9B;

  /* ── Botones (index.css:459) ── */
  --btn-primary-bg: #1E3A5F;
  --btn-primary-bg-hover: #2B5D9B;
  --btn-primary-bg-active: #162B47;
  --btn-danger-bg: #B91C1C;
  --btn-danger-bg-hover: #991B1B;
  --btn-danger-bg-active: #7F1D1D;
  --btn-success-bg: #15803D;
  --btn-success-bg-hover: #166534;
  --btn-success-bg-active: #14532D;
  --btn-warning-bg: #B45309;
  --btn-warning-bg-hover: #92400E;
  --btn-warning-bg-active: #78350F;
  --btn-inset-highlight: rgba(255, 255, 255, 0.08);

  /* ── Sidebar Linear: CLARA, no navy (index.css:475) ── */
  --sidebar: #F4F4F5;
  --sidebar-foreground: #1A1A1F;
  --sidebar-border: #E1E1E3;
  --sidebar-text-inactive: #5C5E66;
  --sidebar-text-active: #1A1A1F;
  --sidebar-active-bg: #E9E9EB;
  --sidebar-active-border: #1E3A5F;
  --sidebar-hover-bg: rgba(0, 0, 0, 0.04);
  --sidebar-section-label: #8B8D94;
  --sidebar-divider: #E9E9EB;

  /* ── Elevación ── */
  --shadow-xs: 0 1px 2px rgba(26, 29, 46, 0.04);
  --shadow-sm: 0 1px 3px rgba(26, 29, 46, 0.06), 0 1px 2px rgba(26, 29, 46, 0.04);
  --shadow-md: 0 4px 8px rgba(26, 29, 46, 0.06), 0 2px 4px rgba(26, 29, 46, 0.04);
  --shadow-lg: 0 8px 24px rgba(26, 29, 46, 0.08), 0 2px 8px rgba(26, 29, 46, 0.04);
  --shadow-xl: 0 20px 40px rgba(26, 29, 46, 0.10), 0 4px 12px rgba(26, 29, 46, 0.05);
  --shadow-float: 0 0 0 1px rgba(26, 29, 46, 0.06), 0 8px 24px rgba(26, 29, 46, 0.09);

  /* ── Gráficos: navy → amber → semánticos ── */
  --chart-1: #1E3A5F;
  --chart-2: #B45309;
  --chart-3: #15803D;
  --chart-4: #2B5D9B;
  --chart-5: #B91C1C;
  --chart-grid: #E1E1E3;
  --chart-axis-text: #8B8D94;
  --chart-tooltip-bg: #FFFFFF;
  --chart-tooltip-border: #E1E1E3;
  --chart-tooltip-text: #1A1A1F;

  /* ── Transiciones ── */
  --transition-fast: 100ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 250ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

- [ ] **Step 2: Reemplazar el bloque `.dark`**

Valores tomados de `html[data-theme="dark"]` (index.css:599). Nota que en oscuro el navy **se aclara** a `#5B8BD8` y el amber a `#B58A5C`, porque el navy original no contrasta sobre `#08090A`:

```css
.dark {
  --background: #08090A;
  --foreground: #E6E6E8;
  --card: #0F1011;
  --card-foreground: #E6E6E8;
  --popover: #0F1011;
  --popover-foreground: #E6E6E8;
  --surface-100: #18181B;
  --surface-200: #1F1F23;
  --surface-hover: rgba(255, 255, 255, 0.04);

  --primary: #5B8BD8;
  --primary-foreground: #08090A;
  --primary-hover: #76A0E1;
  --primary-active: #4575C4;
  --primary-muted: rgba(91, 139, 216, 0.14);

  --secondary: #B58A5C;
  --secondary-foreground: #08090A;

  --muted: #18181B;
  --muted-foreground: #6B6F76;
  --accent: #1F1F23;
  --accent-foreground: #E6E6E8;

  --destructive: #F87171;
  --destructive-foreground: #08090A;
  --success: #4ADE80;
  --success-foreground: #08090A;
  --warning: #FCD34D;
  --warning-foreground: #08090A;

  --border: #1F1F23;
  --border-hover: #2A2A2F;
  --input: #1F1F23;
  --ring: #76A0E1;

  --btn-primary-bg: #5B8BD8;
  --btn-primary-bg-hover: #76A0E1;
  --btn-primary-bg-active: #4575C4;
  --btn-danger-bg: #EF4444;
  --btn-danger-bg-hover: #F87171;
  --btn-danger-bg-active: #991B1B;
  --btn-success-bg: #22C55E;
  --btn-success-bg-hover: #4ADE80;
  --btn-success-bg-active: #166534;
  --btn-warning-bg: #F59E0B;
  --btn-warning-bg-hover: #FBBF24;
  --btn-warning-bg-active: #92400E;

  --sidebar: #0F1011;
  --sidebar-foreground: #E6E6E8;
  --sidebar-border: #1F1F23;
  --sidebar-text-inactive: #9CA0A8;
  --sidebar-text-active: #E6E6E8;
  --sidebar-active-bg: #18181B;
  --sidebar-active-border: #5B8BD8;
  --sidebar-hover-bg: rgba(255, 255, 255, 0.04);
  --sidebar-section-label: #6B6F76;
  --sidebar-divider: #1F1F23;

  --chart-1: #5B8BD8;
  --chart-2: #F59E0B;
  --chart-3: #22C55E;
  --chart-4: #76A0E1;
  --chart-5: #EF4444;
  --chart-grid: #1F1F23;
  --chart-axis-text: #6B6F76;
  --chart-tooltip-bg: #0F1011;
  --chart-tooltip-border: #1F1F23;
  --chart-tooltip-text: #E6E6E8;
}
```

- [ ] **Step 3: Exponer los tokens nuevos a Tailwind**

En el bloque `@theme inline`, **añade** (sin borrar los existentes) al final, antes de los `--radius-*`:

```css
  --color-surface-100: var(--surface-100);
  --color-surface-200: var(--surface-200);
  --color-surface-hover: var(--surface-hover);
  --color-border-hover: var(--border-hover);
  --color-sidebar-active-bg: var(--sidebar-active-bg);
  --color-sidebar-active-border: var(--sidebar-active-border);
  --color-sidebar-section-label: var(--sidebar-section-label);
  --color-chart-grid: var(--chart-grid);
  --color-chart-axis-text: var(--chart-axis-text);
```

Y **sustituye** el bloque de radios por la escala del ERP:

```css
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 20px;
```

- [ ] **Step 4: Verificar que compila y la suite no se movió**

```bash
cd "C:/dev/crmventas" && npm run typecheck && npm test && npm run build
```

Expected: typecheck limpio, 268 tests PASS, build OK. **Si algún test falla, este paso rompió algo que no debía** — los tokens no tocan lógica.

- [ ] **Step 5: Verificación visual contra la referencia**

```bash
cd "C:/dev/crmventas" && npm run dev
```

Abre `/sales` y compáralo con `<scratchpad>/erp-ref/ventas.png`. **Sin haber tocado un solo componente**, fondo, tarjetas, bordes y color de marca deben coincidir con el ERP. La disposición NO coincidirá todavía — eso es la fase 4.

Si el fondo sigue teal o crema, el `@theme inline` no está leyendo los valores nuevos: revisa que los nombres de `:root` coincidan exactamente con los que el puente referencia.

- [ ] **Step 6: Medir contraste del texto atenuado**

`--muted-foreground: #8B8D94` sobre `--background: #FAFAFA` da ≈2.8:1, por debajo de 4.5:1. Busca sus usos:

```bash
cd "C:/dev/crmventas" && grep -rn "text-muted-foreground" --include=*.tsx src/ | wc -l
```

Revisa que ninguno sea **texto esencial** (valores de datos, mensajes de error, etiquetas de formulario). Si lo es, ese uso concreto pasa a `text-foreground` o `--color-text-secondary` (`#5C5E66`, ≈6.9:1). Anota en el commit cuántos usos se reclasificaron.

- [ ] **Step 7: Commit**

```bash
cd "C:/dev/crmventas"
git add src/app/globals.css
git commit -m "feat(visual): portar la capa de tokens del ERP (piel Linear)"
```

---

### Task 3: Tipografía y lenguaje de interacción

**Files:**
- Modify: `src/app/[locale]/layout.tsx` (declaración de fuentes)
- Modify: `src/app/globals.css` (bloque `@layer base`)

**Interfaces:**
- Consumes: los tokens de la Tarea 2.
- Produces: `--font-sans`, `--font-display`, `--font-mono` con los stacks del ERP; las utilidades `.t-display`, `.t-mono`, `.t-eyebrow`, `.t-label`, `.t-num`, `.t-num-display`; y las reglas globales de foco, scrollbar y selección. Las tareas 4–10 usan `.t-eyebrow`/`.t-num` en cabeceras y cifras.

- [ ] **Step 1: Cambiar las fuentes**

En `src/app/[locale]/layout.tsx`, sustituye los imports de Geist por las tres del ERP:

```tsx
import { Inter, Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});
```

Y en el `<html>`, reemplaza las variables de Geist por `${inter.variable} ${bricolage.variable} ${plexMono.variable}`.

- [ ] **Step 2: Apuntar los tokens de fuente**

En `globals.css`, dentro de `@theme inline`, sustituye las dos líneas de fuente por:

```css
  --font-sans: var(--font-inter), "Segoe UI", system-ui, sans-serif;
  --font-display: var(--font-bricolage), var(--font-inter), sans-serif;
  --font-mono: var(--font-plex-mono), ui-monospace, monospace;
```

- [ ] **Step 3: Añadir las utilidades tipográficas del ERP**

Al final de `globals.css`, copiadas de `index.css:74-127`:

```css
@layer components {
  .t-display {
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .t-mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .t-eyebrow {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted-foreground);
  }
  .t-label {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted-foreground);
  }
  .t-num {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }
  .t-num-display {
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: -0.025em;
    font-variant-numeric: tabular-nums;
  }
}
```

- [ ] **Step 4: Añadir el lenguaje de interacción Linear**

Al bloque `@layer base` de `globals.css`, copiado de `index.css:132-160`. **Esto es lo que hace que "se sienta" como el ERP**: hovers planos, foco fino, scrollbars delgadas.

```css
@layer base {
  ::selection {
    background: var(--primary-muted);
    color: inherit;
  }

  ::-webkit-scrollbar {
    width: 5px;
    height: 5px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 999px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: var(--muted-foreground);
  }

  :focus-visible {
    outline: 2px solid var(--primary-hover);
    outline-offset: 1px;
    border-radius: 4px;
  }
}
```

- [ ] **Step 5: Verificar**

```bash
cd "C:/dev/crmventas" && npm run typecheck && npm test && npm run build
```

Expected: todo verde. Si el build se queja de una fuente, es que el nombre del import de `next/font/google` no coincide — `Bricolage_Grotesque` lleva guion bajo.

- [ ] **Step 6: Verificar el peso de la landing**

Éste es el riesgo #2 del spec: no engordar `/`.

```bash
cd "C:/dev/crmventas" && npm run build
```

Busca en la salida el tamaño de la ruta `/`. **Debe bajar o quedar igual** respecto a antes: se fueron dos fuentes Geist y entraron tres de Google, pero `next/font` las auto-hospeda y sólo carga las usadas. Si sube por encima de 175 KB de scripts, la landing rompe el gate de Lighthouse — repórtalo antes de seguir.

- [ ] **Step 7: Commit**

```bash
cd "C:/dev/crmventas"
git add src/app/globals.css "src/app/[locale]/layout.tsx"
git commit -m "feat(visual): tipografia y lenguaje de interaccion Linear del ERP"
```

---

### Task 4: Primitivas de formulario

**Files:**
- Create: `src/components/ui/forms/button.tsx`, `input.tsx`, `select.tsx`, `textarea.tsx`, `checkbox.tsx`, `switch.tsx`
- Create: `src/components/ui/forms/index.ts`
- Create: `src/components/ui/form-field.tsx`
- Reference: `<ERP>/src/components/ui/forms/*.tsx` y `<ERP>/src/components/FormField.tsx` (108 líneas)

**Interfaces:**
- Consumes: tokens de la Tarea 2, utilidades de la Tarea 3.
- Produces:
  - `Button({ variant?: "primary" | "secondary" | "danger" | "success" | "warning" | "ghost", size?: "sm" | "md" | "lg", ...ButtonHTMLAttributes })` — server component salvo que reciba `onClick`.
  - `Input`, `Textarea`, `Select` — `forwardRef`, aceptan todos los atributos nativos.
  - `Checkbox`, `Switch` — client components.
  - `FormField({ label: string, htmlFor: string, error?: string, hint?: string, required?: boolean, children: ReactNode })`.
  - Todos reexportados desde `src/components/ui/forms/index.ts`.

- [ ] **Step 1: Leer los originales del ERP**

```bash
cd "C:/Mi Carpeta/Herramientas/Laika/daseo-erp"
cat src/components/ui/forms/Button.tsx src/components/ui/forms/Input.tsx src/components/ui/forms/Select.tsx src/components/FormField.tsx
```

Anota qué variantes y tamaños existen realmente. **No inventes variantes que el ERP no tiene** — y no omitas las que tiene.

- [ ] **Step 2: Portar `Button`**

Copia el marcado y las clases literalmente; adapta sólo las costuras. Estructura esperada:

```tsx
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "success" | "warning" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--btn-primary-bg)] text-white hover:bg-[var(--btn-primary-bg-hover)] active:bg-[var(--btn-primary-bg-active)] active:scale-[0.99]",
  // …resto según el original del ERP
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-5 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium",
        "transition-colors duration-100 disabled:pointer-events-none disabled:opacity-50",
        "shadow-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
```

**Sin `"use client"`**: un `<button>` con `type="submit"` dentro de un form de server action no necesita cliente. Los tamaños exactos (`h-8/9/10`, paddings) salen del original, no de este esqueleto.

- [ ] **Step 3: Portar el resto de primitivas**

`Input`, `Textarea`, `Select` con `forwardRef` y sin `"use client"`. `Checkbox` y `Switch` **sí** llevan `"use client"` (manejan estado visual). `FormField` es server component.

- [ ] **Step 4: Crear el barril**

```ts
// src/components/ui/forms/index.ts
export { Button } from "./button";
export { Input } from "./input";
export { Select } from "./select";
export { Textarea } from "./textarea";
export { Checkbox } from "./checkbox";
export { Switch } from "./switch";
```

- [ ] **Step 5: Migrar los consumidores del botón viejo**

```bash
cd "C:/dev/crmventas" && grep -rln "from \"@/components/ui/button\"" --include=*.tsx src/ | wc -l
```

Reapunta cada import a `@/components/ui/forms`. Si alguna llamada usa una variante que el botón viejo tenía y el del ERP no (p. ej. `variant="outline"`), mapéala a la más cercana del ERP y **anótalo en el commit**; no inventes una variante nueva.

- [ ] **Step 6: Borrar los primitivos viejos ya migrados**

```bash
cd "C:/dev/crmventas" && rm src/components/ui/button.tsx src/components/ui/input.tsx src/components/ui/label.tsx
```

`card.tsx` se borra en la Tarea 5, `sonner.tsx` se conserva.

- [ ] **Step 7: Verificar**

```bash
cd "C:/dev/crmventas" && npm run typecheck && npm test && npm run build && npm run test:e2e
```

Expected: typecheck limpio (los imports rotos aparecen aquí), 268 unit PASS, **34 E2E PASS**. Los E2E hacen clic en botones por texto y rol: si un botón portado cambió su rol accesible, se cae aquí.

- [ ] **Step 8: Commit**

```bash
cd "C:/dev/crmventas"
git add src/components/ui/
git commit -m "feat(visual): portar primitivas de formulario del ERP"
```

---

### Task 5: Tarjetas, badges y cifras

**Files:**
- Create: `src/components/ui/card.tsx` (reemplaza el actual), `badge.tsx`, `stat-card.tsx`, `kpi-strip.tsx`
- Create: `src/components/ui/atoms/section-header.tsx`, `status-dot.tsx`, `table-empty-row.tsx`, `density-toggle.tsx`
- Reference: `<ERP>/src/components/{Card,Badge,StatCard}.tsx`, `<ERP>/src/components/ui/KpiStrip.tsx`, `<ERP>/src/components/ui/atoms/*`
- Reference: `<scratchpad>/erp-ref/ventas.jpg` (la barra de herramientas con el DensityToggle)

**Interfaces:**
- Consumes: tokens (T2), utilidades tipográficas (T3), `cn` de `@/lib/utils`.
- Produces:
  - `Card({ hoverable?: boolean, elevated?: boolean, className?, children })` + `CardHeader`, `CardTitle`, `CardContent`, `CardFooter` — **misma superficie que el `card.tsx` actual de Cloud**, para no romper sus consumidores.
  - `Badge({ tone: "neutral" | "primary" | "success" | "warning" | "danger" | "info", children })`.
  - `StatCard({ label: string, value: string, hint?: string, tone?, icon?: ReactNode })`.
  - `KpiStrip({ items: Array<{ label: string; value: string; tone? }> })`.
  - `SectionHeader({ eyebrow?: string, title: string, action?: ReactNode })`, `StatusDot({ tone })`, `TableEmptyRow({ colSpan: number, message: string })`.
  - `DensityToggle({ value: "compacta" | "comoda" | "espaciosa", onChange })` — **client component**, el único de esta tarea.
- El resto son **server components**, sin `"use client"`.

> **Añadido tras la Tarea 1.** El `DensityToggle` no estaba en el inventario original: la captura de
> referencia lo reveló en la barra de herramientas de **7 pantallas** (Ventas, CxC, CxP, Compras,
> Inventario, Producción, Auditoría) con las opciones literales `Compacta · Cómoda · Espaciosa`.
> Controla la altura de fila de la tabla, así que su valor lo consume `DataTable` (T6) vía prop
> `density`. Es la clase de brecha que la fase 0 existía para encontrar.

- [ ] **Step 1: Leer los originales**

```bash
cd "C:/Mi Carpeta/Herramientas/Laika/daseo-erp"
cat src/components/Card.tsx src/components/Badge.tsx src/components/StatCard.tsx src/components/ui/KpiStrip.tsx
```

- [ ] **Step 2: Comprobar la superficie del `Card` actual de Cloud**

```bash
cd "C:/dev/crmventas" && cat src/components/ui/card.tsx && grep -rn "CardHeader\|CardTitle\|CardContent\|CardFooter\|CardDescription" --include=*.tsx src/ | wc -l
```

El `Card` nuevo **debe exportar los mismos sub-componentes que ya se usan**. Si el del ERP no tiene `CardDescription` y Cloud lo usa, se añade como envoltorio con la tipografía del ERP — no se rompen los consumidores.

- [ ] **Step 3: Portar `Card`**

Aplicando el hover Linear (sólo `border-color` y fondo, sin `transform` ni sombra grande):

```tsx
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Card({
  hoverable = false,
  elevated = false,
  className,
  children,
}: {
  hoverable?: boolean;
  elevated?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground",
        elevated ? "shadow-[var(--shadow-md)]" : "shadow-[var(--shadow-xs)]",
        hoverable &&
          "transition-colors duration-150 hover:border-border-hover hover:bg-surface-hover",
        className,
      )}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Portar `Badge`**

El mapa de tonos se deriva de los tokens de la Tarea 2; los `-muted` son fondos al 10 % de opacidad:

```tsx
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const TONES = {
  neutral: "bg-surface-100 text-foreground",
  primary: "bg-[var(--primary-muted)] text-primary",
  success: "bg-[#DCFCE7] text-[#14532D]",
  warning: "bg-[#FEF3C7] text-[#78350F]",
  danger: "bg-[#FEE2E2] text-[#7F1D1D]",
  info: "bg-[#DBEAFE] text-[#1E3A5F]",
} as const;

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
```

Los pares fondo/texto salen de las escalas `50`/`800` del ERP (`index.css:363-415`) y están medidos por encima de 7:1 — no comprometen el gate de accesibilidad. **En modo oscuro estos hex fijos no funcionan**: añade en el mismo archivo un `dark:` por tono usando las escalas `900`/`300` (p. ej. `dark:bg-[#052E16] dark:text-[#4ADE80]` para success).

- [ ] **Step 5: Portar `StatCard`, `KpiStrip` y los tres átomos**

`StatCard` y `KpiStrip` usan `.t-num-display` para la cifra y `.t-eyebrow` para la etiqueta — es la firma visual del ERP. Léelos del original antes de escribirlos; las medidas exactas (altura de tarjeta, separación entre KPIs) no se inventan.

- [ ] **Step 6: Verificar**

```bash
cd "C:/dev/crmventas" && npm run typecheck && npm test && npm run build && npm run test:e2e
```

Expected: todo verde, 34 E2E PASS.

- [ ] **Step 7: Commit**

```bash
cd "C:/dev/crmventas"
git add src/components/ui/
git commit -m "feat(visual): portar tarjetas, badges, StatCard y KpiStrip del ERP"
```

---

### Task 6: DataTable (piel del ERP, filtrado en servidor)

**Files:**
- Create: `src/components/ui/data-table.tsx`
- Reference: `<ERP>/src/components/ui/DataTable.tsx` (487 líneas)

**Interfaces:**
- Consumes: `TableEmptyRow` y `DensityToggle` (T5), tokens (T2).
- Produces: `DataTable({ children, density?: "compacta" | "comoda" | "espaciosa", className? })`, `THead`, `TRow`, `TH({ align?, numeric? })`, `TD({ align?, numeric? })` — **primitivas de presentación puras**, server components, sin estado.

`density` sólo cambia el padding vertical de las celdas (`py-1` / `py-2` / `py-3`); el valor por defecto
es `"comoda"`, que es el que el ERP trae seleccionado. Quién es dueño del estado (searchParams o
`localStorage`) se decide en el lote 1, con la pantalla de Ventas delante.

**Excepción documentada del spec:** el `DataTable` del ERP trae orden, filtrado y paginación en cliente. **No se porta esa parte.** Varias listas de Cloud (Ventas, Compras, Estados de Cuenta) ya resuelven eso en servidor con `searchParams` — es mejor, ya está testeado, y visualmente es indistinguible. Se porta **sólo la piel**.

- [ ] **Step 1: Extraer únicamente los estilos de tabla del original**

```bash
cd "C:/Mi Carpeta/Herramientas/Laika/daseo-erp"
grep -n "className\|style=\|<th\|<td\|<thead\|<tr" src/components/ui/DataTable.tsx | head -60
```

Interesan: fondo de `thead` (`--surface-100`), borde inferior de fila, alineación derecha de columnas numéricas, altura de fila, padding de celda, hover de fila.

- [ ] **Step 2: Escribir las primitivas**

```tsx
import { cn } from "@/lib/utils";
import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

export function DataTable({ children, className }: { children: ReactNode; className?: string }) {
  // overflow-x-auto es obligatorio: sin él los clics tactiles se rompen a 375px
  // (gotcha documentado en F4)
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className={cn("w-full border-collapse text-sm", className)}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-surface-100">{children}</thead>;
}

export function TRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr className={cn("border-b border-border transition-colors hover:bg-surface-hover", className)}>
      {children}
    </tr>
  );
}

export function TH({
  numeric,
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        "t-label px-3 py-2 text-left font-medium",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  numeric,
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td className={cn("px-3 py-2", numeric && "t-num text-right", className)} {...props} />
  );
}
```

- [ ] **Step 3: Verificar**

```bash
cd "C:/dev/crmventas" && npm run typecheck && npm test && npm run build
```

Expected: verde. Aún no hay consumidores — se conectan en la fase 4.

- [ ] **Step 4: Commit**

```bash
cd "C:/dev/crmventas"
git add src/components/ui/data-table.tsx
git commit -m "feat(visual): primitivas de tabla con la piel del ERP"
```

---

### Task 7: Modal y realimentación

**Files:**
- Create: `src/components/ui/modal.tsx`, `modal-portal.tsx`
- Create: `src/components/ui/feedback/alert.tsx`, `confirm-dialog.tsx`, `empty-state.tsx`, `tooltip.tsx`
- Reference: `<ERP>/src/components/{Modal,ModalPortal}.tsx` (400 + 24 líneas), `<ERP>/src/components/ui/feedback/*`

**Interfaces:**
- Consumes: `Button` (T4), tokens (T2).
- Produces:
  - `Modal({ open: boolean, onClose: () => void, title: string, size?: "sm" | "md" | "lg" | "xl", children, footer? })` — **client component**.
  - `ConfirmDialog({ open, onConfirm, onCancel, title, message, confirmLabel, tone? })` — client.
  - `Alert({ tone, title?, children })`, `EmptyState({ icon?, title, message, action? })` — **server components**.
  - `Tooltip({ content, children })` — client.

- [ ] **Step 1: Leer los originales**

```bash
cd "C:/Mi Carpeta/Herramientas/Laika/daseo-erp" && cat src/components/Modal.tsx src/components/ModalPortal.tsx
```

Anota: anchos por tamaño, cierre con Escape, clic en backdrop, bloqueo de scroll del body, trampa de foco.

- [ ] **Step 2: Portar `ModalPortal`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

export function ModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
```

**Ojo con el lint de React 19:** `setState` en effect está prohibido en general, pero este caso (detección de montaje, sin dependencias) es el patrón aceptado. Si el lint se queja, usa el `useSyncExternalStore` que ya se aplicó en `theme-provider.tsx`:

```tsx
const mounted = useSyncExternalStore(
  () => () => {},
  () => true,
  () => false,
);
```

- [ ] **Step 3: Portar `Modal`**

Responsive según el spec: **a pantalla completa bajo 1024px**, centrado con ancho fijo por encima.

```tsx
"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { ModalPortal } from "./modal-portal";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const SIZES = {
  sm: "lg:max-w-md",
  md: "lg:max-w-xl",
  lg: "lg:max-w-3xl",
  xl: "lg:max-w-5xl",
} as const;

export function Modal({
  open,
  onClose,
  title,
  size = "md",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: keyof typeof SIZES;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 lg:items-center"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex h-full w-full flex-col bg-card shadow-[var(--shadow-xl)]",
            "lg:h-auto lg:max-h-[85vh] lg:rounded-lg",
            SIZES[size],
          )}
        >
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="t-display text-base">{title}</h2>
            <button onClick={onClose} aria-label="Cerrar" className="rounded p-1 hover:bg-surface-hover">
              <X className="size-4" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <footer className="border-t border-border px-5 py-3">{footer}</footer>
          ) : null}
        </div>
      </div>
    </ModalPortal>
  );
}
```

**El `aria-label` de cerrar debe salir de i18n**, no hardcodeado — sustitúyelo por `t("common.close")` y añade la clave a `messages/es.json` y `messages/pt.json`.

- [ ] **Step 4: Portar `Alert`, `EmptyState`, `ConfirmDialog`, `Tooltip`**

Enlaces a tokens ya definidos, para que no haya que decidirlos sobre la marcha:

- `Alert` — mismo mapa de tonos que `Badge` (T5 paso 4), más borde izquierdo de 3px del color del tono e icono de `lucide-react`. **Server component.**
- `EmptyState` — centrado, icono en `--muted-foreground` a 32px, título con `.t-display`, mensaje en `text-sm text-muted-foreground`, acción opcional con `Button variant="primary" size="sm"`. **Server component.**
- `ConfirmDialog` — envuelve `Modal size="sm"`; el botón de confirmar usa `variant="danger"` cuando `tone === "danger"`, `primary` en el resto. **Client.**
- `Tooltip` — posicionamiento con CSS puro (`group` + `group-hover`), fondo `--popover`, borde `--border`, sombra `--shadow-md`, `.t-label` para el texto. **Sin librería de posicionamiento**: el ERP tampoco usa una, y añadir Floating UI metería peso en cada ruta.

- [ ] **Step 5: Verificar**

```bash
cd "C:/dev/crmventas" && npm run typecheck && npm test && npm run build && npm run test:e2e
```

Expected: todo verde. **Aún no hay ningún modal montado en una pantalla** — se conectan en la fase 4. Esta tarea sólo deja la pieza disponible.

- [ ] **Step 6: Commit**

```bash
cd "C:/dev/crmventas"
git add src/components/ui/ messages/
git commit -m "feat(visual): portar Modal y componentes de realimentacion del ERP"
```

---

### Task 8: Marco de página

**Files:**
- Create: `src/components/ui/layout/page-layout.tsx`, `page-header.tsx`
- Reference: `<ERP>/src/components/layout/PageLayout.tsx` (439 líneas), `<ERP>/src/components/common/PageHeader.tsx` (90)

**Interfaces:**
- Consumes: `SectionHeader` (T5), `Button` (T4), tokens (T2).
- Produces:
  - `PageHeader({ eyebrow?: string, title: string, subtitle?: string, actions?: ReactNode })` — server component.
  - `PageLayout({ header: ReactNode, aside?: ReactNode, children })` — server component. `aside` es el panel lateral que usan Ventas, Compras, Estados de Cuenta y Top Clientes; a partir de 1280px va a la derecha, por debajo se apila.

- [ ] **Step 1: Leer los originales y quedarse con lo estructural**

```bash
cd "C:/Mi Carpeta/Herramientas/Laika/daseo-erp"
grep -n "className\|grid\|flex\|max-w" src/components/layout/PageLayout.tsx | head -40
```

Las 439 líneas incluyen lógica de la SPA (transiciones de ruta, breadcrumbs de react-router) que **no aplica**: Next resuelve navegación y layout. Se porta la **rejilla y el espaciado**, no la maquinaria.

- [ ] **Step 2: Escribir `PageHeader`**

```tsx
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow ? <p className="t-eyebrow mb-1">{eyebrow}</p> : null}
        <h1 className="t-display text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
```

- [ ] **Step 3: Escribir `PageLayout`**

```tsx
import type { ReactNode } from "react";

export function PageLayout({
  header,
  aside,
  children,
}: {
  header: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 lg:px-6">
      {header}
      {aside ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
          <div className="min-w-0">{children}</div>
          <aside className="min-w-0">{aside}</aside>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
```

`min-w-0` es obligatorio en ambas columnas: sin él, una tabla ancha desborda la rejilla y provoca scroll horizontal en toda la página.

- [ ] **Step 4: Verificar**

```bash
cd "C:/dev/crmventas" && npm run typecheck && npm test && npm run build
```

- [ ] **Step 5: Commit**

```bash
cd "C:/dev/crmventas"
git add src/components/ui/layout/
git commit -m "feat(visual): marco de pagina (PageLayout, PageHeader) del ERP"
```

---

### Task 9: Sidebar

**Files:**
- Create: `src/components/app-sidebar.tsx`
- Modify: `src/app/[locale]/(app)/layout.tsx` (extraer la sidebar, dejar `requireOrg` + gate + header)
- Reference: `<ERP>/src/components/Sidebar.tsx` (725 líneas)
- Reference: `<scratchpad>/erp-ref/estado-sidebar-colapsada.png`

**Interfaces:**
- Consumes: tokens `--sidebar-*` (T2), `Tooltip` (T7).
- Produces: `AppSidebar({ sections, orgName, logoUrl? })` donde `sections: Array<{ label: string; items: Array<{ href: string; label: string; icon: ReactNode; badge?: number }> }>`. **El `icon` llega ya renderizado como `ReactNode`** — nunca como componente.

> ⚠️ **El bug que tumbó 28 de 32 E2E el 24-jul:** pasar un componente de `lucide-react` como prop desde un Server Component a un Client Component rompe toda la app en runtime ("Functions cannot be passed directly to Client Components"). El layout debe renderizar `icon: <Icon className="size-4" aria-hidden />` **antes** de pasarlo.

- [ ] **Step 1: Leer el original y el layout actual**

```bash
cd "C:/Mi Carpeta/Herramientas/Laika/daseo-erp" && sed -n '400,725p' src/components/Sidebar.tsx
cd "C:/dev/crmventas" && cat "src/app/[locale]/(app)/layout.tsx"
```

- [ ] **Step 2: Extraer la sidebar actual a su propio archivo, sin cambiar aspecto**

Mueve el marcado de la sidebar de `layout.tsx` a `src/components/app-sidebar.tsx` **tal como está hoy**, con la misma lista de secciones y enlaces. El layout la importa y la renderiza.

- [ ] **Step 3: Verificar que la extracción no rompió nada**

```bash
cd "C:/dev/crmventas" && npm run typecheck && npm run build && npm run test:e2e
```

Expected: **34 E2E PASS**. Este paso es refactor puro: si algo se cae, es la extracción, no el clonado. Arréglalo antes de seguir — no acumules dos causas de fallo.

- [ ] **Step 4: Commit del refactor por separado**

```bash
cd "C:/dev/crmventas"
git add "src/app/[locale]/(app)/layout.tsx" src/components/app-sidebar.tsx
git commit -m "refactor: extraer la sidebar de (app)/layout.tsx a componente propio"
```

- [ ] **Step 5: Aplicar la piel del ERP**

Sidebar **clara** (`bg-sidebar` = `#F4F4F5`), borde derecho `--sidebar-border`, títulos de sección con `.t-label` en `--sidebar-section-label`, item activo con fondo `--sidebar-active-bg` y **borde izquierdo de 2px** en `--sidebar-active-border`, inactivos en `--sidebar-text-inactive`, hover `--sidebar-hover-bg`.

- [ ] **Step 6: Añadir colapsar/expandir**

Client component con persistencia:

```tsx
"use client";

const [collapsed, setCollapsed] = useState<boolean>(() => {
  if (typeof window === "undefined") return false;
  try {
    return JSON.parse(window.localStorage.getItem("sidebarCollapsed") ?? "false");
  } catch {
    window.localStorage.removeItem("sidebarCollapsed");
    return false;
  }
});

useEffect(() => {
  window.localStorage.setItem("sidebarCollapsed", JSON.stringify(collapsed));
}, [collapsed]);
```

Colapsada: sólo iconos, ancho reducido, y **`Tooltip` con la etiqueta** (T7). Expandida: icono + etiqueta.

El `useState` con inicializador perezoso leyendo `localStorage` provoca un desajuste de hidratación si el valor guardado difiere del servidor. Resuélvelo igual que en `theme-provider.tsx`: renderiza el estado expandido hasta que `mounted` sea cierto.

- [ ] **Step 7: Añadir el cajón móvil**

Bajo 1024px: la sidebar sale del flujo, se abre sobre un backdrop y se cierra al navegar. **El colapso de escritorio y el cajón móvil son dos estados del mismo componente.**

**Dónde vive el estado del cajón** (lo consume la Tarea 10): el layout `(app)` es un Server Component y no puede sostener `useState`. Crea `src/components/app-shell.tsx` como client component que envuelve sidebar + header, es dueño de `const [drawerOpen, setDrawerOpen] = useState(false)` y lo pasa a ambos. El layout renderiza `<AppShell sidebar={...} header={...}>{children}</AppShell>` pasando **elementos ya renderizados**, no componentes — misma regla del aviso de iconos.

- [ ] **Step 8: Cablear los badges a rutas reales**

El ERP muestra un contador por sección. Se portan **apuntando a las rutas reales de Cloud** — el propio ERP documenta que uno de sus tres paths ya no coincide con ninguna ruta; **ese bug no se replica**. Reutiliza `lowStockProducts` y `cobrosResumen`, que el header ya consulta: sin queries nuevas.

- [ ] **Step 9: Verificar**

```bash
cd "C:/dev/crmventas" && npm run typecheck && npm test && npm run build && npm run test:e2e
```

Expected: **34 E2E PASS**. Aquí es donde más frágiles son: cada test navega usando la sidebar. Si fallan varios a la vez con un error de runtime, revisa el paso de iconos Server→Client del aviso de arriba.

Compara con `<scratchpad>/erp-ref/estado-sidebar-colapsada.png`.

- [ ] **Step 10: Commit**

```bash
cd "C:/dev/crmventas"
git add src/components/app-sidebar.tsx "src/app/[locale]/(app)/layout.tsx" messages/
git commit -m "feat(visual): clonar la sidebar del ERP (piel Linear, colapso, cajon movil)"
```

---

### Task 10: Header

**Files:**
- Modify: `src/components/app-header.tsx` (65 líneas → versión del ERP)
- Modify: `src/app/[locale]/(app)/layout.tsx` (mover aquí el `ThemeSwitcher` y el selector de idioma)
- Reference: `<ERP>/src/components/Header.tsx` (358), `<ERP>/src/components/{CobranzasIndicator,ExchangeRatesWidget,UserMenuDropdown,ThemeSwitcher}.tsx`

**Interfaces:**
- Consumes: `AppShell` (T9 paso 7) como dueño del estado del cajón, `Tooltip` (T7), `Badge` (T5).
- Produces: `AppHeader({ lowStockCount, receivableTotal, orgName, userEmail, onToggleDrawer })` — client component; `onToggleDrawer` lo inyecta `AppShell`.

- [ ] **Step 1: Leer el original y el actual**

```bash
cd "C:/Mi Carpeta/Herramientas/Laika/daseo-erp" && cat src/components/Header.tsx
cd "C:/dev/crmventas" && cat src/components/app-header.tsx
```

- [ ] **Step 2: Portar los elementos que entran**

Campanita de stock bajo, indicador "Te deben $X", **menú de usuario con avatar**, **widget de tasas**, **selector de tema** y selector de idioma. Los dos últimos **se mueven aquí desde la sidebar y `/settings`** — deja de haberlos en dos sitios.

**Fuera de alcance (§2 del spec):** pastilla de fecha de trabajo y botón de respaldo a carpeta.

- [ ] **Step 3: Añadir el botón hamburguesa**

Visible sólo bajo 1024px; alterna el cajón de la Tarea 9.

- [ ] **Step 4: Verificar que el selector de idioma no rompió los E2E**

Gotcha documentado en M9: el `LocaleSwitcher` se convirtió en el primer `combobox` de la página y rompió selectores `.first()` de los E2E. Al moverlo al header **vuelve a cambiar el orden de los combobox en cada pantalla**.

```bash
cd "C:/dev/crmventas" && npm run test:e2e
```

Si algún test falla por seleccionar el combobox equivocado, arréglalo apuntando por `aria-label` o por etiqueta — **no** con `.first()`.

- [ ] **Step 5: Verificar todo**

```bash
cd "C:/dev/crmventas" && npm run typecheck && npm test && npm run build && npm run test:e2e
```

Expected: 268 unit PASS, 34 E2E PASS.

- [ ] **Step 6: Commit**

```bash
cd "C:/dev/crmventas"
git add src/components/app-header.tsx "src/app/[locale]/(app)/layout.tsx" messages/
git commit -m "feat(visual): clonar el header del ERP (usuario, tasas, tema, idioma)"
```

---

### Task 11: Cierre de la fundación

**Files:**
- Modify: `ESTADO.md` (local, gitignored)
- Reference: todas las anteriores

**Interfaces:**
- Consumes: todo.
- Produces: fundación verificada y desplegada; punto de partida de los planes de la fase 4.

- [ ] **Step 1: Suite completa**

```bash
cd "C:/dev/crmventas" && npm run typecheck && npm run lint && npm run format:check && npm test && npm run build && npm run test:e2e
```

Expected: 268 unit PASS, 34 E2E PASS, sin errores de lint ni formato.

- [ ] **Step 2: Lighthouse local sobre la landing**

```bash
cd "C:/dev/crmventas" && npx lhci autorun
```

Expected: performance ≥0.85, **accessibility ≥0.95**, CLS <0.1, scripts ≤175 000 B. El de accesibilidad es el que puede caer por el contraste del texto atenuado (paso 6 de la Tarea 2). Si cae, el informe dice exactamente qué elemento.

- [ ] **Step 3: Revisión visual de las pantallas heredadas (fase 5 del spec)**

Recorre a 1440px y a 412px las pantallas que **no** se van a clonar: `/quotes`, `/pipeline`, `/recipes`, `/suppliers`, `/employees`, `/admin`, `/signup`, `/onboarding`, `/invite`, `/banking`, y la landing `/`. Ninguna debe tener restos de la piel vieja (teal, bordes redondeados de 0.5rem, Geist) ni contraste roto en oscuro.

Anota lo que encuentres; los arreglos van en esta misma tarea.

- [ ] **Step 4: Push y CI**

```bash
cd "C:/dev/crmventas" && git push -u origin feat/paridad-visual-erp
```

Espera el run de GitHub Actions. **No se mergea a `master` con el CI en rojo.**

- [ ] **Step 5: Actualizar `ESTADO.md`**

Añade una sección "PARIDAD VISUAL — FUNDACIÓN (fases 0–3)" con: qué se portó, el hallazgo de la piel Linear vs la editorial legacy y la medición que lo decidió (1.155 vs 1), la reversión de la decisión del 24-jul sobre el colapso de la sidebar, los gotchas nuevos, y el conteo de tests.

- [ ] **Step 6: Commit final**

```bash
cd "C:/dev/crmventas"
git add -A
git commit -m "chore(visual): cerrar la fundacion de paridad visual (fases 0-3)"
git push
```

---

## Qué sigue

Con la fundación en verde, se escribe un plan por lote de la fase 4, cotejando cada captura de la Tarea 1 con la pantalla real de Cloud:

| Plan | Lote | Pantallas |
|---|---|---|
| `2026-XX-XX-paridad-visual-lote-1.md` | Listas maestras | Ventas, Compras, Inventario, CxC, CxP |
| `…-lote-2.md` | Detalle y documentos | Producción, Kardex, Salidas Internas, Trazabilidad, Compromisos |
| `…-lote-3.md` | Analítica (ECharts) | Dashboard, Panel del Negocio, Top Clientes |
| `…-lote-4.md` | Finanzas | Estados de Cuenta, Conciliación, Modelos Fiscales, Vehículos |
| `…-lote-5.md` | Administración y acceso | Configuración, Catálogos, Auditoría, Sorteos, Login |

El lote 1 es el que valida la fundación sobre pantallas reales: si `DataTable`, `PageLayout` y `Modal` cuadran ahí, los 17 restantes son repetición.
