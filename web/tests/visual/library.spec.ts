/**
 * Visual regression tests — library and resource-manager pages.
 *
 * The surfaces a user manages their stuff on, none of which the editor/chat
 * specs touch:
 *   - assets explorer (folder tree + grid)
 *   - collections (vector stores backing RAG)
 *   - model manager
 *   - package manager
 *   - examples / template browser
 *   - workspaces
 *
 * Backend: the seeded screenshot server. It ships 5 asset folders plus
 * root-level files, and serves the example workflows straight from the repo. No
 * collections and no workspaces are seeded, so those two pages capture their
 * empty states — a real surface, and the one a new user sees first.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  gotoPage,
  VISUAL_SCREENSHOT_OPTIONS,
  ensureNoVisibleProgress,
  volatileMask
} from "./visualHelpers";
import { waitForAnimation } from "../benchmarks/helpers/waitHelpers";

/**
 * Open a manager page and wait until its content has settled: the page-level
 * spinner is gone and `landmark` (a text or role that only appears once the
 * data has rendered) is visible.
 */
async function gotoManagerPage(
  page: Page,
  url: string,
  landmark: (p: Page) => Promise<void>
): Promise<void> {
  await gotoPage(page, url);
  await landmark(page);
  await ensureNoVisibleProgress(page);
  await waitForAnimation(page, 700);
}

test.describe("Library pages", () => {
  test("assets explorer @responsive @smoke", async ({ page }) => {
    // Folder tree (Images / Audio / Documents / Video / Data) beside the grid
    // of root-level files. Asset dates are relative, so they're masked.
    await gotoManagerPage(page, "/assets", (p) =>
      p
        .getByPlaceholder("Search current folder...")
        .first()
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => {})
    );
    await expect(page).toHaveScreenshot("library-assets-explorer.png", {
      ...VISUAL_SCREENSHOT_OPTIONS,
      mask: volatileMask(page)
    });
  });

  test("collections", async ({ page }) => {
    // No collections are seeded → the empty state with its create affordance.
    await gotoManagerPage(page, "/collections", (p) =>
      p
        .getByText("Vector Collections")
        .first()
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => {})
    );
    await expect(page).toHaveScreenshot(
      "library-collections.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("model manager", async ({ page }) => {
    // Model cards + provider filters. The list is served by the seeded
    // backend's model registry, so it's fixed across runs.
    await gotoManagerPage(page, "/models", (p) =>
      p
        .getByText("Get started with local models")
        .first()
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => {})
    );
    await expect(page).toHaveScreenshot(
      "library-models.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("package manager", async ({ page }) => {
    // Installable node packs — the surface that grows the node library.
    await gotoManagerPage(page, "/packages", (p) =>
      p
        .getByText("Included packs")
        .first()
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => {})
    );
    await expect(page).toHaveScreenshot(
      "library-packages.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("examples / templates @smoke", async ({ page }) => {
    // The template browser — the cards a new user starts from. It lists the
    // example workflows shipped in the repo (resolved by the backend from
    // packages/base-nodes), not the seeded rows, so the grid is fixed.
    await gotoManagerPage(page, "/examples", (p) =>
      p
        .getByText("Start from a template")
        .first()
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => {})
    );
    await expect(page).toHaveScreenshot("library-examples.png", {
      ...VISUAL_SCREENSHOT_OPTIONS,
      mask: volatileMask(page)
    });
  });

  test("workspaces", async ({ page }) => {
    await gotoManagerPage(page, "/workspaces", (p) =>
      p
        .getByRole("heading", { name: "Workspaces" })
        .first()
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => {})
    );
    await expect(page).toHaveScreenshot("library-workspaces.png", {
      ...VISUAL_SCREENSHOT_OPTIONS,
      mask: volatileMask(page)
    });
  });
});
