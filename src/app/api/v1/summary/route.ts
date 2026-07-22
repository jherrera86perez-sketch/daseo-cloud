import { getDb } from "@/db";
import { authenticateApiRequest, apiJson } from "@/features/platform/api";
import { getDashboard } from "@/features/dashboard/queries";

export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req);
  if (auth instanceof Response) return auth;
  const data = await getDashboard(getDb(), auth.orgId);
  return apiJson({ summary: data });
}
