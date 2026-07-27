import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Droplets, Package, FlaskConical, BadgeDollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

export default function LandingPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("landing");

  const features = [
    { icon: BadgeDollarSign, label: t("features.sales") },
    { icon: Package, label: t("features.inventory") },
    { icon: FlaskConical, label: t("features.production") },
  ];

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-4 py-16">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-center gap-2">
          <Droplets className="size-8 text-primary" aria-hidden />
          <h1 className="text-4xl font-bold tracking-tight">{t("title")}</h1>
        </div>
        <p className="max-w-md text-balance text-muted-foreground">
          {t("subtitle")}
        </p>
        <Button asChild size="lg">
          {/*
           * A /login, no a "/": con href="/" el botón enlazaba a la propia
           * landing y un visitante nuevo no tenía forma de llegar ni al login
           * ni a la demo, que vive dentro de él. El smoke test comprobaba que
           * el enlace estuviera visible, no que llevara a algún sitio.
           *
           * prefetch={false} NO es adorno: al entrar en el viewport, <Link>
           * precarga la ruta destino, y /login arrastra su cliente (authClient
           * + sonner). Eso subió los scripts de la landing a 203KB y reventó el
           * presupuesto de 175KB de Lighthouse — el mismo motivo por el que el
           * Toaster se sacó del layout raíz. La landing es la única página con
           * presupuesto medido; aquí un enlace no se precarga.
           */}
          <Link href="/login" prefetch={false}>
            {t("cta")}
          </Link>
        </Button>
      </div>

      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-3">
        {features.map(({ icon: Icon, label }) => (
          <Card key={label}>
            <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
              <Icon className="size-6 text-primary" aria-hidden />
              <span className="text-sm font-medium">{label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <nav aria-label="Idioma / Língua" className="flex gap-3 text-sm">
        <Link
          href="/"
          locale="es"
          className="underline-offset-4 hover:underline"
        >
          Español
        </Link>
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <Link
          href="/"
          locale="pt"
          className="underline-offset-4 hover:underline"
        >
          Português
        </Link>
      </nav>
    </main>
  );
}
