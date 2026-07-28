/**
 * E2E tests for the Subgraph feature.
 *
 * Exercises the full UI flow:
 *  - Add Subgraph via pane context menu
 *  - Double-click it to open its canvas in a tab
 *  - Edit that canvas, and switch and close the tab
 *  - Confirm the edit landed on the parent node rather than dying with the tab
 *
 * The last one is the assertion that matters: a subgraph tab holds its own
 * NodeStore, so a canvas that renders and edits perfectly can still lose every
 * change the moment the tab closes.
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
  // Snapshot for debug
  await page.screenshot({ path: "/tmp/before-rc.png" });
  const pane = page.locator(".react-flow__pane").first();
  await pane.waitFor({ state: "visible", timeout: 10_000 });

  const box = await pane.boundingBox();
  if (!box) throw new Error("pane has no bounding box");
  // Move cursor first to ensure focus, then right-click at far-from-anything point.
  await page.mouse.move(box.x + box.width - 80, box.y + box.height - 80);
  await page.mouse.click(box.x + box.width - 80, box.y + box.height - 80, {
    button: "right"
  });

  const menu = page.locator(".pane-context-menu").first();
  const visible = await menu
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (!visible) {
    await page.screenshot({ path: "/tmp/no-menu.png" });
    const paneInfo = await pane.evaluate((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      const cls = (el as HTMLElement).className;
      return { rect, cls };
    });
    throw new Error(
      `pane context menu didn't open. pane: ${JSON.stringify(paneInfo)}`
    );
  }
};

/**
 * Open the first SubgraphNode's canvas by double-clicking it, as a user would.
 *
 * A real double-click, not a synthetic dispatch: React Flow's
 * `onNodeDoubleClick` is what opens the tab, and it is the handler that
 * registers the subgraph's NodeStore.
 */
const openSubgraphTab = async (page: Page): Promise<void> => {
  await page.locator(".subgraph-node").first().dblclick();
  await page
    .locator(".subgraph-tab.active")
    .first()
    .waitFor({ state: "visible", timeout: 5000 });
};

/**
 * Add a String Input node to the open subgraph canvas via its pane menu.
 *
 * The subgraph canvas overlays the parent one, so a real right-click at the
 * centre of the editor area lands on the subgraph's pane.
 */
const addStringInputToSubgraph = async (page: Page): Promise<void> => {
  await page.mouse.move(960, 540);
  await page.mouse.click(960, 540, { button: "right" });

  await page
    .locator(".pane-context-menu")
    .first()
    .waitFor({ state: "visible", timeout: 5000 });

  await page
    .locator(".pane-context-menu")
    .getByText("Add Input Node", { exact: false })
    .first()
    .click();
  await page
    .locator(".pane-submenu")
    .getByText("String", { exact: true })
    .first()
    .click();
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
    await subgraphNode.waitFor({ state: "attached", timeout: 5000 });

    expect(await page.locator(".subgraph-tab").count()).toBe(0);

    await openSubgraphTab(page);

    // The subgraph tab's canvas must actually mount a ReactFlow viewport —
    // not the "Workflow not found" error state from a failed useWorkflow
    // fetch. Wait for the viewport, then assert no error overlay.
    await page.waitForSelector(".react-flow__viewport", {
      state: "attached",
      timeout: 10_000
    });

    const errorOverlayCount = await page
      .locator(".loading-overlay")
      .filter({ hasText: /not found|error/i })
      .count();
    expect(errorOverlayCount).toBe(0);

    // ReactFlow should have at least one .react-flow__pane (per active canvas).
    const paneCount = await page
      .locator(".react-flow__pane")
      .count();
    expect(paneCount).toBeGreaterThan(0);
  });

  test("subgraph canvas accepts new nodes via pane context menu", async ({
    page
  }) => {
    await gotoEditor(page);

    await openPaneContextMenu(page);
    await clickAddSubgraph(page);
    const subgraphNode = page.locator(".subgraph-node").first();
    await subgraphNode.waitFor({ state: "attached", timeout: 5000 });

    await openSubgraphTab(page);
    await page.waitForSelector(".react-flow__viewport", {
      state: "attached",
      timeout: 10_000
    });

    // Count React Flow nodes currently in the subgraph canvas only. The
    // subgraph tab content renders BEFORE the parent canvas boxes in
    // TabsNodeEditor, so its React Flow viewport is FIRST in DOM order.
    const initialNodes = await page.evaluate(() => {
      const subgraphContent = document.querySelector(
        "[data-testid='subgraph-tab-content']"
      );
      return (
        subgraphContent?.querySelectorAll(".react-flow__node").length ?? 0
      );
    });

    await addStringInputToSubgraph(page);

    // The node count inside the subgraph canvas should increase by one.
    await page.waitForFunction(
      (n) => {
        const sub = document.querySelector(
          "[data-testid='subgraph-tab-content']"
        );
        return (sub?.querySelectorAll(".react-flow__node").length ?? 0) > n;
      },
      initialNodes,
      { timeout: 5000 }
    );
  });

  test("switches back to parent workflow tab and closes subgraph tab", async ({
    page
  }) => {
    await gotoEditor(page);

    await openPaneContextMenu(page);
    await clickAddSubgraph(page);
    const subgraphNode = page.locator(".subgraph-node").first();
    await subgraphNode.waitFor({ state: "attached", timeout: 5000 });

    await openSubgraphTab(page);

    // Back to the parent canvas: the subgraph tab stays open, the parent
    // graph is what the canvas shows again.
    await page.locator(".parent-tab").first().click();
    await expect(page.locator(".subgraph-tab.active")).toHaveCount(0);
    await expect(page.locator(".subgraph-node").first()).toBeVisible();

    await page.locator(".subgraph-tab .close-icon").first().click();

    // The strip disappears with its last subgraph tab.
    await expect(page.locator(".subgraph-tab")).toHaveCount(0);
  });

  test("keeps subgraph edits on the parent node", async ({ page }) => {
    await gotoEditor(page);

    await openPaneContextMenu(page);
    await clickAddSubgraph(page);
    await page
      .locator(".subgraph-node")
      .first()
      .waitFor({ state: "attached", timeout: 5000 });

    const handlesBefore = await page
      .locator(".subgraph-node .react-flow__handle")
      .count();

    await openSubgraphTab(page);
    await addStringInputToSubgraph(page);

    // Back on the parent canvas the SubgraphNode must expose the new boundary
    // port. That only happens if the inner graph was written back onto the
    // node — SubgraphSync derives the node's ports from `properties.graph`, so
    // a canvas whose edits never leave the tab would show no new handle.
    await page.locator(".parent-tab").first().click();
    await expect
      .poll(
        () => page.locator(".subgraph-node .react-flow__handle").count(),
        { timeout: 15_000 }
      )
      .toBeGreaterThan(handlesBefore);
  });
});
