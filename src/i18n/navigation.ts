import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Reemplazan a los de next/link y next/navigation en todo el código de app
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
