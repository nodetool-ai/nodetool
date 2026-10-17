/**
 * Journey: run a shipped example app on a phone.
 *
 * A step rail with seven steps, or with one long step title, once laid out
 * wider than a phone and let the whole app scroll sideways. The two apps here
 * are the worst cases among the shipped examples: the most steps, and the
 * longest current step title.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

test.use({
  viewport: { width: 360, height: 844 },
  hasTouch: true,
  isMobile: true
});

async function openExampleApp(page: Page, slug: string): Promise<void> {
  await page.addInitScript((ref) => {
    const id = `example-app:${ref}`;
    localStorage.setItem(
      "workspace-tabs-storage",
      JSON.stringify({
        version: 4,
        state: {
          tabs: [{ id, type: "example-app", ref, mode: "view", title: ref }],
          activeTabId: id,
          activeProjectId: null,
          personalProjectId: null,
          projectSessions: {}
        }
      })
    );
  }, slug);
  await page.goto("/workspace");
}

/** Pixels the app's scroll box would scroll sideways. */
async function sidewaysOverflow(page: Page): Promise<number> {
  return page
    .locator(".appbuilder-runtime")
    .evaluate((el) => el.scrollWidth - el.clientWidth);
}

for (const slug of ["ad-a-capability-journey-on-connected-paths", "ad-maker"]) {
  test(`${slug} fits a phone without sideways scrolling`, async ({ page }) => {
    await openExampleApp(page, slug);
    const lastStep = page.locator(".appbuilder-runtime nav ol > li").last();
    const current = page.locator(".appbuilder-runtime nav ol [aria-current=step]");
    await expect(current).toBeVisible();
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(() => sidewaysOverflow(page)).toBeLessThanOrEqual(0);
      await expect(current).toBeInViewport({ ratio: 1 });
      await expect(lastStep).toBeInViewport({ ratio: 1 });
    }
  });
}
