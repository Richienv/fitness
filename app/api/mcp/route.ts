// Streamable HTTP MCP endpoint for R2 Fit (`https://r2-fit.vercel.app/api/mcp`).
// Secured across all methods by Authorization: Bearer <R2FIT_MCP_API_KEY>.
import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { requireMcpAuth } from "@/lib/mcpAuth";
import { createR2FitMcpServer } from "@/lib/mcpServer";
import {
  r2fitGetTodaySummary,
  r2fitLogMeal,
  r2fitLogWorkout,
  r2fitUpdateOrDeleteEntry,
} from "@/lib/mcpService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, x-api-key, Accept, Mcp-Session-Id, Last-Event-ID",
  "Cache-Control": "no-store",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) {
    headers.set(k, v);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function normalizeAcceptForMcp(req: Request): Request {
  const rawAccept = req.headers.get("accept") ?? "";
  if (rawAccept.includes("application/json") && rawAccept.includes("text/event-stream")) {
    return req;
  }
  const headers = new Headers(req.headers);
  headers.set("accept", "application/json, text/event-stream");
  return new Request(req, { headers });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

async function handleMcpRequest(req: Request): Promise<Response> {
  const authErr = requireMcpAuth(req);
  if (authErr) return withCors(authErr);

  const server = createR2FitMcpServer({
    logMeal: r2fitLogMeal,
    logWorkout: r2fitLogWorkout,
    getTodaySummary: r2fitGetTodaySummary,
    updateOrDeleteEntry: r2fitUpdateOrDeleteEntry,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    let parsedBody: unknown = undefined;
    if (req.method === "POST") {
      try {
        parsedBody = await req.json();
      } catch {
        return withCors(
          NextResponse.json(
            { jsonrpc: "2.0", error: { code: -32700, message: "Parse error: Invalid JSON" }, id: null },
            { status: 400 },
          ),
        );
      }
    }
    const normalizedReq = normalizeAcceptForMcp(req);
    const res = await transport.handleRequest(
      normalizedReq,
      parsedBody !== undefined ? { parsedBody } : undefined,
    );
    return withCors(res);
  } catch (err) {
    return withCors(
      NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32603, message: err instanceof Error ? err.message : "Internal MCP error" },
          id: null,
        },
        { status: 500 },
      ),
    );
  } finally {
    await server.close().catch(() => {});
  }
}

export async function POST(req: Request) {
  return handleMcpRequest(req);
}

export async function GET(req: Request) {
  return handleMcpRequest(req);
}

export async function DELETE(req: Request) {
  return handleMcpRequest(req);
}
