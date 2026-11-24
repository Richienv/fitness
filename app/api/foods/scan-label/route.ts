// Stage 2 LLM structured nutrition-label extraction fallback.
// Called ONLY when Stage 1 (on-device PaddleOCR + deterministic regex rules)
// misses core fields, has low confidence, ambiguous layout, or user clicks AI assist.
// Every response passes through strict validation (`validateParsedNutrition`).
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import {
  NUTRITION_LLM_SYSTEM_PROMPT,
  validateParsedNutrition,
} from "@/lib/nutritionSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OcrBox = {
  text: string;
  bbox: [number, number, number, number];
  confidence: number;
};

type ScanLabelRequest = {
  ocrText?: string;
  boxes?: OcrBox[];
  imageDataUrl?: string;
  barcode?: string;
};

const userHits = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const list = (userHits.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 12) return true;
  list.push(now);
  userHits.set(userId, list);
  return false;
}

function detectProvider():
  | { kind: "gemini"; key: string }
  | { kind: "openai"; key: string }
  | { kind: "gateway"; key: string }
  | { kind: "anthropic"; key: string }
  | null {
  const gemini =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (gemini) return { kind: "gemini", key: gemini };
  if (process.env.OPENAI_API_KEY)
    return { kind: "openai", key: process.env.OPENAI_API_KEY };
  if (process.env.AI_GATEWAY_API_KEY)
    return { kind: "gateway", key: process.env.AI_GATEWAY_API_KEY };
  if (process.env.ANTHROPIC_API_KEY)
    return { kind: "anthropic", key: process.env.ANTHROPIC_API_KEY };
  return null;
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return JSON.parse(candidate.slice(start, end + 1));
}

function buildUserText(
  ocrText: string,
  boxes: OcrBox[],
  barcode?: string,
): string {
  const parts: string[] = [];
  if (barcode) parts.push(`Barcode: ${barcode}`);
  parts.push(`OCR text:\n${ocrText.slice(0, 6000) || "(empty OCR text)"}`);
  if (boxes.length > 0) {
    parts.push(
      `OCR bounding boxes [x1, y1, x2, y2]:\n${JSON.stringify(boxes.slice(0, 80))}`,
    );
  }
  return parts.join("\n\n");
}

function parseDataUrl(
  dataUrl: string | undefined,
): { mime: string; base64: string } | null {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  // Cap payload at ~1.5 MB base64 so requests stay fast and bounded.
  if (dataUrl.length > 2_000_000) return null;
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

async function callGemini(
  key: string,
  userText: string,
  image: { mime: string; base64: string } | null,
): Promise<unknown> {
  const parts: Record<string, unknown>[] = [{ text: userText }];
  if (image) {
    parts.push({
      inline_data: { mime_type: image.mime, data: image.base64 },
    });
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(18_000),
      body: JSON.stringify({
        system_instruction: { parts: [{ text: NUTRITION_LLM_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return extractJsonObject(text);
}

async function callOpenAiCompatible(
  endpoint: string,
  key: string,
  model: string,
  userText: string,
  imageDataUrl: string | null,
): Promise<unknown> {
  const content: unknown[] = [{ type: "text", text: userText }];
  if (imageDataUrl) {
    content.push({
      type: "image_url",
      image_url: { url: imageDataUrl, detail: "high" },
    });
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    signal: AbortSignal.timeout(18_000),
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: NUTRITION_LLM_SYSTEM_PROMPT },
        { role: "user", content },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return extractJsonObject(text);
}

async function callAnthropic(
  key: string,
  userText: string,
  image: { mime: string; base64: string } | null,
): Promise<unknown> {
  const content: unknown[] = [];
  if (image) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mime,
        data: image.base64,
      },
    });
  }
  content.push({ type: "text", text: userText });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(18_000),
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 900,
      temperature: 0,
      system: NUTRITION_LLM_SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const data = (await res.json()) as {
    content?: { type?: string; text?: string }[];
  };
  const text =
    data.content?.find((c) => c.type === "text")?.text ?? "";
  return extractJsonObject(text);
}

export async function GET() {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const provider = detectProvider();
  return NextResponse.json({
    available: provider !== null,
    provider: provider?.kind ?? null,
  });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Silakan masuk dulu." }, { status: 401 });

  const provider = detectProvider();
  if (!provider) {
    return NextResponse.json({
      ok: true,
      available: false,
      result: null,
    });
  }

  if (rateLimited(userId)) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan pembacaan AI. Coba lagi semenit." },
      { status: 429 },
    );
  }

  try {
    const body = (await req.json().catch(() => null)) as ScanLabelRequest | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
    }
    const ocrText = typeof body.ocrText === "string" ? body.ocrText : "";
    const boxes = Array.isArray(body.boxes)
      ? body.boxes.filter(
          (b): b is OcrBox =>
            !!b &&
            typeof b.text === "string" &&
            Array.isArray(b.bbox) &&
            b.bbox.length === 4,
        )
      : [];
    const parsedImage = parseDataUrl(body.imageDataUrl);
    if (!ocrText.trim() && !parsedImage) {
      return NextResponse.json(
        { error: "Teks OCR atau foto label diperlukan." },
        { status: 400 },
      );
    }

    const userText = buildUserText(ocrText, boxes, body.barcode);
    let rawJson: unknown;
    if (provider.kind === "gemini") {
      rawJson = await callGemini(provider.key, userText, parsedImage);
    } else if (provider.kind === "openai") {
      rawJson = await callOpenAiCompatible(
        "https://api.openai.com/v1/chat/completions",
        provider.key,
        "gpt-4o-mini",
        userText,
        parsedImage ? body.imageDataUrl! : null,
      );
    } else if (provider.kind === "gateway") {
      rawJson = await callOpenAiCompatible(
        "https://ai-gateway.vercel.sh/v1/chat/completions",
        provider.key,
        "google/gemini-2.5-flash",
        userText,
        parsedImage ? body.imageDataUrl! : null,
      );
    } else {
      rawJson = await callAnthropic(provider.key, userText, parsedImage);
    }

    const validated = validateParsedNutrition(rawJson, ocrText);
    if (!validated) {
      return NextResponse.json(
        {
          ok: false,
          available: true,
          error: "Respons AI tidak sesuai format nutrisi yang diharapkan.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      ok: true,
      available: true,
      provider: provider.kind,
      result: validated,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        available: true,
        error:
          e instanceof Error
            ? `Pembacaan AI gagal sementara: ${e.message}`
            : "Pembacaan AI gagal sementara.",
      },
      { status: 502 },
    );
  }
}
