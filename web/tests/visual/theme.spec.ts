/**
 * Visual regression tests — theme coverage.
 *
 * The app defaults to dark mode (defaultMode="dark"). The specs above capture
 * everything in dark; this spec captures the same key surfaces in LIGHT mode
 * to guard against theme-palette regressions (contrast, surface tints, the
 * `paletteLight` token set). The theme is pinned via localStorage before first
 * paint in `gotoPage({ theme: "light" })`.
 *
 * Desktop only — light/dark parity at one viewport is enough to catch palette
 * regressions without doubling the baseline count for every responsive size.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  gotoPage,
  VISUAL_SCREENSHOT_OPTIONS,
  ensureNoVisibleProgress,
  volatileMask
} from "./visualHelpers";
import { waitForAnimation } from "../benchmarks/helpers/waitHelpers";

async function waitForComposer(page: Page): Promise<void> {
  await page
    .locator('textarea, [contenteditable="true"]')
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {});
  await ensureNoVisibleProgress(page);
}

test.describe("Theme — light mode", () => {
  test("dashboard / portal — light", async ({ page }) => {
    await gotoPage(page, "/dashboard", { theme: "light" });
    await page
      .locator('header, [role="banner"], textarea')
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => {});
    await waitForAnimation(page, 800);
    await expect(page).toHaveScreenshot(
      "theme-light-dashboard.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("chat message thread — light", async ({ page }) => {
    await gotoPage(page, "/chat/thread-story", { theme: "light" });
    await waitForComposer(page);
    await page
      .getByText(/dreams of silicon/i)
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => {});
    await waitForAnimation(page, 800);
    await expect(page).toHaveScreenshot(
      "theme-light-chat-thread.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("settings — api keys — light", async ({ page }) => {
    await gotoPage(page, "/settings", { theme: "light" });
    const tab = page.getByRole("tab").filter({ hasText: /api.*key|secret/i }).first();
    if ((await tab.count()) > 0) {
      await tab.click();
      await waitForAnimation(page, 500);
    }
    await expect(page).toHaveScreenshot(
      "theme-light-settings-api-keys.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("node graph editor — light", async ({ page }) => {
    // The editor carries the most theme-sensitive surfaces in the app: node
    // bodies, handles, edges and the canvas grid all read from the palette,
    // and none of them are exercised by the dashboard/chat/settings captures.
    await gotoPage(page, "/editor/wf-story-generator", { theme: "light" });
    await page
      .waitForFunction(
        () => document.querySelectorAll(".react-flow__node").length > 0,
        undefined,
        { timeout: 20_000 }
      )
      .catch(() => {});
    await ensureNoVisibleProgress(page);
    await waitForAnimation(page, 800);
    await expect(page).toHaveScreenshot("theme-light-node-graph.png", {
      ...VISUAL_SCREENSHOT_OPTIONS,
      mask: volatileMask(page)
    });
  });

  test("assets explorer — light", async ({ page }) => {
    // A dense list/grid surface: row striping, folder-tree selection and card
    // borders are all palette-driven.
    await gotoPage(page, "/assets", { theme: "light" });
    await page
      .getByPlaceholder("Search current folder...")
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .catch(() => {});
    await ensureNoVisibleProgress(page);
    await waitForAnimation(page, 800);
    await expect(page).toHaveScreenshot("theme-light-assets.png", {
      ...VISUAL_SCREENSHOT_OPTIONS,
      mask: volatileMask(page)
    });
  });
});
