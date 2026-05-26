import { test, expect } from "@playwright/test";

/**
 * End-to-end: NodeTool's kernel executes a graph inside a real
 * (headless) browser.
 *
 * Status: SCAFFOLDING. The harness boots and the static-page assertion
 * passes. The full workflow-execution assertions are currently skipped
 * because Vite's pre-transform of `@nodetool-ai/node-sdk` and
 * `@nodetool-ai/runtime` from the workspace symlink trips on `node:fs/
 * promises` static imports that the polyfill plugin's resolver doesn't
 * intercept in time. Two follow-ups would unblock the rest of the suite:
 *
 *   1. Split node-sdk's metadata-loader (fs-using Python scanner) into a
 *      sibling subpath export so the browser entry doesn't pull it in.
 *   2. Replace the workspace symlinks in the e2e bundle with the
 *      published `dist/` paths (via `optimizeDeps.include` or rollup
 *      external rules) so node-stdlib-browser's mapping fires correctly.
 *
 * For now, this file proves the Playwright + Vite + Chromium harness
 * itself is wired up; the workflow-execution cases run as `test.skip`
 * pending the bundler fix.
 */

test.beforeEach(async ({ page }) => {
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      console.log(`[browser ${msg.type()}]`, msg.text());
    }
  });
  page.on("pageerror", (err) => {
    console.log("[browser pageerror]", err.message);
  });
  await page.goto("/");
});

test("Playwright + Vite harness reaches the index page", async ({ page }) => {
  // The index page is served, the bundle entry tag is in the DOM. Whether
  // the bundle module evaluates successfully is the follow-up; this just
  // confirms the dev server + Playwright wiring works.
  const title = await page.title();
  expect(title).toBe("workflow-runner browser harness");
});

test.skip(
  "harness boots in a real browser (no Node APIs)",
  async ({ page }) => {
    await page.waitForFunction(
      () =>
        (window as unknown as { workflowRunnerReady?: boolean })
          .workflowRunnerReady === true,
      null,
      { timeout: 15_000 }
    );
    const ua = await page.evaluate(() => window.runtimeName);
    expect(ua).toMatch(/Chrome|HeadlessChrome/);
  }
);

test.skip(
  "registry.forPlatform('browser') includes the browser-tagged nodes",
  async ({ page }) => {
    await page.waitForFunction(
      () =>
        (window as unknown as { workflowRunnerReady?: boolean })
          .workflowRunnerReady === true
    );
    const browserNodes = await page.evaluate(() => window.listBrowserNodes());
    expect(browserNodes).toContain("browsertest.ConstantText");
    expect(browserNodes).toContain("browsertest.BrowserOnly");
    expect(browserNodes).not.toContain("browsertest.NodeOnly");
  }
);

test.skip(
  "a single-node graph produces its constant output",
  async ({ page }) => {
    await page.waitForFunction(
      () =>
        (window as unknown as { workflowRunnerReady?: boolean })
          .workflowRunnerReady === true
    );
    const result = await page.evaluate(async () => {
      return window.runWorkflowInBrowser({
        nodes: [
          {
            id: "n1",
            type: "browsertest.ConstantText",
            name: "greeting",
            properties: { value: "hello from the browser" }
          }
        ],
        edges: []
      });
    });
    expect(result.status).toBe("completed");
    expect(result.outputs.greeting).toEqual(["hello from the browser"]);
  }
);

test.skip(
  "a multi-node graph flows values across an edge",
  async ({ page }) => {
    await page.waitForFunction(
      () =>
        (window as unknown as { workflowRunnerReady?: boolean })
          .workflowRunnerReady === true
    );
    const result = await page.evaluate(async () => {
      return window.runWorkflowInBrowser({
        nodes: [
          {
            id: "src",
            type: "browsertest.ConstantText",
            properties: { value: "shouting" }
          },
          { id: "upper", type: "browsertest.Uppercase", name: "loud" }
        ],
        edges: [
          {
            source: "src",
            sourceHandle: "output",
            target: "upper",
            targetHandle: "text"
          }
        ]
      });
    });
    expect(result.status).toBe("completed");
    expect(result.outputs.loud).toEqual(["SHOUTING"]);
  }
);

test.skip(
  "the platform validator rejects node-only graphs pre-flight",
  async ({ page }) => {
    await page.waitForFunction(
      () =>
        (window as unknown as { workflowRunnerReady?: boolean })
          .workflowRunnerReady === true
    );
    const result = await page.evaluate(async () => {
      return window.runWorkflowInBrowser({
        nodes: [{ id: "bad", type: "browsertest.NodeOnly" }],
        edges: []
      });
    });
    expect(result.status).toBe("failed");
    expect(result.error ?? "").toMatch(/browser/i);
  }
);
