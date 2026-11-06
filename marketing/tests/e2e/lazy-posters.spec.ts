import { expect, test } from "@playwright/test";

// A <video poster> downloads on page load wherever the video sits. The home
// page fetched 13 posters (about 700 KB) for ad cards, the timeline film and
// closed storyboard dialogs before a phone reader scrolled at all. Posters now
// wait until their video is near the screen, or until the dialog opens.
test.describe("home page posters on a phone", () => {
  test.use({ viewport: { width: 412, height: 823 } });

  test("below-the-fold posters wait for the reader", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (request) => requested.push(new URL(request.url()).pathname));
    await page.goto("/");
    await page.waitForLoadState("load");

    const early = requested.filter((path) =>
      /^\/(ad-library\/videos\/.+\.webp|storyboards\/.+\/poster\.jpg|timelines\/.+\/poster\.webp|surface-.+-poster\.webp)$/.test(path)
    );
    expect(early).toEqual([]);

    const adVideo = page.locator('a[href^="/ad-library/"] video').first();
    await adVideo.scrollIntoViewIfNeeded();
    await expect(adVideo).toHaveAttribute("poster", /\/ad-library\/videos\/.+\.webp$/);

    const timelineFilm = page.locator("#timeline-showcase-film video");
    await timelineFilm.scrollIntoViewIfNeeded();
    await expect(timelineFilm).toHaveAttribute("poster", /\/timelines\/.+\/poster\.webp$/);

    const watch = page.getByRole("button", { name: /Watch the film/ }).first();
    await watch.scrollIntoViewIfNeeded();
    await watch.click();
    await expect(page.locator("dialog[open] video")).toHaveAttribute(
      "poster",
      /\/storyboards\/.+\/poster\.jpg$/
    );
  });
});
