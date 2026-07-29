/**
 * Visual regression tests — Chat Interface.
 *
 * Covers the critical chat flows:
 *   - empty conversation (new chat, no messages)
 *   - message thread (seeded user + assistant turns with markdown)
 *   - media generation UI (composer mode menu: chat / image / video / speech)
 *   - composer settings (language-model selector)
 *
 * Backend: seeded screenshot server. Thread `thread-story` has a user prompt
 * and a long markdown assistant reply.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  gotoPage,
  VISUAL_SCREENSHOT_OPTIONS,
  ensureNoVisibleProgress
} from "./visualHelpers";
import { waitForAnimation } from "../benchmarks/helpers/waitHelpers";

/** Wait for the chat composer to mount — the stable landmark on every chat view. */
async function waitForComposer(page: Page): Promise<void> {
  await page
    .locator('textarea, [contenteditable="true"]')
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {});
  await ensureNoVisibleProgress(page);
}

/**
 * Open a composer control-chip popover. Chip order inside `.media-chip-main`:
 *   0 → mode (Chat / Generate Images / …)
 *   1 → language model
 * Permission uses a separate `.permission-selector-trigger`.
 * Returns false if the composer never mounted (so the test can skip cleanly).
 */
async function openComposerChip(
  page: Page,
  which: "mode" | "model" | "permission"
): Promise<boolean> {
  const selector =
    which === "permission"
      ? ".permission-selector-trigger"
      : ".media-chip-main .media-control-chip";
  const index = which === "mode" ? 0 : which === "model" ? 1 : 0;
  const chip = page.locator(selector).nth(index);
  try {
    await chip.waitFor({ state: "visible", timeout: 12_000 });
    await chip.click();
    await waitForAnimation(page, 500);
    return true;
  } catch {
    return false;
  }
}

test.describe("Chat Interface", () => {
  test("empty conversation @responsive @smoke", async ({ page }) => {
    // /chat with no thread id → fresh, empty conversation. The composer is the
    // primary surface; the message area is the empty-state.
    await gotoPage(page, "/chat");
    await waitForComposer(page);
    await waitForAnimation(page, 600);
    await expect(page).toHaveScreenshot(
      "chat-empty-conversation.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("message thread @responsive @smoke", async ({ page }) => {
    // thread-story: a user prompt + a long markdown assistant reply (headings,
    // paragraphs, emphasis). The canonical "populated thread" state.
    await gotoPage(page, "/chat/thread-story");
    await waitForComposer(page);
    // Wait for the assistant markdown to render before capturing.
    await page
      .getByText(/dreams of silicon/i)
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => {});
    await waitForAnimation(page, 800);
    await expect(page).toHaveScreenshot(
      "chat-message-thread.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("media generation UI (composer modes) @smoke", async ({ page }) => {
    // Open the composer mode menu to reveal Chat / Generate Images / Video /
    // Speech — the media-generation entry points.
    await gotoPage(page, "/chat/thread-story");
    await waitForComposer(page);
    if (await openComposerChip(page, "mode")) {
      await page
        .getByRole("menu", { name: /generation mode/i })
        .first()
        .waitFor({ state: "visible", timeout: 8_000 })
        .catch(() => {});
    }
    await waitForAnimation(page, 400);
    await expect(page).toHaveScreenshot(
      "chat-media-generation-ui.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("composer settings — language model @smoke", async ({ page }) => {
    // The model selector opened from the composer's model chip — the chat
    // "settings" surface where users pick which LLM answers.
    await gotoPage(page, "/chat/thread-story");
    await waitForComposer(page);
    if (await openComposerChip(page, "model")) {
      await page
        .getByText(/select language model/i)
        .first()
        .waitFor({ state: "visible", timeout: 8_000 })
        .catch(() => {});
    }
    await waitForAnimation(page, 400);
    await expect(page).toHaveScreenshot(
      "chat-composer-model-selector.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });

  test("dashboard / portal @responsive @smoke", async ({ page }) => {
    // The portal (/dashboard) is the chat-led home surface: header + composer
    // + recent threads. Grouped with chat since it shares the composer shell.
    await gotoPage(page, "/dashboard");
    await page
      .locator('header, [role="banner"], textarea')
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => {});
    await ensureNoVisibleProgress(page);
    await waitForAnimation(page, 800);
    await expect(page).toHaveScreenshot(
      "dashboard-portal.png",
      VISUAL_SCREENSHOT_OPTIONS
    );
  });
});
