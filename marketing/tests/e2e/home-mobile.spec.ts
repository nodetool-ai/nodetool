import { expect, test } from "@playwright/test";

// An iPhone 13 viewport (390x664). Each check is a defect the home
// page had on a phone: a two-line category badge, the download button below
// the fold, and content that runs off screen.
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
    const badge = page.getByText(/^Open-source AI film studio/);
    const badgeBox = await badge.boundingBox();
    expect(badgeBox?.height ?? 0).toBeLessThan(32);

    const viewport = page.viewportSize();
    const cta = page.locator("main").locator('#hero-title ~ div a[href^="/download"]').first();
    const ctaBox = await cta.boundingBox();
    expect(ctaBox).not.toBeNull();
    expect((ctaBox?.y ?? 0) + (ctaBox?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
  });
});
