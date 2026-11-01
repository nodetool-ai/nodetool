/**
 * Journey: a multi-step request shows the agent's plan as a task list.
 *
 * This is an eval, not a hermetic test: the chat model is the real Claude
 * Agent SDK provider while image generation stays on the fakes. Run it with
 *
 *   NODETOOL_REAL_PROVIDERS=claude_agent_sdk \
 *     npx playwright test -c playwright.journeys.config.ts agent-task-list
 *
 * It needs a logged-in `claude` CLI (or `CLAUDE_CODE_OAUTH_TOKEN`) and is
 * skipped without the variable. A task list is what lets a user follow a long
 * turn without reading every tool call, so the check is that the task dock
 * above the composer appears with more than one item and ends with every
 * item completed.
 */

import { test, expect, FIXTURES } from "./fixtures";
import { ChatPage } from "./pages";

const REAL_CLAUDE = (process.env.NODETOOL_REAL_PROVIDERS ?? "")
  .split(",")
  .includes("claude_agent_sdk");

const CLAUDE_MODEL = {
  type: "language_model",
  provider: "claude_agent_sdk",
  id: process.env.NODETOOL_EVAL_CLAUDE_MODEL ?? "sonnet",
  name: "Claude (subscription)"
};

test.describe("Agent task list", () => {
  test.skip(!REAL_CLAUDE, "needs NODETOOL_REAL_PROVIDERS=claude_agent_sdk");
  test.setTimeout(600_000);

  test("plans a multi-step launch kit as tasks", async ({ page }, testInfo) => {
    await page.addInitScript(
      ({ model, thread }) => {
        window.localStorage.setItem(
          "global-chat-storage",
          JSON.stringify({
            state: {
              threads: {},
              selectedModel: model,
              threadModel: { [thread]: model },
              // Generations ask for approval in Default mode. The eval is
              // about the task list, not the approval card.
              permissionMode: { [thread]: "auto" },
              lastPermissionMode: "auto"
            },
            version: 2
          })
        );
      },
      { model: CLAUDE_MODEL, thread: FIXTURES.thread }
    );

    const chat = new ChatPage(page);
    await chat.open(FIXTURES.thread);
    await chat.send(
      "Make a launch kit for a coffee shop called Fox & Bean: a logo, a " +
        "night-time poster and a square Instagram ad, each made with the " +
        "openai test-image-model, then a one-line caption for each image " +
        "and a short launch post."
    );

    const dock = page.locator("section.task-dock");
    await expect(dock).toBeVisible({ timeout: 300_000 });
    // The dock starts collapsed to the current task. Unfold the full list.
    await dock.locator(".task-dock-bar").click();
    await page.screenshot({
      path: testInfo.outputPath("task-list-in-progress.png")
    });

    const items = dock.locator(".task-dock-item");
    await expect
      .poll(async () => items.count(), { timeout: 60_000 })
      .toBeGreaterThan(1);
    await expect(dock.locator(".task-dock-item.completed")).toHaveCount(
      await items.count(),
      { timeout: 300_000 }
    );
    await page.screenshot({
      path: testInfo.outputPath("task-list-done.png"),
      fullPage: true
    });
  });
});
