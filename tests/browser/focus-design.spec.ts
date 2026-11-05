import { test, expect } from "@playwright/test";
import path from "node:path";

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(
    (theme) =>
      localStorage.setItem("photonic:v1", JSON.stringify({ settingsRev: 3, theme, locale: "ru", printUnit: "mm" })),
    testInfo.project.name.endsWith("dark") ? "dark" : "light",
  );
  await page.goto("./");
});

test("Focus interface keeps the primary workflow readable on desktop and phone", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name.startsWith("mobile");
  await expect(page.getByRole("link", { name: "Photonic", exact: true })).toBeVisible();
  await expect(page.locator(".brand-symbol")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Новый размер. Тот же снимок." })).toBeVisible();

  const steps = page.getByRole("list", { name: "Три шага изменения размера" });
  if (mobile) await expect(steps).toBeHidden();
  else await expect(steps).toBeVisible();

  const open = page.getByRole("button", { name: "Открыть изображения", exact: true });
  await expect(open).toBeVisible();
  const openBox = await open.boundingBox();
  expect(openBox).not.toBeNull();
  expect(openBox!.height).toBeGreaterThanOrEqual(34);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  const tokenContrast = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    function luminance(hex: string) {
      const rgb = hex.replace("#", "").match(/.{2}/g)!.map((component) => parseInt(component, 16) / 255);
      const linear = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    }
    const a = luminance(css.getPropertyValue("--signal").trim());
    const b = luminance(css.getPropertyValue("--plate").trim());
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(tokenContrast).toBeGreaterThanOrEqual(4.5);

  await page.getByRole("button", { name: "Lab", exact: true }).click();
  await expect(page.getByRole("button", { name: "Lab", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Studio", exact: true }).click();

  await page.locator('input[type="file"]').setInputFiles(path.resolve("public/samples/pixel.png"));
  await expect(page.getByRole("button", { name: "Скачать", exact: true })).toBeEnabled();
  await expect(page.locator(".section-step")).toHaveCount(3);

  const box = await page.getByRole("button", { name: "Скачать", exact: true }).boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
