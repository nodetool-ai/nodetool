import { expect, test } from "@playwright/test";

// An iPhone 13 viewport (390x664). Each check is a defect the home
// page had on a phone: a two-line category badge, the download button below
// the fold, a comparison table whose third column sat off screen, and
// storyboard shot grids that made the page three screens taller per board.
test.describe("home page on a phone", () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("the page does not scroll sideways", async ({ page }) => {
    const widths = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1]);
  });

  test("the hero badge fits one line and the download button is above the fold", async ({ page }) => {
    const badge = page.getByText("Open-source agent-first creative workspace");
    const badgeBox = await badge.boundingBox();
    expect(badgeBox?.height ?? 0).toBeLessThan(32);

    const viewport = page.viewportSize();
    const cta = page.locator("main").locator('#hero-title ~ div a[href^="/download"]').first();
    const ctaBox = await cta.boundingBox();
    expect(ctaBox).not.toBeNull();
    expect((ctaBox?.y ?? 0) + (ctaBox?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
  });

  test("the comparison reads as cards without sideways scrolling", async ({ page }) => {
    const section = page.locator("#differences");
    await expect(section.locator("table")).toBeHidden();
    const cards = section.locator("dl > div");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(3);
    const fits = await cards.evaluateAll((items) =>
      items.every((item) => item.getBoundingClientRect().right <= window.innerWidth)
    );
    expect(fits).toBe(true);
  });

  test("storyboard shots scroll sideways in one row", async ({ page }) => {
    const row = page.locator("#storyboard-examples ol").first();
    await row.scrollIntoViewIfNeeded();
    const shots = row.locator("li");
    const tops = await shots.evaluateAll((items) =>
      items.map((item) => Math.round(item.getBoundingClientRect().top))
    );
    expect(tops.length).toBeGreaterThan(1);
    expect(new Set(tops).size).toBe(1);
    expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  });
});
