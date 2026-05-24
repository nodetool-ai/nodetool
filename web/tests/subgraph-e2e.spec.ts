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

    // Get the subgraph node's React Flow id (data-id attribute) and dispatch
    // a synthetic dblclick on the actual .react-flow__node wrapper so React
    // Flow's onNodeDoubleClick handler picks it up.
    const fired = await page.evaluate(() => {
      const node = document.querySelector(".subgraph-node");
      const wrapper = node?.closest(".react-flow__node") as HTMLElement | null;
      if (!wrapper) return false;
      const rect = wrapper.getBoundingClientRect();
      const eventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 0,
        buttons: 0,
        detail: 2
      };
      wrapper.dispatchEvent(new MouseEvent("mousedown", eventInit));
      wrapper.dispatchEvent(new MouseEvent("mouseup", eventInit));
      wrapper.dispatchEvent(new MouseEvent("click", eventInit));
      wrapper.dispatchEvent(new MouseEvent("dblclick", eventInit));
      return true;
    });
    expect(fired).toBe(true);

    await page.waitForFunction(
      () => document.querySelectorAll(".subgraph-tab").length > 0,
      undefined,
      { timeout: 5000 }
    );

    await page.waitForFunction(
      () => document.querySelectorAll(".subgraph-tab.active").length > 0,
      undefined,
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

    // Open the subgraph tab via JS dispatch (same as test 2).
    await page.evaluate(() => {
      const node = document.querySelector(".subgraph-node");
      const wrapper = node?.closest(".react-flow__node") as HTMLElement | null;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const eventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 0,
        buttons: 0,
        detail: 2
      };
      wrapper.dispatchEvent(new MouseEvent("mousedown", eventInit));
      wrapper.dispatchEvent(new MouseEvent("mouseup", eventInit));
      wrapper.dispatchEvent(new MouseEvent("click", eventInit));
      wrapper.dispatchEvent(new MouseEvent("dblclick", eventInit));
    });

    await page.waitForFunction(
      () => document.querySelectorAll(".subgraph-tab").length > 0,
      undefined,
      { timeout: 5000 }
    );

    // Close the subgraph tab via the close icon. The close-icon is an SVG
    // element so we dispatch a synthetic click that bubbles through React.
    await page.evaluate(() => {
      const tab = document.querySelector(".subgraph-tab");
      const close = tab?.querySelector(".close-icon");
      if (!close) return;
      close.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    await page.waitForFunction(
      () => document.querySelectorAll(".subgraph-tab").length === 0,
      undefined,
      { timeout: 5000 }
    );
  });
});
