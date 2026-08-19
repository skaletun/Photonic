import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");

function markSvg(size, insetRatio) {
  const pad = size * insetRatio;
  const inner = size - pad * 2;
  const stroke = Math.max(8, inner * 0.055);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.12}" fill="#101214"/>
  <path d="M${pad + inner * 0.08} ${pad + inner * 0.68}
    C ${pad + inner * 0.28} ${pad + inner * 0.12},
      ${pad + inner * 0.42} ${pad + inner * 0.88},
      ${pad + inner * 0.5} ${pad + inner * 0.42}
    S ${pad + inner * 0.78} ${pad + inner * 0.82},
      ${pad + inner * 0.92} ${pad + inner * 0.32}"
    fill="none" stroke="#3D9A90" stroke-width="${stroke}" stroke-linecap="round"/>
</svg>`);
}

async function writePng(name, size, insetRatio) {
  await sharp(markSvg(size, insetRatio)).png().toFile(join(outDir, name));
}

await mkdir(outDir, { recursive: true });
await writePng("icon-192.png", 192, 0.12);
await writePng("icon-512.png", 512, 0.12);
await writePng("icon-maskable-512.png", 512, 0.22);
await writePng("apple-touch-icon.png", 180, 0.12);
console.log("Wrote PWA icons to public/icons");
