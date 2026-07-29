import { test, expect } from "@playwright/test";
import { modelEntries } from "../../src/data/modelEntries";
import { modelComparisonEntries } from "../../src/data/modelComparisonEntries";
import {
  heroShowcaseForModel,
  duelPairsForComparison,
} from "../../src/data/modelShowcase";

// PR-4 acceptance criteria, exercised against the real prerendered pages.

test.describe("model pages", () => {
  test("model directory hub lists models and comparisons", async ({ page }) => {
    await page.goto("/models");
    await expect(page).toHaveTitle(/NodeTool/i);
    await expect(page.locator("h1")).toHaveCount(1);
    // At least one model card and one comparison chip link.
    await expect(
      page.getByRole("link", { name: /view model/i }).first()
    ).toBeVisible();
  });

  // A model page with zero showcase items still builds — thumbnail fallback,
  // no empty hero section.
  const emptyModel = modelEntries.find(
    (m) => heroShowcaseForModel(m.slug, 3).length === 0
  );
  test("a zero-showcase model page builds with a thumbnail fallback", async ({
    page,
  }) => {
    // With no seeded showcase, every model falls back; pick the first available.
    const model = emptyModel ?? modelEntries[0];
    const res = await page.goto(model.route);
    expect(res?.status() ?? 0).toBeLessThan(400);
    await expect(page.locator("h1")).toHaveCount(1);
    // Fallback thumbnail is present; no broken/empty hero.
    await expect(page.locator("main img, main video").first()).toBeVisible();
    // Provider section renders.
    await expect(
      page.getByRole("heading", { name: /where to run/i })
    ).toBeVisible();
  });

  test("model page ships SoftwareApplication + FAQ JSON-LD", async ({
    page,
  }) => {
    await page.goto(modelEntries[0].route);
    const ld = page.locator('script[type="application/ld+json"]');
    const blocks = await ld.allTextContents();
    const joined = blocks.join(" ");
    expect(joined).toContain("SoftwareApplication");
    expect(joined).toContain("FAQPage");
  });

  test("pair page renders both outputs side by side", async ({ page }) => {
    // Pick a comparison that has same-prompt pairs (fixtures guarantee some).
    const pair =
      modelComparisonEntries.find(
        (c) => duelPairsForComparison(c.a, c.b).length > 0
      ) ?? modelComparisonEntries[0];
    const res = await page.goto(pair.route);
    expect(res?.status() ?? 0).toBeLessThan(400);
    await expect(page.locator("h1")).toHaveCount(1);
    // At least one duel figure with two media elements (the fixture manifest
    // guarantees content for the first comparisons).
    const media = page.locator("main figure img, main figure video");
    expect(await media.count()).toBeGreaterThanOrEqual(2);
  });
});
