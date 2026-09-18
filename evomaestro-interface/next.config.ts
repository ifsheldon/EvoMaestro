import path from "node:path";
import type { NextConfig } from "next";

const apiTarget = process.env.API_PROXY ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  ...(process.env.EVOMAESTRO_STANDALONE === "1" && {
    output: "standalone",
    outputFileTracingRoot: path.join(__dirname, ".."),
  }),
  serverExternalPackages: ["@openai/codex-sdk", "@openai/codex"],
  rewrites: async () => ({
    // Next.js API routes (src/app/api/) are checked first.
    // Only unmatched /api/* requests fall through to the backend proxy.
    beforeFiles: [],
    afterFiles: [],
    fallback: [
      {
        source: "/api/:path*",
        destination: `${apiTarget}/:path*`,
      },
    ],
  }),
};

export default nextConfig;
