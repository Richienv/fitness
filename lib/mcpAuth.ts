/** Extract Bearer token or x-api-key header cleanly without logging secrets. */
export function readSuppliedMcpToken(req: Request): string {
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (bearerMatch && bearerMatch[1]) {
    return bearerMatch[1].trim();
  }
  const apiKey = req.headers.get("x-api-key") ?? "";
  return apiKey.trim();
}

/** Timing-safe constant-length comparison against process.env.R2FIT_MCP_API_KEY. */
export function hasMcpApiKey(req: Request): boolean {
  const expected = (process.env.R2FIT_MCP_API_KEY ?? "").trim();
  if (!expected) return false;
  const supplied = readSuppliedMcpToken(req);
  if (!supplied || supplied.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  }
  return diff === 0;
}

/** Enforce R2FIT_MCP_API_KEY Bearer authentication on MCP & REST automation routes. */
export function requireMcpAuth(req: Request): Response | null {
  const configured = (process.env.R2FIT_MCP_API_KEY ?? "").trim();
  if (!configured) {
    return Response.json(
      {
        ok: false,
        error: "mcp_not_configured",
        message: "R2FIT_MCP_API_KEY is not configured on the server.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!hasMcpApiKey(req)) {
    return Response.json(
      {
        ok: false,
        error: "unauthorized",
        message: "Invalid or missing Authorization: Bearer <R2FIT_MCP_API_KEY> token.",
      },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
          "WWW-Authenticate": 'Bearer realm="r2fit-mcp"',
        },
      },
    );
  }
  return null;
}
