import { expect, test, type Page } from "@playwright/test";

import { gotoPage, VISUAL_SCREENSHOT_OPTIONS } from "./visualHelpers";

async function seekTimeline(page: Page, timeMs: number): Promise<void> {
  const scrubber = page.getByRole("slider", { name: "Scrub timeline" });
  await scrubber.fill(String(timeMs));
  await expect(scrubber).toHaveValue(String(timeMs));
}

test.describe("Timeline motion design", () => {
  test("renders authored motion at fixed timeline frames", async ({ page }) => {
    await gotoPage(page, "/timeline/tl-motion-demo");
    const preview = page.getByTestId("preview-compositor");
    await expect(preview).toBeVisible();

    await seekTimeline(page, 0);
    await expect(preview).toHaveScreenshot(
      "motion-title-before-in.png",
      VISUAL_SCREENSHOT_OPTIONS
    );

    await seekTimeline(page, 900);
    await expect(preview).toHaveScreenshot(
      "motion-title-after-pop.png",
      VISUAL_SCREENSHOT_OPTIONS
    );

    await seekTimeline(page, 3400);
    await expect(preview).toHaveScreenshot(
      "motion-shape-slide-midpoint.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("renders every motion preset at a representative frame", async ({
    page
  }) => {
    await gotoPage(page, "/timeline/tl-motion-demo");
    const preview = page.getByTestId("preview-compositor");
    await expect(preview).toBeVisible();

    const presetFrames = [
      ["fade", 6500],
      ["slide", 8500],
      ["pop", 10500],
      ["spin", 13500],
      ["pulse", 14500],
      ["shake", 16500],
      ["bounce", 18500],
      ["kenBurns", 21000],
      ["float", 22300],
      ["breathe", 24500],
      ["rotate", 26500]
    ] as const;

    for (const [preset, timeMs] of presetFrames) {
      await seekTimeline(page, timeMs);
      await expect(preview).toHaveScreenshot(
        `motion-preset-${preset}.png`,
        VISUAL_SCREENSHOT_OPTIONS
      );
    }
  });
});
