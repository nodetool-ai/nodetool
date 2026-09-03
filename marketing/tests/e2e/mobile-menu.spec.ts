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
 *
 * And the menu opens without the React bundle at all. The landing page is one
 * `"use client"` tree, so hydration landed ~2.7s in on a 6x-throttled phone
 * while the hamburger had been on screen since ~0.3s; every tap in between was
 * swallowed. Asserted by serving the page with its chunks blocked rather than
 * by racing a clock.
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

  test("the menu opens with the page's JavaScript blocked", async ({ page }) => {
    await page.route("**/_next/static/**/*.js", (route) => route.abort());

    await page.goto("/", { waitUntil: "domcontentloaded" });

    const panel = page.getByRole("dialog");
    await expect(panel).toBeHidden();

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(panel).toBeVisible();
    // The trigger is inside <main>, which the open panel hides — so read the
    // attribute off the DOM rather than through a role query, which correctly
    // no longer resolves it.
    const expanded = () =>
      page.evaluate(() =>
        document.querySelector('[data-nav="open"]')!.getAttribute("aria-expanded")
      );
    expect(await expanded()).toBe("true");
    expect(await page.evaluate(() => document.body.style.position)).toBe(
      "fixed"
    );

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    expect(await expanded()).toBe("false");
    expect(await page.evaluate(() => document.body.style.position)).toBe("");
  });

  test("the page under the open panel is not composited", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Safari re-rasterized the landing page's thirteen blurred glow layers on
    // the frame the menu opened (~650ms against ~110ms) while the page under
    // the full-screen panel stayed visible. The panel itself must still render.
    expect(
      await page.evaluate(
        () => getComputedStyle(document.querySelector("main")!).visibility
      )
    ).toBe("hidden");
    expect(
      await page.evaluate(
        () =>
          getComputedStyle(document.querySelector(".mobile-menu-panel")!)
            .visibility
      )
    ).toBe("visible");
    await expect(page.getByRole("link", { name: "Pricing" })).toBeVisible();
  });
});
