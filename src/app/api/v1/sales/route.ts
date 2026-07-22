import { getDb } from "@/db";
import { authenticateApiRequest, apiJson } from "@/features/platform/api";
import { listSales } from "@/features/sales/queries";

export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req);
  if (auth instanceof Response) return auth;
  const rows = await listSales(getDb(), auth.orgId);
  return apiJson({ sales: rows });
}
