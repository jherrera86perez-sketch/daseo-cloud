import { Toaster } from "@/components/ui/sonner";

/**
 * Fix real (no de paridad ERP): /login, /signup, /onboarding e /invite
 * llaman toast.error(...) pero no tenían ningún <Toaster> montado — el
 * layout raíz no lo monta (Lighthouse: no cargar sonner en la landing
 * pública `/`, que no lo usa) y el de (app) no cubre estas rutas.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
