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

  test("search opportunity pages expose targeted metadata and links", async ({ page }) => {
    await page.goto("/alternatives/comfyui");
    await expect(page).toHaveTitle("Easier ComfyUI Alternatives for Mac | NodeTool");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Easier ComfyUI Alternatives for Mac | NodeTool",
    );

    await page.goto("/alternatives/lm-studio");
    await expect(page).toHaveTitle(
      "LM Studio Alternatives for Local AI Workflows | NodeTool",
    );

    await page.goto("/alternatives/figma-weave");
    await expect(page).toHaveTitle(
      "Figma Weave Alternative: Open-Source, Self-Hosted | NodeTool",
    );

    await page.goto("/alternatives/weavy");
    await expect(page).toHaveTitle(
      "Weavy Alternative — Now Figma Weave | NodeTool",
    );

    await page.goto("/tasks/lip-sync");
    await expect(page).toHaveTitle("Best AI Lip Sync Models & Workflows — NodeTool");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "AI Lip Sync: Best Models & Workflows",
      }),
    ).toBeVisible();

    await page.goto("/node-based-ai");
    await expect(
      page.getByRole("link", { name: "Figma Weave alternative" }),
    ).toHaveAttribute("href", "/alternatives/figma-weave");
    await expect(
      page.getByRole("link", { name: "Weavy comparison" }),
    ).toHaveAttribute("href", "/alternatives/weavy");

    await page.goto("/templates");
    await expect(
      page.getByRole("link", { name: "runnable mini apps" }),
    ).toHaveAttribute("href", "/apps");
    await expect(
      page.getByRole("link", { name: "node-based AI workflows" }),
    ).toHaveAttribute("href", "/node-based-ai");

    await page.goto("/use-cases/movie-poster");
    await expect(
      page.getByRole("link", { name: "Build a movie trailer" }),
    ).toHaveAttribute("href", "/use-cases/movie-trailer");

    await page.goto("/use-cases/product-video");
    await expect(
      page.getByRole("link", { name: "Build a movie trailer" }),
    ).toHaveAttribute("href", "/use-cases/movie-trailer");

    await page.goto("/studio");
    await expect(
      page.getByRole("link", { name: "visual node-based AI guide" }),
    ).toHaveAttribute("href", "/node-based-ai");
  });
});
