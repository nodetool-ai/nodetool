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
  ensureNoVisibleProgress
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
});
