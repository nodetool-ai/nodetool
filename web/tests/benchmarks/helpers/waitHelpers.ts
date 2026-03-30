import { Page } from "@playwright/test";

/**
 * Waits for CSS animations and React state updates to settle.
 * Uses a short fixed delay as a pragmatic approach that works
 * across different animation durations.
 */
export async function waitForAnimation(
  page: Page,
  timeout = 500
): Promise<void> {
  await page.waitForTimeout(timeout);
}

/**
 * Waits for the page to be fully interactive:
 * - document.readyState === 'complete'
 * - No pending network requests
 * - A brief stabilization pause
 */
export async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => document.readyState === "complete");
  await page.waitForTimeout(300);
}

/**
 * Waits for a specific element to become visible and stable.
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout = 5000
): Promise<boolean> {
  try {
    await page.locator(selector).first().waitFor({ state: "visible", timeout });
    await page.waitForTimeout(200);
    return true;
  } catch {
    return false;
  }
}

/**
 * Dismisses any open dialogs or overlays by pressing Escape.
 */
export async function dismissOverlays(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}
