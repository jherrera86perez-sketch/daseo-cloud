import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { AppHeader } from "@/components/app-header";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import {
  LayoutDashboard,
  Settings,
  Users,
  Package,
  Receipt,
  KanbanSquare,
  FileText,
  FlaskConical,
  Factory,
  ShoppingCart,
  Truck,
  Landmark,
  Scale,
  UsersRound,
  ScrollText,
  Coins,
  Wallet,
  Banknote,
  Trophy,
  Gift,
  HeartHandshake,
  BookOpenCheck,
  Sparkles,
  Car,
} from "lucide-react";
import { LogoutButton } from "@/features/auth/logout-button";
import { LocaleSwitcher } from "@/features/auth/locale-switcher";
import { ThemeSwitcher } from "@/features/auth/theme-switcher";
import { getDb } from "@/db";
import { getSubscription } from "@/features/admin/queries";
import { subscriptionGate } from "@/features/admin/gate";
import { documentAllowance } from "@/features/admin/limits";
import { lowStockProducts } from "@/features/inventory/queries";
import { cobrosResumen } from "@/features/sales/queries";
import { listRates } from "@/features/rates/queries";
import { orgSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

// Zona protegida: requireOrg() verifica sesión + membresía en BD.
// force-dynamic: nada de esta zona se prerenderiza en build (requiere BD/sesión).
export const dynamic = "force-dynamic";
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { orgId, role, user } = await requireOrg();
  const t = await getTranslations("app.nav");

  // F7-M2: la suscripción manda sobre toda la zona app.
  const gate = subscriptionGate(
    await getSubscription(getDb(), orgId),
    new Date(),
  );
  if (gate.kind === "suspended") {
    const tg = await getTranslations("app.gate");
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold">{tg("suspendedTitle")}</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {tg("suspendedBody")}
        </p>
        <LogoutButton />
      </main>
    );
  }
  const tg = await getTranslations("app.gate");
  let trialNotice: string | null = null;
  if (gate.kind === "trial") {
    trialNotice = tg("trialDays", { days: gate.daysLeft });
  } else if (gate.kind === "trial-expired") {
    const allowance = await documentAllowance(getDb(), orgId);
    trialNotice = allowance.limited
      ? `${tg("trialExpired")} ${tg("freeQuota", {
          used: allowance.used,
          max: allowance.max,
        })}`
      : tg("trialExpired");
  }

  // ≈ agrupación por secciones de Sidebar.tsx del ERP (Inicio, Ventas y
  // cobros, Compras y pagos, Inventario y producción, Finanzas, Impuestos
  // ONAT, Configuración) — los módulos extra de Cloud (cotizaciones,
  // pipeline, recetas, salidas internas, auditoría) se ubican en la
  // sección temática más cercana; el ERP no los tiene como items propios.
  const navSections = [
    {
      title: t("section.home"),
      items: [
        { href: "/dashboard", label: t("dashboard"), icon: LayoutDashboard },
        { href: "/assistant", label: t("assistant"), icon: Sparkles },
      ],
    },
    {
      title: t("section.sales"),
      items: [
        { href: "/customers", label: t("customers"), icon: Users },
        { href: "/sales", label: t("sales"), icon: Receipt },
        { href: "/receivables", label: t("receivables"), icon: Coins },
        { href: "/quotes", label: t("quotes"), icon: FileText },
        { href: "/pipeline", label: t("pipeline"), icon: KanbanSquare },
        { href: "/top-clients", label: t("topClients"), icon: Trophy },
      ],
    },
    {
      title: t("section.purchases"),
      items: [
        { href: "/purchases", label: t("purchases"), icon: ShoppingCart },
        { href: "/payables", label: t("payables"), icon: Wallet },
        { href: "/suppliers", label: t("suppliers"), icon: Truck },
      ],
    },
    {
      title: t("section.inventory"),
      items: [
        { href: "/products", label: t("products"), icon: Package },
        { href: "/recipes", label: t("recipes"), icon: FlaskConical },
        { href: "/production", label: t("production"), icon: Factory },
        {
          href: "/internal-outflows",
          label: t("internalOutflows"),
          icon: HeartHandshake,
        },
      ],
    },
    {
      title: t("section.finance"),
      items: [
        { href: "/banking", label: t("banking"), icon: Landmark },
        { href: "/statements", label: t("statements"), icon: Banknote },
        {
          href: "/reconciliation",
          label: t("reconciliation"),
          icon: BookOpenCheck,
        },
        { href: "/raffles", label: t("raffles"), icon: Gift },
      ],
    },
    {
      title: t("section.tax"),
      items: [
        { href: "/fiscal", label: t("fiscal"), icon: Scale },
        { href: "/vehicles", label: t("vehicles"), icon: Car },
      ],
    },
    {
      title: t("section.settings"),
      items: [
        { href: "/employees", label: t("employees"), icon: UsersRound },
        { href: "/audit", label: t("audit"), icon: ScrollText },
        { href: "/settings", label: t("settings"), icon: Settings },
      ],
    },
  ];
  const db = getDb();
  const [low, cobros, [settings], allRates] = await Promise.all([
    lowStockProducts(db, orgId),
    cobrosResumen(db, orgId),
    db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)),
    listRates(db, orgId),
  ]);

  // ≈ ExchangeRatesWidget del ERP. `listRates` ya viene ordenada por fecha
  // descendente, así que la primera aparición de cada moneda es la vigente.
  // El ERP fija USD/MLC/EUR; aquí se muestran las que la org tenga, porque
  // Cloud es multi-tenant y una lista fija sería mentira para otra moneda base.
  const rates = [
    ...new Map(
      allRates.map((r) => [
        r.currency,
        {
          currency: r.currency,
          value: String(r.rateToBase)
            .replace(/(\.\d*?)0+$/, "$1")
            .replace(/\.$/, ""),
        },
      ]),
    ).values(),
  ].slice(0, 3);

  // ≈ badges por item del ERP ("Ventas 3", "Inventario 18"). Se cablean a las
  // rutas REALES de Cloud reutilizando las dos queries que el header ya hace
  // —cero consultas nuevas—. El ERP documenta que uno de sus tres paths con
  // badge ya no coincide con ninguna ruta suya: ese bug no se replica.
  const badges: Record<string, number> = {
    "/sales": cobros.num_ventas,
    "/products": low.length,
  };

  // NavItem.icon debe ser un elemento ya renderizado (ReactNode), no el
  // componente: una función/ComponentType no puede cruzar el límite
  // Server→Client de RSC al pasarla como prop.
  const sections = navSections.map((s) => ({
    title: s.title,
    items: s.items.map(({ href, label, icon: Icon }) => ({
      href,
      label,
      icon: <Icon className="size-4" aria-hidden />,
      badge: badges[href] || undefined,
    })),
  }));

  const flatNavItems = sections.flatMap((s) =>
    s.items.map(({ href, label, icon }) => ({ href, label, icon })),
  );

  return (
    <>
      <AppShell
        sections={sections}
        labels={{
          openMenu: t("openMenu"),
          collapse: t("collapse"),
          collapseSidebar: t("collapseSidebar"),
          expandSidebar: t("expandSidebar"),
        }}
        header={
          <AppHeader
            lowStockCount={low.length}
            receivableCents={cobros.total_adeudado_base_cents}
            baseCurrency={settings?.baseCurrency ?? "CUP"}
            navItems={flatNavItems}
            rates={rates}
            userName={user.name || user.email}
            userRole={role.toUpperCase()}
            userMenu={
              <div className="space-y-1">
                <LocaleSwitcher />
                <ThemeSwitcher />
                <LogoutButton />
              </div>
            }
          />
        }
      >
        <div className="p-4 sm:p-6">
          {trialNotice && (
            <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
              {trialNotice}
            </div>
          )}
          {children}
        </div>
      </AppShell>
      <Toaster />
    </>
  );
}
