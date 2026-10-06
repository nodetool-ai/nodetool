import { expect, test } from "@playwright/test";

const examples = ["Serein", "Kite", "Tidewater", "Cadence", "Prism", "Voltra"];

for (const route of ["/", "/marketing"]) {
  test(`${route} plays the editable examples in the requested order`, async ({ page }) => {
    // Without reduced motion the film autoplays in view; this covers the
    // manual Play button that reduced-motion readers get instead.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route(/\.webm$/, (request) => request.abort());
    await page.goto(route);
    const showcase = page.getByRole("region", { name: "Every film is a timeline you can open." });
    const selectors = showcase.getByRole("group", { name: "Example films" });
    await showcase.scrollIntoViewIfNeeded();
    expect(await selectors.getByRole("button").allTextContents()).toEqual(
      examples.map((name) => expect.stringContaining(name))
    );
    await expect(selectors.getByRole("button", { name: /^Serein/ })).toHaveAttribute("aria-pressed", "true");
    await expect(showcase.getByText(/T minus 30/i)).toHaveCount(0);

    for (const name of examples) {
      await selectors.getByRole("button", { name: new RegExp(`^${name}`) }).click();
      const film = showcase.locator("video");
      await expect(film).toHaveAttribute("aria-label", `${name} finished film`);
      expect(await film.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
      await showcase.getByRole("button", { name: `Play ${name}`, exact: true }).click();
      await expect.poll(() => film.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
      await expect(showcase.getByRole("img", { name: new RegExp(`^${name} open`) })).toBeVisible();
      await expect.poll(() => showcase.getByRole("img", { name: new RegExp(`^${name} open`) }).evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    }
    await expect(showcase.getByRole("link", { name: /Download NodeTool/ })).toHaveAttribute("href", "/download");
  });
}

test("selection works by keyboard, stops the previous film, and autoplays the next", async ({ page }) => {
  await page.goto("/marketing");
  const showcase = page.locator("#example-timelines");
  await showcase.getByRole("button", { name: "Play Serein", exact: true }).click();
  const oldFilm = await showcase.locator("video").elementHandle();
  const kite = showcase.getByRole("button", { name: /^Kite/ });
  await kite.focus();
  await page.keyboard.press("Enter");
  await expect(kite).toHaveAttribute("aria-pressed", "true");
  expect(await oldFilm?.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  const newFilm = showcase.locator("video");
  await expect(newFilm).toHaveAttribute("aria-label", "Kite finished film");
  await expect.poll(() => newFilm.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
});

test("portrait playback fits a mobile viewport without cropping", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/marketing");
  const showcase = page.locator("#example-timelines");
  await showcase.getByRole("button", { name: /^Tidewater/ }).click();
  await showcase.getByRole("button", { name: "Play Tidewater", exact: true }).click();
  await expect.poll(() => showcase.locator("video").evaluate((element: HTMLVideoElement) => element.videoWidth / element.videoHeight)).toBe(0.8);
  expect(await showcase.locator("video").evaluate((element) => getComputedStyle(element).objectFit)).toBe("contain");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("a failed film request can be retried", async ({ page }) => {
  await page.route("**/timelines/serein/film.mp4", (request) => request.abort(), { times: 1 });
  await page.goto("/marketing");
  const showcase = page.locator("#example-timelines");
  await showcase.getByRole("button", { name: "Play Serein", exact: true }).click();
  await expect(showcase.getByRole("alert")).toBeVisible();
  await showcase.getByRole("button", { name: "Play Serein", exact: true }).click();
  await expect.poll(() => showcase.locator("video").evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
  await expect(showcase.getByRole("alert")).toHaveCount(0);
});
