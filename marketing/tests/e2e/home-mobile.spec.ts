import { expect, test } from "@playwright/test";

// An iPhone 13 viewport (390x664). Each check is a defect the home
// page had on a phone, or a layout the spec strip must keep: a two-line
// category badge, the download button below the fold, and rows that run off
// screen.
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

  test("the spec strip stacks to one column inside the screen", async ({ page }) => {
    const rows = page.locator("#specs dl > div");
    await rows.first().scrollIntoViewIfNeeded();
    const boxes = await rows.evaluateAll((items) =>
      items.map((item) => {
        const box = item.getBoundingClientRect();
        return { left: Math.round(box.left), right: box.right };
      })
    );
    expect(boxes).toHaveLength(2);
    expect(new Set(boxes.map((box) => box.left)).size).toBe(1);
    expect(boxes.every((box) => box.right <= 390)).toBe(true);
  });
});
