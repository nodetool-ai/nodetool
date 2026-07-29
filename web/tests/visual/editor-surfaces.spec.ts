/**
 * Visual regression tests — editor surfaces beyond the canvas.
 *
 * `node-graph.spec.ts` covers the canvas itself plus the inspector and node
 * library panels. This spec covers the rest of the editor chrome, including
 * the transient surfaces a user opens with the keyboard or the mouse:
 *   - bottom panel (logs) — the run-output dock
 *   - left panel (workflows) — the workflow library
 *   - left panel (assets) — drag-in media
 *   - command menu (Ctrl/Cmd+K)
 *   - node menu (Space) — the searchable add-node overlay
 *   - node context menu (right-click)
 *
 * All of them run against `wf-story-generator`, the seeded 5-node graph.
 *
 * Chromium only: the editor mounts canvases Firefox does not initialise the
 * same way (see the Firefox scope note in README.md), so none of these carry
 * `@smoke`.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  gotoPage,
  VISUAL_SCREENSHOT_OPTIONS,
  ensureNoVisibleProgress,
  volatileMask,
  type PanelOverrides
} from "./visualHelpers";
import { waitForAnimation } from "../benchmarks/helpers/waitHelpers";

const WORKFLOW = "/editor/wf-story-generator";

/** Open the seeded graph and wait until ReactFlow has laid its nodes out. */
async function openEditor(
  page: Page,
  panels?: PanelOverrides
): Promise<void> {
  await gotoPage(page, WORKFLOW, panels ? { panels } : {});
  await page
    .waitForFunction(
      () => document.querySelectorAll(".react-flow__node").length > 0,
      undefined,
      { timeout: 20_000 }
    )
    .catch(() => {});
  await ensureNoVisibleProgress(page);
  await waitForAnimation(page, 800);
}

/**
 * Press a shortcut, trying Control first and falling back to Meta, and wait
 * for `surface` to appear. Playwright's reported platform doesn't always match
 * the modifier the app binds, so both are attempted.
 */
async function pressUntilVisible(
  page: Page,
  keys: { control: string; meta: string },
  surface: string
): Promise<void> {
  const target = page.locator(surface).first();
  await page.keyboard.press(keys.control).catch(() => {});
  const opened = await target
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!opened) {
    await page.keyboard.press(keys.meta).catch(() => {});
    await target.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  }
  await waitForAnimation(page, 400);
}

/** Park the pointer at the canvas centre — menus anchor to the cursor. */
async function centerPointerOnCanvas(page: Page): Promise<void> {
  const box = await page.locator(".react-flow").first().boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  }
}

test.describe("Editor surfaces", () => {
  test("bottom panel — logs", async ({ page }) => {
    // The run dock: log stream, run controls and the tab strip that switches
    // to queue / sandboxes / versions / trace.
    await openEditor(page, { bottom: { visible: true, activeView: "logs" } });
    await expect(page).toHaveScreenshot("editor-bottom-panel-logs.png", {
      ...VISUAL_SCREENSHOT_OPTIONS,
      mask: volatileMask(page)
    });
  });

  test("left panel — workflow library", async ({ page }) => {
    // The list a user picks their saved workflows from, with its search box.
    await openEditor(page, {
      left: { visible: true, activeView: "workflows" }
    });
    await expect(page).toHaveScreenshot("editor-left-panel-workflows.png", {
      ...VISUAL_SCREENSHOT_OPTIONS,
      mask: volatileMask(page)
    });
  });

  test("left panel — assets", async ({ page }) => {
    // The in-editor asset browser: the folders and files that get dragged
    // onto the canvas.
    await openEditor(page, { left: { visible: true, activeView: "assets" } });
    await expect(page).toHaveScreenshot("editor-left-panel-assets.png", {
      ...VISUAL_SCREENSHOT_OPTIONS,
      mask: volatileMask(page)
    });
  });

  test("command menu", async ({ page }) => {
    // Ctrl/Cmd+K — the global command palette overlaying the editor.
    await openEditor(page);
    await pressUntilVisible(
      page,
      { control: "Control+K", meta: "Meta+K" },
      ".command-menu-dialog"
    );
    await expect(page).toHaveScreenshot("editor-command-menu.png", {
      ...VISUAL_SCREENSHOT_OPTIONS,
      mask: volatileMask(page)
    });
  });

  test("node menu", async ({ page }) => {
    // Space over the canvas opens the searchable add-node overlay: the
    // category tree, the result list and the optional-packs trigger.
    await openEditor(page);
    await centerPointerOnCanvas(page);
    await page.keyboard.press(" ").catch(() => {});
    await page
      .locator(".floating-node-menu, .node-menu")
      .first()
      .waitFor({ state: "visible", timeout: 8_000 })
      .catch(() => {});
    await waitForAnimation(page, 500);
    await expect(page).toHaveScreenshot("editor-node-menu.png", {
      ...VISUAL_SCREENSHOT_OPTIONS,
      mask: volatileMask(page)
    });
  });

  test("node context menu", async ({ page }) => {
    // Right-clicking a node opens its per-node actions (duplicate, delete,
    // collapse, …).
    await openEditor(page);
    const node = page.locator(".react-flow__node").first();
    await node.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    await node.click({ button: "right" }).catch(() => {});
    await page
      .locator('.MuiMenu-paper, [role="menu"]')
      .first()
      .waitFor({ state: "visible", timeout: 6_000 })
      .catch(() => {});
    await waitForAnimation(page, 400);
    await expect(page).toHaveScreenshot("editor-node-context-menu.png", {
      ...VISUAL_SCREENSHOT_OPTIONS,
      mask: volatileMask(page)
    });
  });
});
