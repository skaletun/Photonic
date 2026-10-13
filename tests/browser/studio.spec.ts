import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { readFile } from "node:fs/promises";
const fixture = path.resolve("tests/fixtures/transparent.png");
async function ready(page: Page) { await expect(page.getByRole("button", { name: "Скачать", exact: true })).toBeEnabled(); }
async function tab(page: Page, label: string) { const item = page.getByRole("tab", { name: label, exact: true }); if (await item.isVisible()) await item.click(); }
async function upload(page: Page, files = [fixture]) { await page.locator('input[type="file"]').setInputFiles(files); await ready(page); }

test.beforeEach(async ({ page }, testInfo) => {
 await page.addInitScript(theme => localStorage.setItem("photonic:v1", JSON.stringify({ settingsRev: 3, theme, locale: "ru", printUnit: "mm" })), testInfo.project.name.endsWith("dark") ? "dark" : "light");
 await page.goto("./"); await expect(page.getByRole("heading", { name: "Новый размер. Тот же снимок." })).toBeVisible();
});

test("layout, sample loading, both themes and accessible export", async ({ page }, testInfo) => {
 const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
 await page.screenshot({ path: testInfo.outputPath("empty.png"), animations: "disabled" });
 // Empty samples may be hidden on a compact viewport; file import stays available.
 const sample = page.getByRole("button", { name: "Фото · обычный снимок", exact: true });
 if (await sample.isVisible()) await sample.click(); else await page.locator('input[type="file"]').setInputFiles(path.resolve("public/samples/photo.jpg"));
 await ready(page);
 const button = page.getByRole("button", { name: "Скачать", exact: true });
 const rect = await button.boundingBox(); const viewport = page.viewportSize()!;
 expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
 expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.screenshot({ path: testInfo.outputPath("workspace.png"), animations: "disabled" });
 expect(errors).toEqual([]);
});

test("transparent PNG to JPEG uses the selected background", async ({ page }) => {
 await upload(page); await tab(page,"Экспорт");
 await page.getByLabel("Тип файла", { exact: true }).selectOption("jpeg");
 await page.getByLabel("Фон JPEG", { exact: true }).fill("#ffffff");
 const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Скачать", exact: true }).click();
 const saved = await download; expect(saved.suggestedFilename()).toMatch(/\.jpg$/);
 const bytes = await readFile((await saved.path())!);
 const rgb = await page.evaluate(async base64 => {
  const response = await fetch(`data:image/jpeg;base64,${base64}`); const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!; ctx.drawImage(bitmap,0,0); const pixel = ctx.getImageData(0,0,1,1).data; bitmap.close(); return Array.from(pixel);
 }, bytes.toString("base64"));
 expect(rgb[0]).toBeGreaterThan(240); expect(rgb[1]).toBeGreaterThan(240); expect(rgb[2]).toBeGreaterThan(240);
});

test("append, reorder, remove, batch ZIP and return to the visible document", async ({ page }) => {
 await upload(page); await upload(page,[fixture]);
 const items = page.locator(".document"); await expect(items).toHaveCount(2);
 await items.nth(1).getByRole("button",{name:"Переместить раньше"}).click();
 await expect(items.nth(1).locator(".document-select")).toHaveAttribute("aria-current","true");
 const download=page.waitForEvent("download"); await page.getByRole("button",{name:"Скачать все в ZIP",exact:true}).click();
 const saved=await download; const bytes=await readFile((await saved.path())!);
 expect(saved.suggestedFilename()).toMatch(/\.zip$/); expect(bytes.readUInt16LE(6)&0x800).toBe(0x800);
 expect(bytes.toString()).toContain("transparent-32x32-photonic-2.png");
 await ready(page); await items.nth(0).getByRole("button",{name:"Убрать из списка"}).click(); await expect(items).toHaveCount(1);
 await expect(page.locator(".document-title strong")).toHaveText("transparent.png");
});

test("saved size preset, history and reload", async ({ page }) => {
 await upload(page); await tab(page,"Размер");
 await page.getByLabel("Ширина, px",{exact:true}).fill("64"); await ready(page);
 await page.getByText("Сохранённые пресеты",{exact:true}).click();
 await page.getByLabel("Название пресета",{exact:true}).fill("Двойной размер"); await page.getByRole("button",{name:"Сохранить пресет",exact:true}).click();
 await page.getByLabel("Ширина, px",{exact:true}).fill("96"); await ready(page);
 await page.getByRole("button",{name:/Двойной размер/}).click(); await expect(page.getByLabel("Ширина, px",{exact:true})).toHaveValue("64");
 await page.getByRole("button",{name:"Отменить",exact:true}).click(); await expect(page.getByLabel("Ширина, px",{exact:true})).toHaveValue("96");
 await page.reload(); await upload(page); await tab(page,"Размер"); await page.getByText("Сохранённые пресеты",{exact:true}).click();
 await expect(page.getByRole("button",{name:/Двойной размер/})).toBeVisible();
});

test("comparison, kernel grid and encoded preview", async ({ page },testInfo) => {
 await upload(page); await page.getByRole("button",{name:"Два метода",exact:true}).click(); await ready(page);
 await page.getByRole("button",{name:"Все методы",exact:true}).click(); await ready(page);
 await expect(page.locator(".compare-cell")).toHaveCount(7);
 await page.screenshot({path:testInfo.outputPath("lab.png"),animations:"disabled"});
 await page.getByRole("button",{name:"До / после",exact:true}).click(); await ready(page); await tab(page,"Экспорт");
 await page.getByRole("button",{name:"Предпросмотр сжатия",exact:true}).click(); await expect(page.locator(".compression-dialog")).toBeVisible();
 await page.locator(".compression-dialog").getByRole("button",{name:"Закрыть"}).click();
});

test("failed batch files stay retryable and preserve the active source",async({page})=>{
 await upload(page);await page.locator('input[type="file"]').setInputFiles({name:"broken.png",mimeType:"image/png",buffer:Buffer.from("broken image")});
 const download=page.waitForEvent("download");await page.getByRole("button",{name:"Скачать все в ZIP",exact:true}).click();await download;await ready(page);
 await expect(page.locator('.document[data-status="error"]')).toHaveCount(1);
 await expect(page.getByRole("button",{name:"Повторить неудачные",exact:true})).toBeEnabled();
 await expect(page.locator(".document-title strong")).toHaveText("transparent.png");
});

test("installed shell opens offline without caching source images",async({page,context})=>{
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.reload();await expect(page.getByRole("heading",{name:"Новый размер. Тот же снимок."})).toBeVisible();
 await context.setOffline(true);await page.reload();await expect(page.getByRole("heading",{name:"Новый размер. Тот же снимок."})).toBeVisible();
 const cached=await page.evaluate(async()=>{const keys=await caches.keys();const all=await Promise.all(keys.filter(key=>key.startsWith("photonic-shell-")).map(async key=>(await (await caches.open(key)).keys()).map(req=>req.url)));return all.flat();});
 expect(cached.some(url=>url.startsWith("blob:"))).toBe(false);
});
