import { withMcpRestRoute } from "@/lib/mcpHttp";
import { r2fitLogMeal } from "@/lib/mcpService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withMcpRestRoute(req, "log_meal_failed", async (auth) => {
    const body = await req.json();
    return r2fitLogMeal(body, auth);
  });
}
