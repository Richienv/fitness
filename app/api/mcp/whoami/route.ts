import { withMcpRestRoute } from "@/lib/mcpHttp";
import { r2fitWhoAmI } from "@/lib/mcpService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withMcpRestRoute(req, "whoami_failed", async (auth) => {
    const url = new URL(req.url);
    const profile = url.searchParams.get("profile") || undefined;
    return r2fitWhoAmI(profile ? { profile } : {}, auth);
  });
}
