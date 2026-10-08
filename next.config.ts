import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large API requests (image upload)
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  // Required for Tailwind CSS v4 in Next.js 16+ Turbopack
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
