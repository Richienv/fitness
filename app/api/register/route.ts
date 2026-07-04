import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const o = (body ?? {}) as Record<string, unknown>;
  const email = String(o.email ?? "").trim().toLowerCase();
  const password = String(o.password ?? "");
  const name = String(o.name ?? "").trim() || null;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Email tidak valid" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password minimal 8 karakter" },
      { status: 400 }
    );
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "Email sudah terdaftar" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.user.create({
    data: { email, name, passwordHash },
  });

  return NextResponse.json({ ok: true, userId: user.id });
}
