import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("out");
const base = process.env.PHOTONIC_BASE_PATH || "";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json", ".json": "application/json" };
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (base && !url.pathname.startsWith(base + "/")) { response.writeHead(302, { Location: base + "/" }); response.end(); return; }
    let pathname = decodeURIComponent(url.pathname.slice(base.length));
    let path = resolve(root, "." + pathname);
    if (path !== root && !path.startsWith(root + sep)) throw new Error("path");
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
    response.writeHead(200, { "Content-Type": types[extname(path)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(await readFile(path));
  } catch { response.writeHead(404); response.end("Not found"); }
}).listen(3000, "0.0.0.0", () => console.log("Photonic ready on port 3000"));
