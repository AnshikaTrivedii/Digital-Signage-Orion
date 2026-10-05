import path from "path";
import type { NextConfig } from "next";

const amplifyCompute = Boolean(
  process.env.AWS_APP_ID || process.env.AMPLIFY_MONOREPO_APP_ROOT,
);

const repoRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  turbopack: {
    // Monorepo root so hoisted deps such as leaflet resolve under Next.js.
    root: repoRoot,
  },
  outputFileTracingRoot: repoRoot,
  ...(amplifyCompute ? { output: "standalone" as const } : {}),
};

export default nextConfig;
