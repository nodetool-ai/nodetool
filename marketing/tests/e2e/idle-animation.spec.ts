import { test, expect } from "@playwright/test";

/**
 * No page animates forever once it has settled.
 *
 * Five pages carried two decorative glow blobs — 448px and 416px circles under
 * `blur(64px)` — drifting 10px on an infinite framer-motion loop. Chrome
 * composited that and held 60fps, so it looked free. Safari re-rasterized both
 * blurred layers every frame and sat at ~4fps (median 226ms per frame) for as
 * long as the tab was open, which is what made a tap on the hamburger take
 * seconds to produce a panel.
 *
 * The assertion is the mechanism, not a frame budget: after the page has
 * settled, nothing may still be writing inline styles. That is engine
 * independent — the loop runs in Chromium too, it is merely cheap there — so
 * this catches a regression without a WebKit runner or a timing threshold.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const PAGES = ["/", "/agents", "/developers", "/cloud", "/studio"];

const SETTLE_MS = 6000;
const WATCH_MS = 2000;

for (const path of PAGES) {
  test(`${path} stops animating once it has settled`, async ({ page }) => {
    await page.goto(path, { waitUntil: "load" });
    await page.waitForTimeout(SETTLE_MS);

    const changed = await page.evaluate(async (watchMs) => {
      const els = [...document.querySelectorAll("*")];
      const snapshot = () => els.map((el) => el.getAttribute("style") ?? "");
      const before = snapshot();
      await new Promise((resolve) => setTimeout(resolve, watchMs));
      const after = snapshot();

      return els
        .map((el, i) =>
          before[i] === after[i]
            ? null
            : {
                tag: el.tagName,
                className: String(
                  (el as HTMLElement).className ?? ""
                ).slice(0, 80),
                from: before[i].slice(0, 60),
                to: after[i].slice(0, 60),
              }
        )
        .filter(Boolean);
    }, WATCH_MS);

    expect(
      changed,
      `still animating after ${SETTLE_MS}ms: ${JSON.stringify(changed, null, 2)}`
    ).toEqual([]);
  });
}
