import { withMcpRestRoute } from "@/lib/mcpHttp";
import { r2fitLogWorkout } from "@/lib/mcpService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withMcpRestRoute(req, "log_workout_failed", async (auth) => {
    const body = await req.json();
    return r2fitLogWorkout(body, auth);
  });
}
