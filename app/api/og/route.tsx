import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = searchParams.get("days") || "75";

  return new ImageResponse(
    (
      <div
        style={{
          background: "#0a0a0a",
          width: "1200px",
          height: "630px",
          display: "flex",
          alignItems: "center",
          padding: "80px",
          borderLeft: "12px solid #e8ff47",
          fontFamily: "Impact, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: "140px",
              color: "#f0f0f0",
              lineHeight: 0.9,
              marginBottom: "32px",
              letterSpacing: "-2px",
              display: "flex",
            }}
          >
            R2<span style={{ color: "#e8ff47" }}>·</span>FIT
          </div>
          <div
            style={{
              fontSize: "44px",
              color: "#aaaaaa",
              fontFamily: "sans-serif",
              marginBottom: "20px",
              display: "flex",
            }}
          >
            {days} days before meet-up.
          </div>
          <div
            style={{
              fontSize: "22px",
              color: "#555555",
              fontFamily: "monospace",
              letterSpacing: "4px",
              display: "flex",
            }}
          >
            TRAIN HARD. TRACK SHARP. STAY LEAN.
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
