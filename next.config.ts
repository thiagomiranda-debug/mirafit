import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.15"],
  turbopack: {
    resolveAlias: {
      tailwindcss: path.resolve("./node_modules/tailwindcss"),
    },
  },
};

export default nextConfig;
