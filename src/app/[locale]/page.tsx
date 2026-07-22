import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Droplets, Package, FlaskConical, BadgeDollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Landing 100% estática: anclas nativas en lugar del Link de next-intl para
// no cargar el router/runtime de cliente en la página más visitada.
export default function LandingPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("landing");

  const home = locale === "es" ? "/" : `/${locale}`;
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
          <a href={home}>{t("cta")}</a>
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
        <a href="/" className="underline-offset-4 hover:underline">
          Español
        </a>
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <a href="/pt" className="underline-offset-4 hover:underline">
          Português
        </a>
      </nav>
    </main>
  );
}
