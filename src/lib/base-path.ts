/** Empty locally. `/repo` on GitHub Pages project sites (set at build time). */
export function resolveGithubPagesBasePath(env: {
  NEXT_PUBLIC_BASE_PATH?: string;
  GITHUB_PAGES?: string;
  GITHUB_REPOSITORY?: string;
}) {
  if (env.NEXT_PUBLIC_BASE_PATH !== undefined) {
    return env.NEXT_PUBLIC_BASE_PATH.replace(/\/$/, "");
  }
  if (env.GITHUB_PAGES === "true") {
    const repo = env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
    if (!repo || repo.endsWith(".github.io")) return "";
    return `/${repo}`;
  }
  return "";
}

export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

export function withBase(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}
