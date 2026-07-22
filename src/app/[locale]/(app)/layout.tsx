import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/session";
import { Toaster } from "@/components/ui/sonner";
import { Link } from "@/i18n/navigation";
import { LayoutDashboard, Settings, Droplets } from "lucide-react";

// Zona protegida: requireOrg() verifica sesión + membresía en BD.
// Aquí sí se monta el Toaster (los client components lo usan).
// force-dynamic: nada de esta zona se prerenderiza en build (requiere BD/sesión).
export const dynamic = "force-dynamic";
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireOrg();
  const t = await getTranslations("app.nav");

  const nav = [
    { href: "/dashboard", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/settings", label: t("settings"), icon: Settings },
  ] as const;

  return (
    <div className="flex min-h-dvh flex-col sm:flex-row">
      <aside className="border-b bg-sidebar text-sidebar-foreground sm:min-h-dvh sm:w-56 sm:border-b-0 sm:border-r">
        <div className="flex items-center gap-2 p-4 font-semibold">
          <Droplets className="size-5 text-primary" aria-hidden />
          Daseo Cloud
        </div>
        <nav className="flex gap-1 px-2 pb-2 sm:flex-col">
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
        </nav>
      </aside>
      <main className="flex-1 p-4 sm:p-6">{children}</main>
      <Toaster />
    </div>
  );
}
