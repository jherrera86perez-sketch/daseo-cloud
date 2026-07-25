# Inventario de referencias visuales del ERP CubaOne

> Tarea 1 del plan `2026-07-25-paridad-visual-fundacion.md`. Capturado el 25-jul-2026 a 1440px de ancho
> contra el ERP real (`localhost:5176`) con la base de producción.
>
> ⚠️ **Las capturas NO están en el repositorio.** Contienen nombres, teléfonos y saldos de clientes
> reales, y este repo es público. Viven sólo en el scratchpad de la sesión. Este documento es el índice.

## Cómo levantar el ERP para volver a capturar

```bash
cd "C:/Mi Carpeta/Herramientas/Laika/daseo-erp"
npm rebuild better-sqlite3   # obligatorio: viene compilado para Electron (NODE_MODULE_VERSION 121)
node server/index.js         # backend en :3001
npx vite                     # frontend en :5176
```

Al terminar, devolver el módulo nativo a Electron: `npm run rebuild:electron`.

**Base de datos real:** `C:\Users\jherr\AppData\Roaming\cubaone-erp\cubaone.db` (12,41 MB) — **no** el
`cubaone.db` de la carpeta del repo del ERP, que es una copia vieja de 8 MB.

**Login:** lo hace Javier a mano. Las contraseñas no se automatizan.

## Las 22 pantallas

| # | Pantalla ERP | Ruta ERP | Ruta Cloud equivalente | Captura |
|---|---|---|---|---|
| 1 | Panel de Control | `/` | `/dashboard` | `dashboard.jpg` |
| 2 | Panel del Negocio | `/panel-negocio` | `/assistant` | `panel-negocio.jpg` |
| 3 | Ventas y Facturación | `/ventas` | `/sales` | `ventas.jpg` |
| 4 | Cuentas por Cobrar | `/cuentas-por-cobrar` | `/receivables` | `cuentas-por-cobrar.jpg` |
| 5 | Compromisos de entrega | `/compromisos` | dentro de `/customers/[id]` | `compromisos.jpg` |
| 6 | Top Clientes | `/top-clientes` | `/top-clients` | `top-clientes.jpg` |
| 7 | Gestión de Compras | `/compras` | `/purchases` | `compras.jpg` |
| 8 | Cuentas por Pagar | `/cuentas-por-pagar` | `/payables` | `cuentas-por-pagar.jpg` |
| 9 | Inventario Global | `/inventario` | `/products` | `inventario.jpg` |
| 10 | Kardex Valorizado | `/inventario` → «Ver Kardex» | dentro de `/products/[id]` | `kardex.jpg` |
| 11 | Órdenes de Producción | `/produccion` | `/production` | `produccion.jpg` |
| 12 | Trazabilidad por Lote | `/trazabilidad` | dentro de `/products/[id]` | `trazabilidad.jpg` |
| 13 | Salidas Internas | `/salidas-internas` | `/internal-outflows` | `salidas-internas.jpg` |
| 14 | Control de Caja | `/conciliacion` | `/reconciliation` | `conciliacion.jpg` |
| 15 | Estados de Cuenta | `/estados-cuenta` | `/statements` | `estados-cuenta.jpg` |
| 16 | Sorteos | `/sorteos` | `/raffles` | `sorteos.jpg` |
| 17 | Modelos Fiscales (ONAT) | `/modelos-fiscales` | `/fiscal` | `modelos-fiscales.jpg` |
| 18 | Gestión de Vehículos | `/vehiculos` | `/vehicles` | `vehiculos.jpg` |
| 19 | Catálogos Maestros | `/catalogos` | reparte en `/settings`, `/customers`, `/products`, `/suppliers`, `/recipes` | `catalogos.jpg` |
| 20 | Configuración del Sistema | `/configuracion` | `/settings` | `configuracion.jpg` |
| 21 | Logs de Auditoría | `/configuracion` → Auditoría | `/audit` | `audit-logs.jpg` |
| 22 | Login | `/` (sin sesión) | `/login` | `login.jpg` |

## Estados NO capturados

