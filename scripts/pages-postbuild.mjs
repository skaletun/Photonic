import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = join(process.cwd(), "out");
if (!existsSync(out)) {
  console.error("pages-postbuild: missing out/ (did next build fail?)");
  process.exit(1);
}

// GitHub Pages runs Jekyll unless this file exists; Jekyll skips `_next`.
writeFileSync(join(out, ".nojekyll"), "");
