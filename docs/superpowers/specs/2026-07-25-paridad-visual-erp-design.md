# SPEC DE DISEÑO — Paridad visual Daseo Cloud ← ERP CubaOne

> Fecha: 2026-07-25 · Estado: aprobado por Javier (secciones 1–4)
> Complementa la maratón de paridad **funcional** (22→24-jul). Aquella replicó reglas de negocio,
> cálculos y textos literales. Esta replica el **aspecto y el modelo de interacción**.

## 1. Problema

La maratón de paridad de julio dejó Daseo Cloud **funcionalmente fiel** al ERP CubaOne (10 módulos,
268 tests unitarios, 34 E2E) pero **visualmente ajeno**. Son dos sistemas de diseño distintos:

| | ERP CubaOne | Daseo Cloud (hoy) |
|---|---|---|
| Paleta | Navy `#1E3A5F` + amber `#B45309` + superficies crema `#F2EFE9`/`#FDFCF8` | Teal profundo OKLCH sobre neutros fríos |
| Sidebar | Navy oscuro `#1A2535`, borde activo amber | Clara, tono del tema |
| Tipografía | `"Segoe UI", Inter, ui-sans-serif, …` | Geist |
| Motor | Tailwind v3 + 410 variables CSS + 88 KB de CSS propio | Tailwind v4 + ~40 tokens OKLCH |
| Gráficos | ECharts (+ Recharts en un componente) | SVG/CSS puro |
| Interacción | Modales (≈55 archivos con overlay) | Páginas y formularios inline (4 archivos con overlay) |
| Primitivas UI | ~35 componentes (`atoms/`, `forms/`, `feedback/`, `charts/`) | 5 (`button`, `card`, `input`, `label`, `sonner`) |

## 2. Objetivo y alcance

**Objetivo:** que Daseo Cloud se vea y se sienta como el ERP CubaOne, pantalla por pantalla.

### Decisiones de alcance (tomadas por Javier, 25-jul)

1. **Clon pantalla por pantalla**, no sólo reskin. Máxima fidelidad.
2. **Fiel en ≥1024px**; por debajo, misma piel con reflujo responsive (sidebar en cajón, tablas con
   scroll, modales a pantalla completa). Los 34 E2E (Desktop Chrome + Pixel 7) siguen verdes.
3. **Se clonan las 22 pantallas que el ERP tiene.** Las exclusivas de Cloud (cotizaciones, pipeline,
   recetas, proveedores, empleados, `/admin`, signup/onboarding/invite, landing, banking, y las
   sub-rutas `new`/`edit`/`[id]` que el ERP resuelve en modales) **no se inventan en el ERP**: heredan el
   sistema de diseño para que ninguna quede con aspecto huérfano. Cloud tiene 48 `page.tsx`; unas 18
   corresponden a pantallas del ERP, el resto es superficie propia.
4. **NO se adopta la arquitectura de navegación del ERP.** No se crean rutas nuevas para calcar su
   estructura. Ver §6, ambigüedad resuelta.
5. **Verificación:** se capturan las 22 pantallas del ERP real como referencia, se compara internamente,
   y Javier aprueba por lotes de 4–5 pantallas.

### Fuera de alcance

- Tema *"editorial"* del ERP (tercera variante decorativa además de claro/oscuro).
- Pastilla de "fecha de trabajo" (`WorkingDateModal`): paradigma offline de escritorio; Cloud ya tiene
  fecha retroactiva **por documento**, que es más granular.
- Botón de respaldo a carpeta: Electron/filesystem local, no aplica sobre Neon.
- Cualquier cambio de lógica de negocio. **Este trabajo no toca queries, acciones ni esquema.**

## 3. Enfoque elegido: cascada (fundación → chrome → pantallas)

Evaluados tres:

