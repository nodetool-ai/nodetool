/**
 * Visual regression tests — Settings pages.
 *
 * Covers the critical settings surfaces:
 *   - API Keys tab (provider cards: OpenAI, Anthropic, …)
 *   - Integrations tab (configuration groups + servers/credentials)
 *   - General tab (editor / appearance / default models)
 *   - About tab
 *
 * Settings is a routed page (not a modal). Tabs are MUI Tab elements labelled
 * "General", "API Keys", "Integrations", "About".
 */

import { test, expect, type Page } from "@playwright/test";
import {
  gotoPage,
  VISUAL_SCREENSHOT_OPTIONS
} from "./visualHelpers";
import { waitForAnimation } from "../benchmarks/helpers/waitHelpers";

/** Click a settings tab by its visible label, tolerant of label changes. */
async function openTab(page: Page, label: RegExp): Promise<void> {
  const tab = page.getByRole("tab").filter({ hasText: label }).first();
  if ((await tab.count()) > 0) {
    await tab.click();
    await waitForAnimation(page, 500);
  }
}

test.describe("Settings", () => {
  test("api keys tab — provider cards @responsive @smoke", async ({ page }) => {
    // The API Keys tab lists every provider card with its key/secret field —
    // the canonical "configure your providers" surface.
    await gotoPage(page, "/settings");
    await openTab(page, /api.*key|secret/i);
    await waitForAnimation(page, 600);
    await expect(page).toHaveScreenshot(
      "settings-api-keys.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("integrations tab @smoke", async ({ page }) => {
    // Integrations: remote setting groups (local model servers, search
    // provider, …) + folders, plus MCP servers / API token sections.
    await gotoPage(page, "/settings");
    await openTab(page, /integration/i);
    await waitForAnimation(page, 600);
    await expect(page).toHaveScreenshot(
      "settings-integrations.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("general tab", async ({ page }) => {
    // Default landing tab: editor, execution, canvas/navigation, default
    // models, autosave, appearance.
    await gotoPage(page, "/settings");
    await openTab(page, /^general$/i);
    await waitForAnimation(page, 600);
    await expect(page).toHaveScreenshot(
      "settings-general.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("about tab", async ({ page }) => {
    await gotoPage(page, "/settings");
    await openTab(page, /about/i);
    await waitForAnimation(page, 500);
    await expect(page).toHaveScreenshot(
      "settings-about.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });
});
