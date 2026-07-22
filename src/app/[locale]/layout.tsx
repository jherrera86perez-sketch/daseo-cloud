import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
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

// NOTA de presupuesto: este layout raíz NO carga NextIntlClientProvider ni
// Toaster — los server components traducen sin provider. El provider y el
// Toaster se montan en el layout de (app), donde sí hay client components.
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
