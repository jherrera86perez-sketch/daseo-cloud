import { getDb } from "@/db";
import { authenticateApiRequest, apiJson } from "@/features/platform/api";
import { listCustomers } from "@/features/customers/queries";

export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req);
  if (auth instanceof Response) return auth;
  const rows = await listCustomers(getDb(), auth.orgId, {});
  return apiJson({ customers: rows });
}
