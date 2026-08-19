import type { NextConfig } from "next";
import { resolveGithubPagesBasePath } from "./src/lib/base-path";

const basePath = resolveGithubPagesBasePath({
  NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH,
  GITHUB_PAGES: process.env.GITHUB_PAGES,
  GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
});

process.env.NEXT_PUBLIC_BASE_PATH = basePath;

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  ...(basePath
    ? {
        basePath,
        assetPrefix: basePath,
      }
    : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
