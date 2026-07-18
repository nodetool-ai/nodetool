/**
 * Visual regression tests — Design system / component gallery.
 *
 * NodeTool has no dedicated token-documentation page yet, so this spec uses
 * the `/preview/:component` routes as an isolated component gallery: each
 * route renders a single component pre-opened so it can be captured without
 * driving the full app. These catch design-system-level regressions (color
 * picker swatches, model cards, image comparer, layout primitives) that
 * per-page tests might miss.
 *
 * Also covers the `/layouttest` page, which exercises the layout primitives
 * (routing, breadcrumbs, sidebars) in isolation.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  gotoPage,
  VISUAL_SCREENSHOT_OPTIONS,
  ensureNoVisibleProgress
} from "./visualHelpers";
import { waitForAnimation } from "../benchmarks/helpers/waitHelpers";

/** Wait for the preview surface to mount, then settle. */
async function waitForPreview(page: Page, ready?: (p: Page) => Promise<void>) {
  await page
    .locator('[data-preview], .MuiDialog-root, .MuiPopover-paper')
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {});
  if (ready) await ready(page);
  await ensureNoVisibleProgress(page);
  await waitForAnimation(page, 700);
}

test.describe("Design system — component gallery", () => {
  test("color picker (swatches / harmony / gradient)", async ({ page }) => {
    // The color picker surfaces the design-system palette: swatches, harmony
    // wheel, and gradient stops. A token-level regression surface.
    await gotoPage(page, "/preview/color-picker");
    await waitForPreview(page, (p) =>
      p
        .getByText(/swatches|harmony|gradient/i)
        .first()
        .waitFor({ state: "visible", timeout: 8_000 })
        .catch(() => {})
    );
    await expect(page).toHaveScreenshot(
      "design-color-picker.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("recommended models cards", async ({ page }) => {
    // Model recommendation cards — typography, spacing, icon treatment for
    // the card primitive reused across the app.
    await gotoPage(page, "/preview/recommended-models");
    await waitForPreview(page, (p) =>
      p
        .getByText(/Stable Diffusion XL Base|FLUX\.1 Schnell/i)
        .first()
        .waitFor({ state: "visible", timeout: 8_000 })
        .catch(() => {})
    );
    await expect(page).toHaveScreenshot(
      "design-recommended-models.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("image comparer (before/after)", async ({ page }) => {
    // Slider-based before/after image comparer — exercises the media widget
    // and overlay layout.
    await gotoPage(page, "/preview/image-compare");
    await waitForPreview(page, (p) =>
      p
        .locator('img[alt="Before"], img[alt="After"]')
        .first()
        .waitFor({ state: "visible", timeout: 12_000 })
        .catch(() => {})
    );
    await expect(page).toHaveScreenshot(
      "design-image-compare.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("form controls share the CONTROL token heights", async ({ page }) => {
    // The height contract, measured for real: a TextInput and both SelectField
    // variants must render at exactly 36px (medium) / 28px (small). jsdom
    // cannot measure layout, so this is the enforcement the unit tests defer
    // to (see ui_primitives/__tests__/controlHeights.test.tsx).
    await gotoPage(page, "/preview/form-controls");
    await waitForPreview(page, (p) =>
      p
        .getByText("Medium text")
        .waitFor({ state: "visible", timeout: 8_000 })
        .catch(() => {})
    );

    // DOM order: medium text / outlined select / standard select, then the
    // small trio.
    const roots = page.locator(
      '[data-preview="form-controls"] .MuiInputBase-root'
    );
    await expect(roots).toHaveCount(6);
    const heights: number[] = [];
    for (let i = 0; i < 6; i++) {
      const box = await roots.nth(i).boundingBox();
      heights.push(box?.height ?? 0);
    }
    expect(heights).toEqual([36, 36, 36, 28, 28, 28]);

    await expect(page).toHaveScreenshot(
      "design-form-controls.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("layout primitives page", async ({ page }) => {
    // /layouttest exercises the layout primitives (header, routing,
    // breadcrumbs, sidebars) in isolation.
    await gotoPage(page, "/layouttest");
    await page
      .locator("body")
      .waitFor({ state: "attached" })
      .catch(() => {});
    await ensureNoVisibleProgress(page);
    await waitForAnimation(page, 800);
    await expect(page).toHaveScreenshot(
      "design-layout-primitives.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });
});
