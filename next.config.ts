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
  transpilePackages: ["heic-decode", "libheif-js"],
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
      module: false,
    };
    // libheif-js wraps `require` in a Proxy for Node; webpack cannot statically
    // extract that. The browser bundle never calls it (fs/path are stubbed above).
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /node_modules[/\\]libheif-js/,
        message: /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/,
      },
    ];
    return config;
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
