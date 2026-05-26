import { test, expect } from "@playwright/test";

/**
 * End-to-end: NodeTool's kernel executes a graph inside a real
 * (headless) browser.
 *
 * The harness bundles `@nodetool-ai/kernel` (with `@nodetool-ai/config`
 * lazy-loading its `node:fs`/`node:os`/`node:path` deps) and runs a
 * `WorkflowRunner` with inline `NodeExecutor` fixtures. If these pass,
 * the actor model — inbox routing, validator dispatch, message
 * emission — works in a V8 isolate with no Node APIs.
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
  await page.waitForFunction(
    () =>
      (window as unknown as { workflowRunnerReady?: boolean })
        .workflowRunnerReady === true,
    null,
    { timeout: 15_000 }
  );
});

test("harness boots in a real browser (no Node APIs)", async ({ page }) => {
  const ua = await page.evaluate(() => window.runtimeName);
  expect(ua).toMatch(/Chrome|HeadlessChrome/);
});

test("a single-node graph produces its constant output", async ({ page }) => {
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
  expect(result.messageTypes).toContain("job_update");
});

test("a multi-node graph flows values across an edge", async ({ page }) => {
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
});

test("a multi-edge graph aggregates two sources into one sink", async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    return window.runWorkflowInBrowser({
      nodes: [
        {
          id: "a",
          type: "browsertest.ConstantText",
          properties: { value: "hello, " }
        },
        {
          id: "b",
          type: "browsertest.ConstantText",
          properties: { value: "world!" }
        },
        { id: "concat", type: "browsertest.Concat", name: "joined" }
      ],
      edges: [
        {
          source: "a",
          sourceHandle: "output",
          target: "concat",
          targetHandle: "a"
        },
        {
          source: "b",
          sourceHandle: "output",
          target: "concat",
          targetHandle: "b"
        }
      ]
    });
  });

  expect(result.status).toBe("completed");
  expect(result.outputs.joined).toEqual(["hello, world!"]);
});
