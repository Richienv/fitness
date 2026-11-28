import { withMcpRestRoute } from "@/lib/mcpHttp";
import { r2fitUpdateOrDeleteEntry } from "@/lib/mcpService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  return withMcpRestRoute(req, "entry_mutation_failed", async (auth) => {
    const body = await req.json();
    return r2fitUpdateOrDeleteEntry(body, auth);
  });
}

export async function POST(req: Request) {
  return handle(req);
}

export async function PATCH(req: Request) {
  return handle(req);
}

export async function DELETE(req: Request) {
  return handle(req);
}
