// Guard for routes that must be key-protected but which middleware does NOT
// cover.
//
// middleware.ts only enforces R2_FIT_API_KEY on MUTATIONS to non-public paths:
//
//     if (isPublic || !isMutation) return NextResponse.next();
//
// so any GET sails through with no key. That is fine for routes that gate
// themselves on a session (getUserId) or a signed token (widget), but a GET
// that resolves a FIXED user — e.g. the Hermes owner — and returns their data
// has no gate at all unless it checks here.

/** True when the request carries the Hermes api key (x-api-key or Bearer). */
export function hasApiKey(req: Request): boolean {
  const expected = (process.env.R2_FIT_API_KEY ?? "").trim();
  if (!expected) return false;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supplied = (req.headers.get("x-api-key") ?? bearer ?? "").trim();
  if (!supplied || supplied.length !== expected.length) return false;
  // Length-constant compare, so a timing signal can't reveal the key byte by
  // byte. (Length is already known-equal by the check above.)
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  }
  return diff === 0;
}
