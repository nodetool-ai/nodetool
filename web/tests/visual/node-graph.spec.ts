/**
 * Visual regression tests — Node Graph Editor.
 *
 * Covers the critical editor flows:
 *   - empty canvas (workflow with no nodes)
 *   - nodes added and connected (seeded 5-node story-generator workflow)
 *   - properties / inspector panel open
 *   - timeline editor view
 *
 * Backend: the seeded screenshot server (see tests/globalSetup.ts). Workflow
 * `wf-image-pipeline` ships with an empty graph; `wf-story-generator` ships
 * with 5 connected nodes (2 inputs → agent → preview/output).
 */

import { test, expect } from "@playwright/test";
import {
  gotoPage,
  VISUAL_SCREENSHOT_OPTIONS,
  ensureNoVisibleProgress
} from "./visualHelpers";
import { waitForAnimation } from "../benchmarks/helpers/waitHelpers";

/** Wait for ReactFlow to mount at least `count` nodes (tolerates lazy chunks). */
async function waitForNodes(
  page: import("@playwright/test").Page,
  count = 1
): Promise<void> {
  await page
    .waitForFunction(
      (n) => document.querySelectorAll(".react-flow__node").length >= n,
      count,
      { timeout: 15_000 }
    )
    .catch(() => {});
  await waitForAnimation(page, 800);
}

test.describe("Node Graph Editor", () => {
  test("empty canvas @smoke", async ({ page }) => {
    // wf-image-pipeline is seeded with an empty graph → bare editor chrome +
    // empty ReactFlow grid. The canonical "nothing here yet" editor state.
    await gotoPage(page, "/editor/wf-image-pipeline");
    await page
      .locator(".react-flow")
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => {});
    await ensureNoVisibleProgress(page);
    await waitForAnimation(page, 600);
    await expect(page).toHaveScreenshot(
      "node-graph-empty-canvas.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("nodes added and connected @smoke", async ({ page }) => {
    // wf-story-generator: 2 StringInputs → Agent → Preview + Output, with
    // edges between them. The canonical "populated graph" state.
    await gotoPage(page, "/editor/wf-story-generator");
    await waitForNodes(page, 1);
    await ensureNoVisibleProgress(page);
    await expect(page).toHaveScreenshot(
      "node-graph-nodes-connected.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("properties inspector panel open", async ({ page }) => {
    // Right panel (Inspector) seeded visible so node properties render without
    // driving a click. Captures the editor + inspector split layout.
    await gotoPage(page, "/editor/wf-story-generator", {
      panels: { right: { visible: true, activeView: "inspector" } }
    });
    await waitForNodes(page, 1);
    await ensureNoVisibleProgress(page);
    await expect(page).toHaveScreenshot(
      "node-graph-inspector-panel.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("left panel — node library", async ({ page }) => {
    // Left panel open on the "nodes" view: the searchable node catalogue used
    // to add nodes to the canvas.
    await gotoPage(page, "/editor/wf-story-generator", {
      panels: { left: { visible: true, activeView: "nodes" } }
    });
    await waitForNodes(page, 1);
    await ensureNoVisibleProgress(page);
    await expect(page).toHaveScreenshot(
      "node-graph-left-panel-nodes.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("timeline editor view", async ({ page }) => {
    // /timeline/tl-demo-promo mounts the sequencer: TopBar + tracks region +
    // status bar. Wait for the tracks resize separator as a stable landmark.
    await gotoPage(page, "/timeline/tl-demo-promo");
    await page
      .locator('[aria-label="Resize tracks panel"]')
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => {});
    await ensureNoVisibleProgress(page);
    await waitForAnimation(page, 800);
    await expect(page).toHaveScreenshot(
      "timeline-editor-view.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });
});
