import { getDb } from "@/db";
import { resolveApiKey } from "./queries";

/**
 * API pública /api/v1 — autenticación por API key (Authorization: Bearer dsk_…).
 * Read-only en esta versión; reutiliza la capa de queries de cada módulo.
 */

export async function authenticateApiRequest(
  req: Request,
): Promise<{ orgId: string } | Response> {
  const auth = req.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!key) {
    return Response.json(
      { error: "Falta Authorization: Bearer dsk_…" },
      { status: 401 },
    );
  }
  const resolved = await resolveApiKey(getDb(), key);
  if (!resolved) {
    return Response.json(
      { error: "API key inválida o revocada" },
      { status: 401 },
    );
  }
  return { orgId: resolved.orgId };
}

/** JSON.stringify con bigint → string (los centavos viajan como string). */
export function apiJson(data: unknown, init?: ResponseInit): Response {
  const body = JSON.stringify(data, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  return new Response(body, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}
