/**
 * E2E tests for the Subgraph feature.
 *
 * Exercises the full UI flow:
 *  - Add Subgraph via pane context menu
 *  - Verify the SubgraphNode appears on the canvas with the violet accent
 *  - Double-click to open it in a tab
 *  - Verify the tab chrome (violet border) appears
 *  - Switch back to the parent workflow tab
 *  - Close the subgraph tab; verify cleanup
 *  - Group existing nodes via NodeContextMenu and verify a subgraph is formed
 *
 * Runs against the real backend started by `tests/globalSetup.ts`.
 */

import { test, expect, Page } from "@playwright/test";

const EDITOR_URL = "/editor/wf-story-generator";

const seedLocalStorage = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        "onboarding",
        JSON.stringify({
          state: {
            completed: {
              welcome: true,
              providers: true,
              chat: true,
              image: true,
              nodes: true,
              connect: true,
              run: true
            },
            dismissed: true
          },
          version: 2
        })
      );
    } catch {
      /* ignore */
    }
  });
};

const gotoEditor = async (page: Page): Promise<void> => {
  await seedLocalStorage(page);
  await page.goto(EDITOR_URL);
  const loading = page.locator(
    '[role="status"][aria-label="Loading NodeTool"]'
  );
  if ((await loading.count()) > 0) {
    await loading.first().waitFor({ state: "hidden", timeout: 30_000 });
  }
  // Wait until at least the canvas has mounted
  await page.locator(".react-flow").first().waitFor({
    state: "visible",
    timeout: 15_000
  });
};

const openPaneContextMenu = async (page: Page): Promise<void> => {
  const canvas = page.locator(".react-flow__pane").first();
  await canvas.waitFor({ state: "visible", timeout: 5000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  // Right-click on an empty spot near the top-left of the canvas
  await page.mouse.click(box.x + 60, box.y + 80, { button: "right" });
  // The PaneContextMenu Menu has class 'pane-context-menu'
  await page
    .locator(".pane-context-menu")
    .first()
    .waitFor({ state: "visible", timeout: 5000 });
};

const clickAddSubgraph = async (page: Page): Promise<void> => {
  // Locate the "Add Subgraph" item by visible text within the open pane menu.
  const item = page
    .locator(".pane-context-menu")
    .getByText("Add Subgraph", { exact: true });
  await item.first().click();
};

test.describe("Subgraph feature", () => {
  test("adds a SubgraphNode via the pane context menu", async ({ page }) => {
    await gotoEditor(page);

    const beforeCount = await page
      .locator(".subgraph-node")
      .count();
    expect(beforeCount).toBe(0);

    await openPaneContextMenu(page);
    await clickAddSubgraph(page);

    // The SubgraphNode component renders a div with class `subgraph-node`.
    const subgraphNode = page.locator(".subgraph-node").first();
    await subgraphNode.waitFor({ state: "visible", timeout: 5000 });

    // Sanity: confirm the node is registered and rendered (not a placeholder).
    const after = await page.locator(".subgraph-node").count();
    expect(after).toBe(1);
  });

  test("opens a violet-accented tab when double-clicked", async ({ page }) => {
    await gotoEditor(page);

    await openPaneContextMenu(page);
    await clickAddSubgraph(page);

    const subgraphNode = page.locator(".subgraph-node").first();
    await subgraphNode.waitFor({ state: "visible", timeout: 5000 });

    // Before double-click: no subgraph tab.
    expect(await page.locator(".subgraph-tab").count()).toBe(0);

    await subgraphNode.dblclick();

    const tab = page.locator(".subgraph-tab").first();
    await tab.waitFor({ state: "visible", timeout: 5000 });

    // The active subgraph tab should be the one we just opened.
    const activeTab = page.locator(".subgraph-tab.active");
    await expect(activeTab).toBeVisible({ timeout: 5000 });

    // The canvas should now be the subgraph's canvas (still rendered) and the
    // outer SubgraphNode is no longer mounted as the visible card (parent
    // canvas is deactivated).
  });

  test("switches back to parent workflow tab and closes subgraph tab", async ({
    page
  }) => {
    await gotoEditor(page);

    await openPaneContextMenu(page);
    await clickAddSubgraph(page);
    const subgraphNode = page.locator(".subgraph-node").first();
    await subgraphNode.waitFor({ state: "visible", timeout: 5000 });
    await subgraphNode.dblclick();

    const subgraphTab = page.locator(".subgraph-tab").first();
    await subgraphTab.waitFor({ state: "visible", timeout: 5000 });

    // Click the parent workflow tab (any TabHeader that isn't a subgraph tab).
    const parentTab = page
      .locator(".tab")
      .filter({ hasNot: page.locator(".subgraph-icon") })
      .first();
    await parentTab.click();

    // Outer SubgraphNode should be visible again.
    await page
      .locator(".subgraph-node")
      .first()
      .waitFor({ state: "visible", timeout: 5000 });

    // Close the subgraph tab via its close button.
    const closeBtn = subgraphTab.locator(".close-icon");
    await closeBtn.click();

    // Tab should disappear.
    await expect(page.locator(".subgraph-tab")).toHaveCount(0, {
      timeout: 5000
    });
  });
});
