import { ProfileSchema, type McpProfile } from "./mcpSchemas.ts";

export type McpCallerProfile = McpProfile;

export type McpAuthContext = {
  caller: McpCallerProfile;
  /** Richie's token can explicitly target "renita" when instructed; Renita's token is locked to "renita". */
  allowProfileOverride: boolean;
  tokenEnvName:
    | "R2FIT_MCP_API_KEY"
    | "R2FIT_MCP_API_KEY_RICHIE"
    | "R2FIT_MCP_API_KEY_RENITA";
};

export class McpAuthAccessError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

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

function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function configuredTokenEntries(): Array<{
  value: string;
  caller: McpCallerProfile;
  allowProfileOverride: boolean;
  tokenEnvName: McpAuthContext["tokenEnvName"];
}> {
  const list: Array<{
    value: string;
    caller: McpCallerProfile;
    allowProfileOverride: boolean;
    tokenEnvName: McpAuthContext["tokenEnvName"];
  }> = [];
  const candidates: Array<[McpAuthContext["tokenEnvName"], McpCallerProfile, boolean]> = [
    ["R2FIT_MCP_API_KEY", "richie", true],
    ["R2FIT_MCP_API_KEY_RICHIE", "richie", true],
    ["R2FIT_MCP_API_KEY_RENITA", "renita", false],
  ];
  for (const [envName, caller, allowProfileOverride] of candidates) {
    const val = (process.env[envName] ?? "").trim();
    if (val) {
      list.push({ value: val, caller, allowProfileOverride, tokenEnvName: envName });
    }
  }
  return list;
}

/** Resolve which profile token authenticated the request, or null if invalid/missing. */
export function resolveMcpAuth(req: Request): McpAuthContext | null {
  const supplied = readSuppliedMcpToken(req);
  if (!supplied) return null;
  const entries = configuredTokenEntries();
  let matched: McpAuthContext | null = null;
  for (const entry of entries) {
    if (constantTimeEqual(entry.value, supplied) && !matched) {
      matched = {
        caller: entry.caller,
        allowProfileOverride: entry.allowProfileOverride,
        tokenEnvName: entry.tokenEnvName,
      };
    }
  }
  return matched;
}

/** Timing-safe verification against any configured R2FIT_MCP_API_KEY* env var. */
export function hasMcpApiKey(req: Request): boolean {
  return resolveMcpAuth(req) !== null;
}

/** Resolve the effective target profile from an optional requested profile + caller token context. */
export function enforceMcpProfileAccess(
  requestedProfile: unknown,
  auth?: McpAuthContext,
): {
  profile: McpProfile;
  detectedBy: "token" | "argument" | "default";
} {
  const omitted =
    requestedProfile === undefined ||
    requestedProfile === null ||
    (typeof requestedProfile === "string" && requestedProfile.trim() === "");

  if (omitted) {
    return auth
      ? { profile: auth.caller, detectedBy: "token" }
      : { profile: "richie", detectedBy: "default" };
  }

  const parsed = ProfileSchema.safeParse(requestedProfile);
  if (!parsed.success) {
    throw new McpAuthAccessError(
      400,
      "invalid_profile",
      `Unsupported profile "${String(requestedProfile)}". Allowed profiles: richie, renita.`,
    );
  }
  const explicit = parsed.data;
  if (auth && !auth.allowProfileOverride && explicit !== auth.caller) {
    throw new McpAuthAccessError(
      403,
      "forbidden",
      `Access denied: token belongs to profile "${auth.caller}" and cannot read or write profile "${explicit}".`,
    );
  }
  return {
    profile: explicit,
    detectedBy: auth && explicit === auth.caller ? "token" : "argument",
  };
}

/** Scan single or batched JSON-RPC payloads for tools/call profile overrides blocked by auth. */
export function findForbiddenRpcProfileError(
  body: unknown,
  auth: McpAuthContext,
): McpAuthAccessError | null {
  const messages = Array.isArray(body) ? body : [body];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg as { method?: unknown; params?: unknown };
    if (m.method !== "tools/call" || !m.params || typeof m.params !== "object") continue;
    const args = (m.params as { arguments?: unknown }).arguments;
    if (!args || typeof args !== "object") continue;
    const reqProfile = (args as { profile?: unknown }).profile;
    try {
      enforceMcpProfileAccess(reqProfile, auth);
    } catch (err) {
      if (err instanceof McpAuthAccessError && err.status === 403) {
        return err;
      }
    }
  }
  return null;
}

/** Enforce R2FIT_MCP_API_KEY* authentication and return caller context. */
export function authenticateMcpRequest(req: Request): {
  auth: McpAuthContext | null;
  error: Response | null;
} {
  if (configuredTokenEntries().length === 0) {
    return {
      auth: null,
      error: Response.json(
        {
          ok: false,
          error: "mcp_not_configured",
          message: "R2FIT_MCP_API_KEY is not configured on the server.",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }
  const auth = resolveMcpAuth(req);
  if (!auth) {
    return {
      auth: null,
      error: Response.json(
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
      ),
    };
  }
  return { auth, error: null };
}

/** Backwards-compatible wrapper returning Response on failure or null when authenticated. */
export function requireMcpAuth(req: Request): Response | null {
  return authenticateMcpRequest(req).error;
}
