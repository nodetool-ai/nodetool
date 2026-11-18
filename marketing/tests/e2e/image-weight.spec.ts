import { expect, test } from "@playwright/test";

// Search Console flagged mobile LCP over 2.5 s. On these pages the LCP element
// was a full-size PNG or JPEG (up to 3.2 MB, plus 2.7 MB stills and a 5.6 MB
// card loading beside it), and recipe videos with preload="metadata" pulled
// whole files (up to 23 MB) before the reader pressed play. The pages now show
// resized WebP copies from scripts/generate-web-images.mjs.
const MAX_IMAGE_BYTES = 400 * 1024;

const routes = [
  "/models/veo-3",
  "/use-cases/movie-poster",
  "/recipes",
  "/recipes/directed-campaign-kit",
  "/recipes/viral-video-ad-engine",
  "/recipes/ugc-product-video",
  "/recipes/ecommerce-sku-visual-factory",
  "/recipes/impossible-product-worlds",
  "/recipes/multilingual-video-dubber",
];

for (const route of routes) {
  test(`${route}: no image over 400 KB and no video download on load`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 823 });
    const heavy: string[] = [];
    const media: string[] = [];
    let images = 0;
    page.on("response", async (response) => {
      const type = response.request().resourceType();
      if (type === "media") {
        media.push(response.url());
        return;
      }
      if (type !== "image" || response.status() !== 200) {
        return;
      }
      images += 1;
      const body = await response.body().catch(() => null);
      if (body && body.length > MAX_IMAGE_BYTES) {
        heavy.push(`${response.url()} ${Math.round(body.length / 1024)} KB`);
      }
    });
    await page.goto(route, { waitUntil: "load" });
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(1500);

    expect(images).toBeGreaterThan(0);
    expect(heavy).toEqual([]);
    expect(media).toEqual([]);
  });
}
