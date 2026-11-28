import { withMcpRestRoute } from "@/lib/mcpHttp";
import { r2fitGetTodaySummary } from "@/lib/mcpService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMcpRestRoute(req, "summary_failed", async (auth) => {
    const url = new URL(req.url);
    const profile = url.searchParams.get("profile") || undefined;
    const date = url.searchParams.get("date") || undefined;
    return r2fitGetTodaySummary(
      { ...(profile ? { profile } : {}), ...(date ? { date } : {}) },
      auth,
    );
  });
}
