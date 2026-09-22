import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Monorepo root so hoisted deps such as leaflet resolve under Next.js.
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
