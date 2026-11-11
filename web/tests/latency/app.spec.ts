/**
 * Doherty threshold: chat and app-level navigation.
 *
 * Each interaction is timed from its input event to the first frame that shows
 * its result, and fails above 400 ms. See `doherty.ts` for the method.
 */

import { ChatPage, EditorPage } from "../journeys/pages";
import { measureInteraction } from "./doherty";
import { test } from "./fixtures";

test.describe("Doherty threshold: app", () => {
  test("chat", async ({ page }, testInfo) => {
    const chat = new ChatPage(page);
    await chat.open("thread-story");
    const composer = chat.composer();
    await composer.click();
    let typed = "";

    await measureInteraction(page, testInfo, {
      name: "type into the chat composer",
      runs: 8,
      act: async () => {
        typed += "a";
        await page.keyboard.press("a");
      },
      ready: async () => ({ selector: "textarea, [contenteditable=true]", text: `${typed}a` })
    });
    await composer.fill("");

    let sent = 0;
    await measureInteraction(page, testInfo, {
      name: "send a chat message until it shows",
      runs: 3,
      reset: async () => {
        sent += 1;
        await composer.fill(`latency probe ${sent}`);
        // A reply still streaming keeps the composer busy.
        await page.locator(".media-send-btn:visible").first().waitFor();
      },
      act: () => composer.press("Enter"),
      ready: async () => ({
        selector: "p",
        text: `latency probe ${sent}`
      })
    });
  });

  test("navigation", async ({ page }, testInfo) => {
    const editor = new EditorPage(page);
    await editor.open("wf-editor-journey");
    const settingsTab = page.locator('[role="tab"]', { hasText: "Settings" });

    await measureInteraction(page, testInfo, {
      name: "open settings",
      runs: 3,
      reset: async () => {
        if (await settingsTab.count()) {
          await settingsTab.hover();
          await settingsTab.getByRole("button", { name: /close/i }).click();
          await settingsTab.waitFor({ state: "detached" });
        }
        await editor.node("prompt_input").waitFor();
        await editor.clickPane();
      },
      act: () => page.keyboard.press("ControlOrMeta+Comma"),
      ready: { selector: 'input[placeholder="Search settings"]' },
      feedback: { selector: '[role="tab"][aria-selected="true"]', text: "Settings" }
    });
  });
});
