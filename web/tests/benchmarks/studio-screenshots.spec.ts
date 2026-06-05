/**
 * Studio MVP screenshots.
 *
 * Captures the transcript-driven editor in a few scenarios against the seeded
 * screenshot backend (see packages/websocket/src/screenshot-server.ts):
 *   - the populated Studio sequence (tl-studio-demo, vertical 9:16),
 *   - the Transcript panel on its own,
 *   - a beat selected (playhead jumped, clips selected),
 *   - the empty Transcript state on a sequence with no script (tl-demo-promo).
 *
 * Output goes to a throwaway dir so it is never committed:
 *   npx playwright test tests/benchmarks/studio-screenshots.spec.ts --project=chromium
 */
import { test, Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const OUT_DIR = process.env.STUDIO_SHOT_DIR ?? "/tmp/studio-shots";
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function bypassOnboarding(page: Page): Promise<void> {
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
      /* localStorage may be unavailable */
    }
  });
}

async function openSequence(page: Page, sequenceId: string): Promise<void> {
  await bypassOnboarding(page);
  await page.goto(`/timeline/${sequenceId}`);

  const loadingOverlay = page.locator(
    '[role="status"][aria-label="Loading NodeTool"]'
  );
  if ((await loadingOverlay.count()) > 0) {
    await loadingOverlay
      .first()
      .waitFor({ state: "hidden", timeout: 30_000 })
      .catch(() => {});
  }

  // The Transcript panel is the new Studio surface; wait for its subtitle.
  await page
    .getByText(/each line becomes a voiced/i)
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(900);
}

const shot = (page: Page, name: string, fullPage = false) =>
  page.screenshot({ path: path.join(OUT_DIR, name), fullPage });

test.describe("Studio transcript editor", () => {
  test("populated sequence — full editor", async ({ page }) => {
    await openSequence(page, "tl-studio-demo");
    // The first beat's script should be present in the panel.
    await page
      .getByText(/Aurora headphones/i)
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => {});
    await shot(page, "studio-editor-full.png");

    const panel = page.locator('[data-testid="transcript-panel"]').first();
    if ((await panel.count()) > 0) {
      await panel
        .screenshot({ path: path.join(OUT_DIR, "studio-transcript-panel.png") })
        .catch(() => {});
    }
  });

  test("beat selected — playhead jumped + clips selected", async ({ page }) => {
    await openSequence(page, "tl-studio-demo");
    // Click the third beat's script to seek the playhead and select its clips.
    const thirdBeat = page.getByText(/Pre-order today/i).first();
    if ((await thirdBeat.count()) > 0) {
      await thirdBeat.click().catch(() => {});
      await page.waitForTimeout(700);
    }
    await shot(page, "studio-editor-beat-selected.png");
  });

  test("empty transcript state", async ({ page }) => {
    await openSequence(page, "tl-demo-promo");
    await page
      .getByText(/no script yet/i)
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => {});
    await shot(page, "studio-editor-empty.png");

    const panel = page.locator('[data-testid="transcript-panel"]').first();
    if ((await panel.count()) > 0) {
      await panel
        .screenshot({ path: path.join(OUT_DIR, "studio-transcript-empty.png") })
        .catch(() => {});
    }
  });
});
