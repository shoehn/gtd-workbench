import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // A self-contained server in .next/standalone for the container image (step 10).
  output: 'standalone',
};

export default nextConfig;
