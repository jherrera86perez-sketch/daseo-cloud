"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";

export type NavItem = {
  href: string;
  label: string;
  // ReactNode (elemento ya renderizado), NO el componente en sí — un
  // ComponentType/función no puede cruzar el límite Server→Client de RSC.
  icon: React.ReactNode;
};

/**
 * ≈ CommandMenu.tsx del ERP (Cmd/Ctrl+K), acotado a solo-navegación: el
 * original combina esto con búsqueda de clientes/productos/ventas vía un
 * endpoint de búsqueda global que no existe en Cloud — construirlo ahora
 * sería una feature nueva, no un port. Se porta el patrón de navegación
 * rápida, que no requiere backend nuevo (los 24 módulos ya son conocidos
 * client-side).
 */
export function CommandPaletteTrigger({
  navItems,
}: Readonly<{ navItems: NavItem[] }>) {
  const t = useTranslations("app.header");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (v) setQuery("");
          return !v;
        });
      } else if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return navItems;
    return navItems.filter((i) => i.label.toLowerCase().includes(q));
  }, [navItems, query]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function go(href: string) {
    close();
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-surface-hover"
      >
        <Search className="size-4" aria-hidden />
        {t("search")}
        <kbd className="rounded border bg-muted px-1 font-mono text-xs">
          Ctrl+K
        </kbd>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-lg border bg-background p-3 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="mb-2"
            />
            <div className="max-h-80 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                  {t("noResults")}
                </p>
              ) : (
                filtered.map((item) => (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => go(item.href)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-surface-hover"
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
