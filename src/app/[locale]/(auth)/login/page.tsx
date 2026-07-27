"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { useRouter, Link } from "@/i18n/navigation";
import { Droplets } from "lucide-react";

/*
 * PARIDAD VISUAL — lote 5.
 *
 * Esta pantalla NO usa los tokens de la fundación a propósito: en el ERP el
 * login conserva la piel "editorial" legacy (navy oscuro, tarjeta crema, logo
 * ámbar) porque vive fuera del layout de la app y nunca migró a la piel
 * Linear. Se clona con sus hex literales; es el único sitio del proyecto donde
 * eso es correcto.
 *
 * Sólo cambia la presentación: onSubmit y onDemo quedan intactos.
 */
export default function LoginPage() {
  const t = useTranslations("auth.login");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) {
      toast.error(t("error"));
      return;
    }
    router.push("/dashboard");
  }

  // Credenciales públicas por diseño: la org "demo" solo contiene datos ficticios.
  async function onDemo() {
    setPending(true);
    // Cerrar la sesión que hubiera antes de entrar como demo. Sin esto, con una
    // sesión viva el signIn no la reemplaza y el push acaba en el dashboard de
    // la organización REAL del usuario — parecía que la demo no abría cuando lo
    // que pasaba es que abría la org equivocada. Da igual si no había sesión.
    await authClient.signOut().catch(() => {});
    const { error } = await authClient.signIn.email({
      email: "demo@daseo.app",
      password: "demo-daseo-2026",
    });
    setPending(false);
    if (error) {
      toast.error(t("error"));
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-[#1A2535] px-4 py-10">
      <div className="w-full max-w-[420px] overflow-hidden rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
        {/* Cabecera en degradado navy con el logotipo, como el ERP */}
        <div className="bg-[linear-gradient(160deg,#2B5D9B_0%,#1E3A5F_60%,#1A2535_100%)] px-8 pt-8 pb-7 text-center">
          <span
            aria-hidden
            className="mx-auto mb-4 grid size-[100px] place-items-center rounded-2xl bg-[#B45309] text-[44px] leading-none font-bold text-white"
          >
            <Droplets className="size-14" />
          </span>
          <p className="text-[26px] leading-tight font-bold text-white">
            {tc("appName")}
          </p>
          <p className="mt-1 text-sm text-white/70">{tc("tagline")}</p>
        </div>

        {/* Cuerpo crema */}
        <div className="bg-[#FDFCF8] px-8 pt-7 pb-8">
          <h1 className="mb-6 text-center text-lg font-bold text-[#1A1A1F]">
            {t("title")}
          </h1>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-[11px] font-semibold tracking-[0.12em] text-[#5C5E66] uppercase"
              >
                {t("email")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="h-11 w-full rounded-lg border border-[#D6CFC4] bg-[#F2EFE9] px-3 text-sm text-[#1A1A1F] outline-none focus-visible:border-[#2B5D9B] focus-visible:ring-[3px] focus-visible:ring-[rgba(30,58,95,0.12)]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-[11px] font-semibold tracking-[0.12em] text-[#5C5E66] uppercase"
              >
                {t("password")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="h-11 w-full rounded-lg border border-[#D6CFC4] bg-[#F2EFE9] px-3 text-sm text-[#1A1A1F] outline-none focus-visible:border-[#2B5D9B] focus-visible:ring-[3px] focus-visible:ring-[rgba(30,58,95,0.12)]"
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="h-11 rounded-lg bg-[#1E3A5F] text-sm font-semibold text-white transition-colors hover:bg-[#2B5D9B] disabled:opacity-45"
            >
              {pending ? "…" : t("submit")}
            </button>

            <p className="text-center text-sm text-[#5C5E66]">
              {t("noAccount")}{" "}
              <Link
                href="/signup"
                className="font-medium text-[#1E3A5F] underline-offset-4 hover:underline"
              >
                {t("signupLink")}
              </Link>
            </p>

            <div className="flex flex-col gap-1 border-t border-[#D6CFC4] pt-4">
              <button
                type="button"
                onClick={onDemo}
                disabled={pending}
                className="h-11 rounded-lg border border-[#D6CFC4] bg-transparent text-sm font-medium text-[#1A1A1F] transition-colors hover:border-[#B45309] hover:text-[#B45309] disabled:opacity-45"
              >
                {t("demo")}
              </button>
              <p className="text-center text-xs text-[#8B8D94]">
                {t("demoHint")}
              </p>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
