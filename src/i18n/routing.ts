import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["es", "pt"],
  defaultLocale: "es",
  // "/" sirve español; "/pt" sirve portugués
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
