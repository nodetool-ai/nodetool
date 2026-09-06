/**
 * Journey: the chat on a phone.
 *
 * A conversation scrolls up and down, never sideways. Content that genuinely
 * needs the width — a code block, a table, a JSON dump — scrolls inside its
 * own box; the thread itself stays put. Both checks drive the real surface at
 * phone width and try to pan it, so a layout regression that widens a turn
 * fails here rather than on someone's phone.
 */

import { test, expect, FIXTURES } from "./fixtures";
import { ChatPage } from "./pages";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** What a real answer puts in a turn: an unbreakable URL, a wide table, a long command. */
const WIDE_MARKDOWN = [
  "https://example.com/a/very/long/path/that/never/breaks/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "",
  "| column one | column two | column three | column four | column five | column six |",
  "| --- | --- | --- | --- | --- | --- |",
  "| aaaaaaaaaa | bbbbbbbbbb | cccccccccc | dddddddddd | eeeeeeeeee | ffffffffff |",
  "",
  "```sh",
  "docker run --rm -it --name nodetool --network host -e NODETOOL_API_URL=https://api.example.com/v1/endpoint ghcr.io/example/nodetool:latest",
  "```"
].join("\\n");

/** Text in the seeded assistant turn this suite rewrites into `WIDE_MARKDOWN`. */
const SEEDED_TAIL = "That night, they dreamed together.";

/** Try to pan `selector` right; report where it actually ended up. */
async function pan(page: import("@playwright/test").Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) {
      throw new Error(`no element for ${sel}`);
    }
    el.scrollLeft = 500;
    return {
      scrollLeft: el.scrollLeft,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth
    };
  }, selector);
}

test.describe("Chat on a phone", () => {
  test("a turn wider than the column does not pan the conversation", async ({
    page
  }) => {
    // The fixture backend has no model configured, so the wide turn is
    // injected into the seeded history rather than sent.
    await page.route("**/trpc/**", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      return route.fulfill({
        response,
        body: body.includes(SEEDED_TAIL)
          ? body.replace(SEEDED_TAIL, WIDE_MARKDOWN)
          : body
      });
    });

    const chat = new ChatPage(page);
    await page.goto(`/chat/${FIXTURES.thread}`, {
      waitUntil: "domcontentloaded"
    });
    await chat.waitForMessage("column three");
    // The fenced block is the last thing in the injected turn — once it is on
    // screen the turn has finished laying out and the widths are stable.
    await page
      .locator(".code-block-content")
      .waitFor({ state: "visible", timeout: 30_000 });

    const thread = await pan(page, ".scrollable-message-wrapper");
    expect(thread.scrollLeft, "the conversation panned sideways").toBe(0);
    expect(thread.scrollWidth).toBeLessThanOrEqual(thread.clientWidth);

    // The code block keeps its own horizontal scroll — locking the thread
    // must not make wide content unreachable.
    const code = await pan(page, ".code-block-content");
    expect(code.scrollWidth).toBeGreaterThan(code.clientWidth);
    expect(code.scrollLeft).toBeGreaterThan(0);
  });

  // 320px is the narrowest phone still in use; the longest opener chip is
  // wider than the column there, which is where the screen used to pan.
  test("the welcome screen does not pan sideways", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 780 });
    await page.goto("/chat/thread-mobile-welcome", {
      waitUntil: "domcontentloaded"
    });
    const welcome = page.locator(".chat-welcome");
    await welcome.waitFor({ state: "visible", timeout: 30_000 });

    const screen = await pan(page, ".chat-welcome");
    expect(screen.scrollLeft, "the welcome screen panned sideways").toBe(0);
    expect(screen.scrollWidth).toBeLessThanOrEqual(screen.clientWidth);
  });
});
