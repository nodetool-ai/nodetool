import { test, expect } from "@playwright/test";
import { registryModules } from "../../src/data/registry";

// Coverage is derived from the page-data registry: every indexable route is
// smoke-tested, except that engines flagged with `sample` (hundreds of pages)
// contribute only their first N indexable entries — hub pages first.
const ROUTES = registryModules.flatMap((m) => {
  const indexable = m.entries.filter((e) => e.indexable);
  const sampled = m.sample ? indexable.slice(0, m.sample) : indexable;
  return sampled.map((e) => e.route);
});

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
