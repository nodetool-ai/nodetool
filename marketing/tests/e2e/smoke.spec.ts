import { test, expect } from "@playwright/test";

const ROUTES = [
  "/",
  "/studio",
  "/cloud",
  "/agents",
  "/developers",
  "/creatives",
  "/pricing",
  "/vs/comfyui",
  "/vs/weavy",
];

test.describe("marketing smoke", () => {
  for (const path of ROUTES) {
    test(`${path} renders with a NodeTool title and exactly one h1`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status() ?? 0).toBeLessThan(400);
      await expect(page).toHaveTitle(/NodeTool/i);
      // SSR/SEO regression guard: exactly one <h1> per page (P1/P6).
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toBeVisible();
    });
  }

  test("shared header exposes the global nav (Pricing + Docs)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Pricing" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Docs" }).first()).toBeVisible();
  });

  test("homepage has a working download CTA", async ({ page }) => {
    await page.goto("/");
    const cta = page.getByRole("link", { name: /download nodetool/i }).first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /github\.com\/nodetool-ai\/nodetool/);
  });

  test("homepage ships JSON-LD structured data", async ({ page }) => {
    await page.goto("/");
    const ld = page.locator('script[type="application/ld+json"]');
    expect(await ld.count()).toBeGreaterThan(0);
  });

  test("no hidden duplicate-H1 SEO block remains", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sr-only-seo")).toHaveCount(0);
  });
});
