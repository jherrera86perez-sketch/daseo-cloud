import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { Toaster } from "@/components/ui/sonner";
import { Link } from "@/i18n/navigation";
import {
  LayoutDashboard,
  Settings,
  Droplets,
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
} from "lucide-react";
import { LogoutButton } from "@/features/auth/logout-button";
import { LocaleSwitcher } from "@/features/auth/locale-switcher";
import { ThemeSwitcher } from "@/features/auth/theme-switcher";
import { getDb } from "@/db";
import { getSubscription } from "@/features/admin/queries";
import { subscriptionGate } from "@/features/admin/gate";
import { documentAllowance } from "@/features/admin/limits";

// Zona protegida: requireOrg() verifica sesión + membresía en BD.
// Aquí sí se monta el Toaster (los client components lo usan).
// force-dynamic: nada de esta zona se prerenderiza en build (requiere BD/sesión).
export const dynamic = "force-dynamic";
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { orgId } = await requireOrg();
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

  const nav = [
    { href: "/dashboard", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/assistant", label: t("assistant"), icon: Sparkles },
    { href: "/customers", label: t("customers"), icon: Users },
    { href: "/products", label: t("products"), icon: Package },
    { href: "/sales", label: t("sales"), icon: Receipt },
    { href: "/receivables", label: t("receivables"), icon: Coins },
    { href: "/purchases", label: t("purchases"), icon: ShoppingCart },
    { href: "/payables", label: t("payables"), icon: Wallet },
    { href: "/suppliers", label: t("suppliers"), icon: Truck },
    { href: "/banking", label: t("banking"), icon: Landmark },
    { href: "/statements", label: t("statements"), icon: Banknote },
    {
      href: "/reconciliation",
      label: t("reconciliation"),
      icon: BookOpenCheck,
    },
    { href: "/top-clients", label: t("topClients"), icon: Trophy },
    { href: "/raffles", label: t("raffles"), icon: Gift },
    { href: "/fiscal", label: t("fiscal"), icon: Scale },
    { href: "/employees", label: t("employees"), icon: UsersRound },
    { href: "/audit", label: t("audit"), icon: ScrollText },
    { href: "/quotes", label: t("quotes"), icon: FileText },
    { href: "/pipeline", label: t("pipeline"), icon: KanbanSquare },
    { href: "/recipes", label: t("recipes"), icon: FlaskConical },
    { href: "/production", label: t("production"), icon: Factory },
    {
      href: "/internal-outflows",
      label: t("internalOutflows"),
      icon: HeartHandshake,
    },
    { href: "/settings", label: t("settings"), icon: Settings },
  ] as const;

  return (
    <div className="flex min-h-dvh flex-col sm:flex-row">
      <aside className="border-b bg-sidebar text-sidebar-foreground sm:min-h-dvh sm:w-56 sm:border-b-0 sm:border-r">
        <div className="flex items-center gap-2 p-4 font-semibold">
          <Droplets className="size-5 text-primary" aria-hidden />
          Daseo Cloud
        </div>
        <nav className="flex flex-wrap gap-1 px-2 pb-2 sm:flex-col">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent"
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
          <LogoutButton />
        </nav>
        <LocaleSwitcher />
        <ThemeSwitcher />
      </aside>
      <main className="flex-1 p-4 sm:p-6">
        {trialNotice && (
          <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
            {trialNotice}
          </div>
        )}
        {children}
      </main>
      <Toaster />
    </div>
  );
}
