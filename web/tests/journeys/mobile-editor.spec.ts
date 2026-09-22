import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect, FIXTURES } from "./fixtures";

test.use({
  viewport: { width: 375, height: 844 },
  hasTouch: true,
  isMobile: true
});

async function openTimeline(page: Page): Promise<void> {
  // The hermetic fixture server does not register the bundled font route.
  await page.route("**/api/assets/packages/timeline/fonts/*.ttf", (route) => {
    const file = new URL(route.request().url()).pathname.split("/").pop();
    return route.fulfill({
      path: fileURLToPath(
        new URL(`../../../packages/timeline/fonts/${file}`, import.meta.url)
      ),
      contentType: "font/ttf"
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      "workspace-tabs-storage",
      JSON.stringify({
        version: 3,
        state: {
          tabs: [
            {
              id: "timeline:tl-demo-promo",
              type: "timeline",
              ref: "tl-demo-promo",
              mode: "edit",
              title: "Promo Reel"
            }
          ],
          activeTabId: "timeline:tl-demo-promo",
          activeProjectId: null,
          personalProjectId: null,
          projectSessions: {}
        }
      })
    );
  });
  await page.goto("/workspace");
}

test("timeline actions remain reachable on a narrow phone", async ({
  page
}) => {
  await openTimeline(page);
  const menu = page.getByRole("button", { name: "More timeline actions" });
  await expect(menu).toBeVisible();
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(menu).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("button", { name: "Export video", exact: true })
    ).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("button", { name: "Open document: Promo Reel" })
    ).toBeInViewport({ ratio: 1 });
    await menu.tap();
    await expect(
      page.getByRole("menuitem", { name: "Project settings" })
    ).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("Android touch can pinch the workflow canvas", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "platform", { value: "Linux armv8l" })
  );
  await page.goto(`/editor/${FIXTURES.editorGraph}`);
  const viewport = page.locator(".react-flow__viewport");
  await expect(
    page.locator('.react-flow__node[data-id="prompt_input"]')
  ).toBeVisible();
  const zoom = () =>
    viewport.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  const before = await zoom();
  const session = await page.context().newCDPSession(page);
  // The fixture's nodes occupy the upper canvas. Pinch the empty lower pane.
  const points = (distance: number) => [
    { id: 1, x: 185 - distance, y: 560 },
    { id: 2, x: 185 + distance, y: 560 }
  ];
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points(30)
  });
  for (const distance of [40, 50, 60, 70]) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: points(distance)
    });
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: []
  });
  await expect.poll(zoom).toBeGreaterThan(before * 1.2);
  await session.detach();
});

test("timeline preview expands without the element fullscreen API", async ({
  page
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, "requestFullscreen", {
      configurable: true,
      value: undefined
    });
  });
  await openTimeline(page);
  const enter = page.getByRole("button", { name: "Fullscreen", exact: true });
  await expect(enter).toBeVisible();
  await enter.tap();
  const preview = page.locator('[data-expanded="true"]');
  await expect(preview).toBeVisible();
  await expect
    .poll(() => preview.boundingBox())
    .toEqual({ x: 0, y: 0, width: 375, height: 844 });
  await expect(
    preview.getByRole("button", { name: "Exit fullscreen" })
  ).toBeInViewport({ ratio: 1 });
  await preview.getByRole("button", { name: "Exit fullscreen" }).tap();
  await expect(preview).toHaveCount(0);
  await expect(enter).toBeVisible();
});
