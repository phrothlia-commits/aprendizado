import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Os prompts de sistema ficam em /prompts e são lidos pelas rotas de IA.
  outputFileTracingIncludes: {
    "/api/**": ["./prompts/**"],
  },
  cacheComponents: true,
  partialPrefetching: true,
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
