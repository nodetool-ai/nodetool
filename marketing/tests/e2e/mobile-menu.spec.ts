import { test, expect } from "@playwright/test";

/**
 * Two things the landing page has to get right on a phone, both asserted as
 * mechanism rather than as a frame time.
 *
 * The menu pins the page while it is open: `overflow: hidden` on the body
 * alone is ignored by iOS Safari, so a flick inside the panel scrolled the
 * document behind it.
 *
 * The model marquees do not animate while their section is off screen. Chrome
 * cannot composite them, so every frame they run costs a style recalculation
 * over ~50 moving cards — 1.2s of the main thread per 3s on a 4x-throttled
 * phone, measured with the section nowhere near the viewport. That is what
 * made every interaction on the page, the menu included, feel stuck.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const SCROLL_Y = 1200;

test.describe("landing page on a phone", () => {
  test("the menu pins the page while open and restores the scroll position", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.evaluate((y) => window.scrollTo(0, y), SCROLL_Y);
    await expect
      .poll(() => page.evaluate(() => Math.round(window.scrollY)))
      .toBe(SCROLL_Y);

    await page.getByRole("button", { name: "Open menu" }).click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();

    expect(await page.evaluate(() => document.body.style.position)).toBe(
      "fixed"
    );

    // A wheel over the open panel must not move the document behind it.
    await page.mouse.move(195, 600);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(0);

    await page.getByRole("button", { name: "Close menu" }).last().click();
    await expect(panel).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => Math.round(window.scrollY)))
      .toBe(SCROLL_Y);
    expect(await page.evaluate(() => document.body.style.position)).toBe("");
  });

  test("the model marquees stay paused while their section is off screen", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "load" });

    const track = page.locator(".animate-marquee").first();
    await expect(track).toHaveCount(1);

    // Top of the page: the model section is far below, so nothing should run.
    await expect
      .poll(() =>
        track.evaluate((el) => getComputedStyle(el).animationPlayState)
      )
      .toBe("paused");

    await track.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        track.evaluate((el) => getComputedStyle(el).animationPlayState)
      )
      .toBe("running");
  });
});
