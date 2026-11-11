import { expect, test } from "@playwright/test";

// A <video poster> downloads on page load wherever the video sits. The home
// page once fetched 13 posters (about 700 KB) before a phone reader scrolled
// at all. Posters now wait until their video is near the screen.
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

    const poster = page.locator('#surfaces img[src$="-poster.webp"]').first();
    await page.locator("#surfaces").scrollIntoViewIfNeeded();
    await expect(poster).toHaveAttribute("src", /\/surface-storyboard-poster\.webp$/);
  });
});
