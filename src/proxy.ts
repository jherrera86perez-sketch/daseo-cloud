import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Middleware SOLO para i18n (locale). La protección de rutas vive en los
// layouts de (app) + requireOrg() en cada action/query — nunca aquí.
export default createMiddleware(routing);

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