- **A. Cascada** (elegido): tokens → primitivas → chrome → 22 pantallas. Cuando se llega a las pantallas,
  cada una cuesta poco y salen consistentes; las heredadas quedan bien sin trabajo extra; un cambio
  de criterio se arregla en un archivo. Coste: los primeros días no hay ninguna pantalla "terminada".
- **B. Rebanadas verticales** (descartado): una pantalla completa a la vez. Resultado visible el día 1,
  pero las primeras pantallas definen abstracciones con muy poca información → retrabajo casi seguro,
  y las heredadas quedan feas hasta el final.
- **C. Tema paralelo conmutable** (descartado): la piel del ERP como tema alternativo. Reversible, pero
  sólo cubre color. Lo estructural (modales, ECharts, layouts) **no se conmuta con una variable CSS**;
  resolvería ~30 % del trabajo al doble de superficie mantenida.

**Razón de A:** las 22 pantallas no son independientes — comparten sidebar, header, tablas, tarjetas,
badges y modales. Construida la fundación una vez, clonar cada pantalla es recomponer piezas que ya se
ven como el ERP.

## 4. Arquitectura

### 4.1 Capa de tokens

Cloud declara tokens en dos niveles: valores crudos en `:root`/`.dark`, y un puente `@theme inline` que
los expone a Tailwind. **Los 98 `.tsx` existentes sólo consumen nombres semánticos** (`bg-card`,
`text-muted-foreground`, `border-border`). Por tanto, **reemplazar los valores de `:root` repinta las 48
pantallas sin editar un componente.**

Cambios en `src/app/globals.css`:

1. **Valores** → hex literales del ERP, tomados de su `tailwind.config.js` y su `index.css`.
2. **Se retira la convención OKLCH** en la capa de tokens. Era regla del proyecto ("nunca hex crudos"),
   pero aquí prima la fidelidad **verificable**: un hex se coteja de un vistazo contra la fuente del ERP;
   un OKLCH convertido, no. La regla se reescribe: *los componentes siguen sin usar hex crudos — sólo la
   capa de tokens los declara*.
3. **Tokens nuevos** que Cloud no tiene y las pantallas del ERP usan: escala `surface-100/200/300`
   (cabeceras de tabla, filas alternas), escala amber completa, `--btn-*-bg/hover/active`,
   `--chart-grid/axis/tooltip`, escala navy de sidebar (`inactive`, `active-bg`, `active-border`).
4. **Tipografía** → stack exacto del ERP. En Windows se ve idéntico; fuera cae a Inter, igual que el ERP.
   Efecto lateral: **desaparece la webfont Geist y el bundle baja**.
5. **Modo oscuro** → los valores de `html[data-theme="dark"]` del ERP (`index.css:599`) al bloque `.dark`
   de Cloud (next-themes usa `attribute="class"`).

### 4.2 Biblioteca de componentes

~35 componentes; 3.251 líneas sólo en los 13 nucleares (Sidebar 725, DataTable 487, PageLayout 439,
Modal 400, Header 358, KpiStrip 227, StatCard 131, Card 128, FormField 108, PageHeader 90, Badge 82,
MainLayout 52, ModalPortal 24).

- **Ubicación:** se espeja la estructura del ERP dentro de `src/components/ui/` — `atoms/`, `forms/`,
  `feedback/`, `charts/` — más los de raíz.
- **Reemplazo en sitio:** los 5 primitivos actuales se **sustituyen** conservando nombre de archivo en
  minúscula y la misma superficie de importación, para que las 98 pantallas los adopten sin tocar imports.
  *(El ERP usa `Button.tsx`; en Windows el FS no distingue mayúsculas y colisionaría.)*
- **Regla de fidelidad** (la misma de la maratón funcional): se copia marcado y clases **literalmente**;
  sólo se adaptan las costuras del framework — `react-router Link` → `next/link`, `"use client"` donde
  haga falta, y los tres lint de React 19 ya conocidos (nada de `setState` en effect, ni componentes
  definidos dentro de componentes, ni `Date.now()` en el cuerpo del render).
