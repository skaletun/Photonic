import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveGithubPagesBasePath, withBase } from "@/lib/base-path";

test("local and default CI builds have no base path", () => {
  assert.equal(resolveGithubPagesBasePath({}), "");
});

test("project Pages site uses /repo", () => {
  assert.equal(
    resolveGithubPagesBasePath({
      GITHUB_PAGES: "true",
      GITHUB_REPOSITORY: "acme/Photonic",
    }),
    "/Photonic",
  );
});

test("user Pages site stays at the domain root", () => {
  assert.equal(
    resolveGithubPagesBasePath({
      GITHUB_PAGES: "true",
      GITHUB_REPOSITORY: "acme/acme.github.io",
    }),
    "",
  );
});

test("NEXT_PUBLIC_BASE_PATH wins, including empty custom-domain root", () => {
  assert.equal(
    resolveGithubPagesBasePath({
      NEXT_PUBLIC_BASE_PATH: "",
      GITHUB_PAGES: "true",
      GITHUB_REPOSITORY: "acme/Photonic",
    }),
    "",
  );
  assert.equal(
    resolveGithubPagesBasePath({ NEXT_PUBLIC_BASE_PATH: "/tools/" }),
    "/tools",
  );
});

test("withBase is identity when this process has no Pages prefix", () => {
  assert.equal(withBase("/sw.js"), "/sw.js");
  assert.equal(withBase("icons/icon-192.png"), "/icons/icon-192.png");
});
