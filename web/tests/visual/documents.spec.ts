/**
 * Visual regression tests — document editors other than the node graph.
 *
 * NodeTool edits several document types besides workflows, each with its own
 * chrome and none of them covered elsewhere in this suite:
 *   - the sketch (image) editor          → /sketch/:documentId
 *   - the storyboard board               → /workspace, storyboard tab
 *   - the entities library               → /workspace, page tab
 *   - the studio (transcript) timeline   → /timeline/tl-studio-demo
 *
 * The workspace surfaces are reached by seeding the tab store rather than
 * clicking through the left rail: the tab list is what the shell renders from,
 * so seeding it is both faster and less flaky than driving the navigation, and
 * the journey suite already covers the click path.
 *
 * Backend fixtures (screenshot-server.ts): `sk-demo-portrait` (1024×1024 image
 * document), `sb-demo-noir` (storyboard with four entities), `tl-studio-demo`
 * (a scripted "studio" sequence).
 */

import { test, expect, type Page } from "@playwright/test";
import {
  gotoPage,
  VISUAL_SCREENSHOT_OPTIONS,
  ensureNoVisibleProgress,
  volatileMask
} from "./visualHelpers";
import { waitForAnimation } from "../benchmarks/helpers/waitHelpers";

/** Settle a document surface: no spinner, animations done. */
async function settle(page: Page, ms = 800): Promise<void> {
  await ensureNoVisibleProgress(page);
  await waitForAnimation(page, ms);
}

test.describe("Document editors", () => {
  test("sketch editor", async ({ page }) => {
    // The image editor: tool rail, layer list and the canvas holding the
    // seeded document's layers.
    await gotoPage(page, "/sketch/sk-demo-portrait");
    await page
      .locator("canvas")
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .catch(() => {});
    await settle(page, 1_000);
    await expect(page).toHaveScreenshot("documents-sketch-editor.png", {
      ...VISUAL_SCREENSHOT_OPTIONS,
      mask: volatileMask(page)
    });
  });

  test("storyboard board", async ({ page }) => {
    // `sb-demo-noir` carries shots that mention the seeded entities by name,
    // so the entity chips and the Direct action are both populated.
    await gotoPage(page, "/workspace", {
      workspace: {
        tabs: [
          { type: "storyboard", ref: "sb-demo-noir", title: "Harbor Noir" }
        ]
      }
    });
    await page
      .getByRole("button", { name: /^direct$/i })
      .first()
      .waitFor({ state: "visible", timeout: 25_000 })
      .catch(() => {});
    await settle(page);
    await expect(page).toHaveScreenshot("documents-storyboard.png", {
      ...VISUAL_SCREENSHOT_OPTIONS,
      // The sidebar rows carry a "N shots · <updated at>" line, and opening a
      // board touches its updatedAt — the whole row is masked because the
      // timestamp has no element of its own.
      mask: [...volatileMask(page), page.locator(".board-row")]
    });
  });

  test("entities library", async ({ page }) => {
    // Entities are the assets tagged as characters / locations / styles /
    // props that storyboards and chat mentions draw from.
    await gotoPage(page, "/workspace", {
      workspace: {
        tabs: [{ type: "page", ref: "entities", title: "Entities" }]
      }
    });
    await page
      .getByText("Marta")
      .first()
      .waitFor({ state: "visible", timeout: 25_000 })
      .catch(() => {});
    await settle(page);
    await expect(page).toHaveScreenshot("documents-entities-library.png", {
      ...VISUAL_SCREENSHOT_OPTIONS,
      mask: volatileMask(page)
    });
  });

  test("timeline editor — studio transcript view", async ({ page }) => {
    // `tl-studio-demo` carries a script, so the sequencer mounts its studio
    // layout: transcript pane, caption/B-roll tracks and the generate bar.
    // `tl-demo-promo` (node-graph.spec.ts) has no script and shows none of it.
    await gotoPage(page, "/timeline/tl-studio-demo");
    await page
      .getByTestId("preview-compositor")
      .waitFor({ state: "visible", timeout: 25_000 })
      .catch(() => {});
    await settle(page);
    await expect(page).toHaveScreenshot("documents-timeline-studio.png", {
      ...VISUAL_SCREENSHOT_OPTIONS,
      mask: volatileMask(page)
    });
  });
});