- **Regla de `"use client"` selectivo (crítica):** los componentes del ERP vienen de una SPA React 18
  donde todo es cliente. Cloud es RSC. **Sólo lleva `"use client"` lo que tiene interactividad real**
  (Modal, Combobox, Switch, DataTable con orden/filtro, CommandMenu). Lo presentacional (Card, Badge,
  StatCard, PageHeader, EmptyState, SectionHeader, StatusDot) se queda **server component**: copia visual
  exacta a 0 KB de JS.
- **Modal:** Cloud no tiene ningún componente de diálogo. Se portan `Modal.tsx` + `ModalPortal.tsx` tal
  cual. Conviven con la arquitectura: el modal es cliente, el formulario interior sigue enviando por
  server action con `useActionState`. **No cambia nada del backend.**
- **Orden:** `forms/` → `Card`/`Badge`/`StatCard`/`KpiStrip` → `DataTable` → `Modal`/`feedback/` →
  `layout/`.

**Excepción documentada — `DataTable`:** el del ERP (487 líneas) trae orden, filtrado y paginación en
cliente. Varias listas de Cloud ya lo resuelven en servidor con `searchParams` (Ventas, Compras, Estados
de Cuenta). **Se conserva el filtrado en servidor y se le pone la piel del ERP**: es mejor, ya está
testeado, y visualmente es indistinguible.

### 4.3 Chrome

**Sidebar.** Hoy vive incrustada en `(app)/layout.tsx` (226 líneas, que además hace `requireOrg`, el gate
de suscripción y el header). Se extrae a `src/components/app-sidebar.tsx` — higiene necesaria, no se
clonan 725 líneas dentro de ese layout. Se porta la navy `#1A2535`, el borde amber del item activo, las 7
secciones y **el colapsar/expandir con persistencia en `localStorage` + tooltips en modo colapsado**.

> **Reversión explícita:** en la paridad del chrome (24-jul) se decidió *no* portar el colapso por
> "cosmético, bajo valor". Bajo "clon pantalla por pantalla" esa decisión queda revertida.

**Badges de alerta por sección:** se portan **cableados a las rutas reales de Cloud**. El propio ERP
documenta que uno de sus tres paths con badge ya no apunta a ninguna ruta real: *no se replican los bugs
confirmados del ERP* (regla vigente de la maratón funcional).

Nombre y logo de empresa del ERP mapean al nombre de la organización de Cloud (multi-tenant: cada org ve
el suyo).

**Header.** Cloud tiene 65 líneas (campanita + "Te deben $X"); el del ERP, 358. Se porta completo salvo lo
listado fuera de alcance. **Sí entran** el menú de usuario con avatar, el widget de tasas y el
`ThemeSwitcher` — hoy dispersos en la sidebar y en `/settings`.

**Responsive.** Bajo 1024px la sidebar pasa a cajón con overlay. El colapso de escritorio y el cajón móvil
son **dos estados del mismo componente**, no dos componentes.

## 5. Fases

| Fase | Contenido |
|---|---|
| **0. Referencias** | Levantar el ERP (`npm run server` + `vite`, `node_modules` ya instalado, `cubaone.db` con datos). Capturar las 22 pantallas **al scratchpad de sesión** |
| **1. Tokens** | §4.1. Verificación: una sola pantalla de referencia debe coincidir en color/fondo/borde sin tocar componentes |
| **2. Componentes** | §4.2, en el orden indicado |
| **3. Chrome** | §4.3 |
| **4. Las 22 pantallas** | 5 lotes, abajo |
| **5. Barrido de las heredadas** | Revisión una por una de las pantallas exclusivas de Cloud, para que ninguna quede huérfana |
| **6. Cierre** | Lighthouse, 34 E2E, CI verde, deploy, `ESTADO.md` |

### Lotes de la fase 4

