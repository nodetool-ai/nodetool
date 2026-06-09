import { test, expect } from "@playwright/test";

/**
 * End-to-end: the **production** in-browser execution path runs real,
 * decorator-compiled NodeTool node classes inside a real (headless) browser.
 *
 * Unlike `browser-workflow.spec.ts` (which uses inline `NodeExecutor`
 * fixtures), this drives `createBrowserRegistry` + `runBrowserWorkflow` — the
 * exact API the web app uses — over the curated `core-nodes` set. If these
 * pass, the registry, ProcessingContext, actor runtime and the
 * job/workflow-stamped message stream all work in a V8 isolate.
 */

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (err) => console.log("[browser pageerror]", err.message));
  await page.goto("/");
  await page.waitForFunction(
    () =>
      (window as unknown as { workflowRunnerReady?: boolean })
        .workflowRunnerReady === true,
    null,
    { timeout: 15_000 }
  );
});

test("a real constant node produces its output in-browser", async ({ page }) => {
  const result = await page.evaluate(() =>
    window.runBrowserNodesInBrowser({
      nodes: [
        {
          id: "s",
          type: "nodetool.constant.String",
          name: "text",
          properties: { value: "hello browser" }
        }
      ],
      edges: []
    })
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe("completed");
  expect(result.outputs.text).toEqual(["hello browser"]);
  // Stream is shaped like the server's: job_update present, every frame stamped.
  expect(result.messageTypes).toContain("job_update");
  expect(result.allStamped).toBe(true);
});

test("a real compute node (list.Range) runs in-browser", async ({ page }) => {
  const result = await page.evaluate(() =>
    window.runBrowserNodesInBrowser({
      nodes: [
        {
          id: "r",
          type: "nodetool.list.Range",
          name: "range",
          properties: { start: 0, stop: 5, step: 1 }
        }
      ],
      edges: []
    })
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe("completed");
  expect(result.outputs.range).toEqual([[0, 1, 2, 3, 4]]);
});

test("data flows across an edge between two real nodes in-browser", async ({
  page
}) => {
  const result = await page.evaluate(() =>
    window.runBrowserNodesInBrowser({
      nodes: [
        {
          id: "src",
          type: "nodetool.constant.String",
          properties: { value: "routed through the browser" }
        },
        { id: "thru", type: "nodetool.control.Reroute", name: "passed" }
      ],
      edges: [
        {
          source: "src",
          sourceHandle: "output",
          target: "thru",
          targetHandle: "input_value"
        }
      ]
    })
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe("completed");
  expect(result.outputs.passed).toEqual(["routed through the browser"]);
});

test("a server-only node type is rejected before execution", async ({
  page
}) => {
  const result = await page.evaluate(() =>
    window.runBrowserNodesInBrowser({
      nodes: [{ id: "x", type: "nodetool.image.Scale", name: "img" }],
      edges: []
    })
  );

  // Not in the browser registry → the run fails fast rather than producing output.
  expect(result.status).not.toBe("completed");
});