| Estado | Por qué |
|---|---|
| Modal abierto (Nueva Venta) | No se intentó: los controles del header quedaron bloqueados antes de llegar |
| Sidebar colapsada | **El banner de licencia lo impide** (ver abajo) |
| Modo oscuro | **El banner de licencia lo impide** (ver abajo) |

Pendientes de una segunda pasada cuando la licencia esté resuelta. **No bloquean las fases 1–3**: los
tokens de modo oscuro se portan de `index.css:599`, que ya está leído.

## Hallazgos que afectan al plan

### 1. El banner de licencia bloquea todo el header del ERP
La licencia está vinculada a otra PC y quedan 3 días de gracia. El banner de aviso es un overlay fijo
que **intercepta los clics de la franja superior completa**: toggle de tema, colapsar sidebar, menú de
usuario y widget de tasas son inalcanzables. Verificado con dos métodos (coordenadas y referencia de
elemento) — los clics llegan al elemento correcto y no pasa nada.
**Es un bug real del ERP en producción, no del clon.** No se replica.

### 2. La navegación por URL no funciona en el ERP
Entrar directo a `localhost:5176/ventas` recarga la SPA y renderiza el Dashboard, no Ventas. Sólo
funciona haciendo clic en los enlaces del menú (routing en cliente). Para recapturar, **clic siempre**.
Cloud no tiene este problema —Next resuelve rutas de servidor— así que es una regresión que el clon
**no** debe introducir.

### 3. El login usa la piel "editorial" legacy, no Linear
Fondo navy oscuro `#1A2535`, tarjeta crema, logo naranja `C1`, botón azul grisáceo. Es el único sitio
donde sobrevive la piel que dábamos por muerta, porque está fuera del layout de la app.
**Consecuencia:** la pantalla 22 no hereda los tokens de la fundación; se clona aparte en el lote 5.

### 4. Falta un componente en el plan: `DensityToggle`
Aparece en la barra de herramientas de **7 pantallas** (Ventas, CxC, CxP, Compras, Inventario,
Producción, Auditoría) con tres opciones: `Compacta · Cómoda · Espaciosa`. Controla la altura de fila de
la tabla. No estaba en el inventario de componentes de la Tarea 4/5 del plan — **se añade a la Tarea 5**.

### 5. Anatomía común de las pantallas de lista (confirmada en 7 pantallas)
Todas comparten exactamente esta estructura, lo que valida el enfoque de cascada:

```
PageHeader     título display + subtítulo en cursiva + regla amber corta + acciones a la derecha
Toolbar        búsqueda · filtros select · rango de fechas · «Limpiar» · DensityToggle a la derecha
┌──────────────────────────────────────────┬─────────────────────┐
│ DataTable                                │ Panel lateral ~250px│
│  cabecera en surface-100, .t-label       │  KPI grande .t-num  │
│  celdas numéricas alineadas a la derecha │  Top 3 con ranking  │
│  badges de estado por tono               │  Por estado + barras│
│                                          │  Métricas           │
└──────────────────────────────────────────┴─────────────────────┘
Footer         «Mostrando 1 - 15 de N»                    ← 1/2 →
```

### 6. Dos pantallas usan la firma editorial de cabecera
Dashboard y Panel del Negocio abren con eyebrow mono (`№ 07 · 2026`), título display grande y subtítulo
en cursiva. Las demás usan sólo título + subtítulo. Es una variante de `PageHeader`, no otro componente.

### 7. Catálogos y Configuración son maestro-detalle a dos paneles
Catálogos: tabs con contador (`CLIENTES 12`, `PROVEEDORES 6`, `PRODUCTOS 14`, `SEMI ELABORADOS 1`,
`MATERIAS PRIMAS 24`, `SERVICIOS 0`, `RECETAS`) + lista izquierda + detalle derecho con estado vacío
(«Selecciona un elemento de la lista para ver detalles»).
Configuración: sub-nav izquierda (Empresa, Empleados, Usuarios, Auditoría, Sistema) + panel derecho con
tabs (General, Contacto, Fiscal, Bancario, Tasas de cambio, Documentos, Redes).
**Auditoría es una sub-sección de Configuración**, no una ruta propia — pero en Cloud `/audit` sí es
ruta. No se cambia (§2.4 del spec: no adoptar la arquitectura del ERP).
