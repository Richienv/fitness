import { NextResponse } from "next/server";
import { requireMcpAuth } from "@/lib/mcpAuth";
import { McpServiceError, r2fitUpdateOrDeleteEntry } from "@/lib/mcpService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const authErr = requireMcpAuth(req);
  if (authErr) return authErr;

  try {
    const body = await req.json();
    const data = await r2fitUpdateOrDeleteEntry(body);
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof McpServiceError) {
      return NextResponse.json(
        { ok: false, error: err.code, message: err.message },
        { status: err.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, error: "entry_mutation_failed", message: (err as Error).message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
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
