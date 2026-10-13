import { existsSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const out = join(process.cwd(), "out");
if (!existsSync(out)) {
  console.error("pages-postbuild: missing out/ (did next build fail?)");
  process.exit(1);
}

// GitHub Pages runs Jekyll unless this file exists; Jekyll skips `_next`.
writeFileSync(join(out, ".nojekyll"), "");

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  });
}
const assets = filesIn(join(out, "_next", "static"));
const digest = createHash("sha256");
for (const file of assets) digest.update(readFileSync(file));
const workerPath = join(out, "sw.js");
let worker = readFileSync(workerPath, "utf8");
worker = worker.replace(/photonic-shell-v3/g, `photonic-shell-${digest.digest("hex").slice(0, 12)}`);
worker = worker.replace('const PRECACHE = [', `const PRECACHE = [\n${assets.map(file => JSON.stringify("./" + file.slice(out.length + 1).replaceAll("\\", "/"))).join(",\n")},`);
writeFileSync(workerPath, worker);
