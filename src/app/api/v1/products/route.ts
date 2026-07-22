import { getDb } from "@/db";
import { authenticateApiRequest, apiJson } from "@/features/platform/api";
import { listProductsWithStock } from "@/features/inventory/queries";

export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req);
  if (auth instanceof Response) return auth;
  const rows = await listProductsWithStock(getDb(), auth.orgId, {});
  return apiJson({ products: rows });
}