| Lote | Pantallas del ERP | Criterio |
|---|---|---|
| 1 | Ventas, Compras, Inventario, CxC, CxP | Valida `DataTable` + `PageLayout` + `Modal` sobre las 5 listas maestras. Si cuadra, las otras 17 son repetición |
| 2 | Producción, Kardex, Salidas Internas, Trazabilidad, Compromisos | Detalle y documentos |
| 3 | Dashboard, Panel del Negocio, Top Clientes | Los de ECharts |
| 4 | Estados de Cuenta, Conciliación, Modelos Fiscales, Vehículos | Finanzas, las más densas |
| 5 | Configuración, Catálogos, Auditoría, Sorteos, Login | Administración y acceso |

Cada lote se presenta con capturas ERP vs Cloud lado a lado para aprobación.

## 6. Ambigüedad resuelta: las 4 pantallas sin ruta propia

Cuatro de las 22 no tienen ruta equivalente en Cloud:

| Pantalla ERP | Dónde vive ese contenido en Cloud |
|---|---|
| Kardex | dentro de `/products/[id]` |
| Trazabilidad | dentro de `/products/[id]` (lotes y vencimientos) |
| Compromisos | dentro de `/customers/[id]` |
| Catálogos | repartido en `/settings` |

Como se descartó adoptar la arquitectura del ERP (§2.4), **no se crean rutas nuevas**: se clona su
lenguaje visual **donde ese contenido ya vive en Cloud**. Decisión documentada, no omisión.

## 7. Riesgos

1. **Contraste vs. gate de accesibilidad.** La paleta del ERP nació en Electron, sin CI; los tokens de
   Cloud se eligieron para pasar a11y ≥0.95. Si algún par texto/fondo no llega a 4.5:1 hay conflicto entre
   fidelidad y gate. **Se mide en la fase 1, antes de aplicar nada**, y los pares problemáticos se
   reportan en vez de descubrirse con el CI en rojo.

2. **Fuga de peso a la landing pública.** `lighthouserc.json` sólo mide `/` y `/pt`: las rutas de la app
   están tras autenticación y LHCI nunca las visita. **Consecuencia: los 175 KB nunca aplicaron a
   `/dashboard`; ECharts entra sin fricción y `lighthouserc.json` no se toca.** El riesgo real es que un
   componente portado se cuele en el layout raíz y engorde la landing — exactamente el fallo del
   `<Toaster/>` del 24-jul. Se vigila en cada fase.

3. **RSC → cliente.** Portar 35 componentes de una SPA puede convertir páginas servidor en árboles
   cliente. Mitigado por la regla de `"use client"` selectivo (§4.2); se mide en cada lote.

4. **E2E frágiles al chrome.** Los 34 tests navegan usando la sidebar — es el punto exacto donde el
   24-jul cayeron 28 de 32 por el cruce Server→Client de los iconos. **Los E2E corren en cada paso de la
   fase 3, no al final.**

## 8. Verificación y definición de "listo"

- **Sin tests unitarios nuevos.** Son cambios de presentación, no de lógica de negocio — mismo criterio
  aplicado en la paridad del chrome del 24-jul.
- **Red de seguridad: los 268 unitarios + 34 E2E existentes, verdes en cada fase.** Ninguna fase se da por
  cerrada con la suite en rojo.
- **Fidelidad visual:** captura del ERP vs captura de Cloud, lado a lado, por pantalla. Aprobación de
  Javier por lotes.
- **Cierre:** CI verde + desplegado en `daseo-cloud.vercel.app` + entrada en `ESTADO.md`.

## 9. Nota de seguridad

`cubaone.db` contiene **datos reales de clientes** y el repositorio de Cloud es **público**. Las capturas
de referencia del ERP viven **sólo en el scratchpad de sesión** y **nunca se commitean**. Mismo criterio
que se aplicó a los PDFs bancarios en F8.
