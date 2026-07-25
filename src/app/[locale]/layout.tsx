import type { Metadata } from "next";
import { Inter, Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { ThemeProvider } from "@/components/theme-provider";
import "../globals.css";

/*
 * Las tres fuentes del ERP CubaOne (src/styles/index.css:62-64):
 *   body    → Inter
 *   display → Bricolage Grotesque (títulos y cifras grandes)
 *   mono    → IBM Plex Mono (etiquetas, eyebrows y columnas numéricas)
 * Sustituyen a Geist.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/*
 * `preload: false` en display y mono a propósito: next/font precarga toda
 * fuente declarada en el layout en TODAS las rutas, y la landing pública sólo
 * usa Inter. Con preload en las tres, la landing arrastraba 119,9 KB en 5
 * archivos para nada — peso que castiga el gate de rendimiento (≥0.85) sin
 * contar como script. Se cargan cuando una pantalla usa .t-display / .t-mono.
 */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "Daseo Cloud",
    template: "%s · Daseo Cloud",
  },
  description:
    "ERP SaaS multi-tenant: ventas, inventario, producción y cobros multi-moneda.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${bricolage.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider>
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
