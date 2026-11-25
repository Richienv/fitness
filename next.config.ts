import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/foods/**": ["./data/*.csv"],
  },
  async headers() {
    return [
      {
        source: "/ocr/paddle-v1/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ];
  },
};

export default config;
