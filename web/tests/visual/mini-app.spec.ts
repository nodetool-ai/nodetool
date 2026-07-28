/**
 * Visual regression tests — mini apps.
 *
 * A mini app is its own resource (an `applications` row), opened as a tab in
 * the `/workspace` shell. It has two surfaces, both captured here:
 *   - Design — the widget canvas where the app is built
 *   - Run    — the form a user actually runs, with its Output widget
 *
 * Fixture: `app-mini-app` ("Echo Mini App"), whose document binds a text
 * input, a Run button and an Output widget to the `wf-mini-app` echo graph.
 * The Run capture is taken *before* the run so the Output widget shows its
 * empty state — a streamed result would put run-dependent text in a baseline.
 */

import { test, expect } from "@playwright/test";
import {
  gotoPage,
  VISUAL_SCREENSHOT_OPTIONS,
  ensureNoVisibleProgress,
  volatileMask
} from "./visualHelpers";
import { waitForAnimation } from "../benchmarks/helpers/waitHelpers";

const APP_TAB = {
  workspace: {
    tabs: [
      {
        type: "application" as const,
        ref: "app-mini-app",
        title: "Echo Mini App"
      }
    ]
  }
};

test.describe("Mini app", () => {
  test("design surface", async ({ page }) => {
    await gotoPage(page, "/workspace", APP_TAB);
    await page
      .getByRole("button", { name: "Design", exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 25_000 })
      .catch(() => {});
    await ensureNoVisibleProgress(page);
    await waitForAnimation(page, 800);
    await expect(page).toHaveScreenshot("mini-app-design.png", {
      ...VISUAL_SCREENSHOT_OPTIONS,
      mask: volatileMask(page)
    });
  });

  test("run surface", async ({ page }) => {
    await gotoPage(page, "/workspace", APP_TAB);
    const runMode = page
      .getByRole("button", { name: "Run", exact: true })
      .first();
    await runMode
      .waitFor({ state: "visible", timeout: 25_000 })
      .catch(() => {});
    await runMode.click().catch(() => {});
    // The app's own Run button (labelled by the document) only exists on the
    // Run surface, so it is the landmark that the switch completed.
    await page
      .getByRole("button", { name: /^run echo$/i })
      .first()
      .waitFor({ state: "visible", timeout: 25_000 })
      .catch(() => {});
    await ensureNoVisibleProgress(page);
    await waitForAnimation(page, 800);
    await expect(page).toHaveScreenshot("mini-app-run.png", {
      ...VISUAL_SCREENSHOT_OPTIONS,
      mask: volatileMask(page)
    });
  });
});
