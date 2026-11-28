import { NextResponse } from "next/server";
import { authenticateMcpRequest, type McpAuthContext } from "./mcpAuth";
import { McpServiceError } from "./mcpService";

const NO_STORE = { "Cache-Control": "no-store" };

export async function withMcpRestRoute(
  req: Request,
  fallbackErrorCode: string,
  handler: (auth: McpAuthContext) => Promise<unknown>,
): Promise<Response> {
  const { auth, error } = authenticateMcpRequest(req);
  if (error || !auth) return error!;

  try {
    const data = await handler(auth);
    return NextResponse.json({ ok: true, data }, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof McpServiceError) {
      return NextResponse.json(
        { ok: false, error: err.code, message: err.message },
        { status: err.status, headers: NO_STORE },
      );
    }
    return NextResponse.json(
      { ok: false, error: fallbackErrorCode, message: (err as Error).message },
      { status: 500, headers: NO_STORE },
    );
  }
}
