import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

/*
 * "Catálogos" es la entrada del menú, como en el ERP. La primera pestaña son
 * los clientes, así que redirige allí: la agrupación la dan las pestañas
 * compartidas (CatalogTabs), no una página contenedora.
 */
export default async function CatalogsPage() {
  const locale = await getLocale();
  redirect({ href: "/customers", locale });
}
