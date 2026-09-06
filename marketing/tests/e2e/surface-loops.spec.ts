import { test, expect } from "@playwright/test";

/**
 * The five editing-surface loops never degrade to a black rectangle.
 *
 * Each loop opens on an empty editor and fills over its six seconds, so its
 * first frame is all but black (measured mean luminance 0.3/255 for the
 * storyboard loop). `<video poster>` does not cover that: a browser shows the
 * poster only until playback first starts, and the tab strip rewinds a loop it
 * leaves back to 0. On any browser that then refuses to restart it — Dia, iOS
 * Low Power Mode, power saving, a backgrounded tab — the panel painted the
 * video's own black first frame instead of the poster.
 *
 * The assertion is the mechanism rather than a screenshot: with playback
 * refused, whatever the panel is showing must not be black, and the reader must
 * be offered a way to start the loop by hand. Refusal is simulated by rejecting
 * play(), which is what an autoplay-blocking browser does, so this holds in a
 * Chromium runner.
 */

const PANEL = "#surface-panel-storyboard";

/** Mean luminance, 0-255, of whichever layer the panel is actually showing. */
async function shownLuminance(page: import("@playwright/test").Page) {
  return page.evaluate((panelSel) => {
    const panel = document.querySelector(panelSel);
    if (!panel) throw new Error("no storyboard panel");
    const video = panel.querySelector("video");
    const poster = panel.querySelector("img");
    const shown =
      video && getComputedStyle(video).opacity === "1" ? video : poster;
    if (!shown) throw new Error("panel shows neither video nor poster");
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(shown as CanvasImageSource, 0, 0, 320, 180);
    const { data } = ctx.getImageData(0, 0, 320, 180);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    return sum / (data.length / 4);
  }, PANEL);
}

test("a surface loop that will not play shows its poster, not a black frame", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const real = HTMLMediaElement.prototype.play;
    (window as unknown as { __allowPlay: boolean }).__allowPlay = true;
    HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
      if ((window as unknown as { __allowPlay: boolean }).__allowPlay) {
        return real.call(this);
      }
      return Promise.reject(new DOMException("blocked", "NotAllowedError"));
    };
  });

  await page.goto("/", { waitUntil: "load" });
  await page.locator("#surfaces").scrollIntoViewIfNeeded();

  // Let the storyboard loop run, so its currentTime leaves 0 and the poster
  // attribute would no longer cover the element.
  await expect
    .poll(async () => shownLuminance(page), { timeout: 15_000 })
    .toBeGreaterThan(5);

  // Leave the tab (which rewinds the loop), then come back with playback
  // refused — the case that used to paint black.
  await page.locator("#surface-tab-timeline").click();
  await page.evaluate(() => {
    (window as unknown as { __allowPlay: boolean }).__allowPlay = false;
  });
  await page.locator("#surface-tab-storyboard").click();

  // The symptom: the panel used to paint the loop's black first frame here.
  expect(await shownLuminance(page)).toBeGreaterThan(5);
  await expect(
    page.locator(`${PANEL} button[aria-label="Play the Storyboard loop"]`)
  ).toBeVisible();

  // The click is the gesture a refusing browser was holding out for.
  await page.evaluate(() => {
    (window as unknown as { __allowPlay: boolean }).__allowPlay = true;
  });
  await page
    .locator(`${PANEL} button[aria-label="Play the Storyboard loop"]`)
    .click();
  await expect(page.locator(`${PANEL} video`)).toHaveCSS("opacity", "1");
});

test("every surface tab reaches a playing loop", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });
  await page.locator("#surfaces").scrollIntoViewIfNeeded();

  for (const id of ["storyboard", "script", "timeline", "sketch", "3d"]) {
    await page.locator(`#surface-tab-${id}`).click();
    const video = page.locator(`#surface-panel-${id} video`);
    await expect(video).toHaveCSS("opacity", "1");
    expect(
      await video.evaluate((el: HTMLVideoElement) => el.paused)
    ).toBe(false);
  }
});
