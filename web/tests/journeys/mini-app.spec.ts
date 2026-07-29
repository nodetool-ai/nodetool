/**
 * Journey: open a mini app, run it, read the result.
 *
 * Covers the app runtime and the streaming fold: the app document's widgets
 * bind to its operation's inputs and outputs, the Run button triggers a job,
 * and the streamed messages fold back into the Output widget's value.
 *
 * The `app-mini-app` fixture binds `wf-mini-app`, a `StringInput → Output`
 * echo, so the assertion is exact — the text typed into the input is the text
 * the Output widget must display. Nothing in that path is faked, which makes
 * this the strongest end-to-end signal in the suite.
 */

import { test, expect, FIXTURES } from "./fixtures";
import { MiniAppPage } from "./pages";

test.describe("Mini app", () => {
  test("renders the app document's widgets", async ({ page, pageErrors }) => {
    const app = new MiniAppPage(page);
    await app.open(FIXTURES.miniAppName);

    await expect(app.runButton()).toBeVisible();
    await expect(app.promptInput().first()).toBeVisible();

    expect(pageErrors, "mini app loaded with page errors").toEqual([]);
  });

  test("runs with the seeded input value", async ({ page }) => {
    const app = new MiniAppPage(page);
    await app.open(FIXTURES.miniAppName);

    await app.run();

    await app.waitForOutput(FIXTURES.echoSeedValue);
  });

  test("runs with a value the user typed", async ({ page }) => {
    const app = new MiniAppPage(page);
    await app.open(FIXTURES.miniAppName);

    // Distinct from the seeded default, so a stale or ignored param fails
    // instead of passing on the old value.
    const typed = "journey-typed-value";
    await app.fillPrompt(typed);
    await app.run();

    await app.waitForOutput(typed);
  });
});
