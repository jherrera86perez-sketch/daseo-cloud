"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/*
 * ModalPortal portado del ERP CubaOne (`src/components/ModalPortal.tsx`).
 *
 * Monta el diálogo en <body> para escapar de los contextos de apilamiento que
 * crean los ancestros con `transform`, `filter` u `overflow: hidden` (una Card,
 * sin ir más lejos). Sin esto el backdrop no cubre el viewport.
 *
 * La detección de montaje va con useSyncExternalStore y no con
 * `useState`+`useEffect`: el lint de React 19 prohíbe setState en effect. Es el
 * mismo patrón que ya usa `theme-provider.tsx`.
 */
const emptySubscribe = () => () => {};

export function ModalPortal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!mounted) return null;
  return createPortal(children, document.body);
}
