"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Clase .dark en <html> (ver @custom-variant en globals.css); el tema del
// sistema es el default y la elección persiste en localStorage.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
