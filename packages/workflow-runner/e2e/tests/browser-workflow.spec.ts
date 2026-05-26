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

test("browser-compatible node registry is loaded in the harness", async ({
  page
}) => {
  const nodeTypes = await page.evaluate(() => window.browserCompatibleNodeTypes);
  expect(nodeTypes.length).toBeGreaterThan(0);
  expect(nodeTypes).toContain("nodetool.constant.String");
  expect(nodeTypes).toContain("nodetool.list.Range");
  expect(nodeTypes).toContain("nodetool.list.RepeatValue");
});

test("a workflow can execute browser-compatible base nodes", async ({ page }) => {
  const result = await page.evaluate(async () => {
    return window.runWorkflowInBrowser({
      nodes: [
        {
          id: "source",
          type: "nodetool.constant.String",
          properties: { value: "echo" }
        },
        {
          id: "repeat",
          type: "nodetool.list.RepeatValue",
          name: "copies",
          properties: { times: 3 }
        }
      ],
      edges: [
        {
          source: "source",
          sourceHandle: "output",
          target: "repeat",
          targetHandle: "value"
        }
      ]
    });
  });

  expect(result.status).toBe("completed");
  expect(result.outputs.copies).toEqual([["echo", "echo", "echo"]]);
});

test("a browser-compatible range node produces deterministic sequence", async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    return window.runWorkflowInBrowser({
      nodes: [
        {
          id: "range",
          type: "nodetool.list.Range",
          name: "sequence",
          properties: { start: 2, stop: 10, step: 3, max_output_length: 10 }
        }
      ],
      edges: []
    });
  });

  expect(result.status).toBe("completed");
  expect(result.outputs.sequence).toEqual([[2, 5, 8]]);
});

/**
 * WebGPU shader catalog runs against the browser's `navigator.gpu`. This is
 * the test that proves the GPU pool isn't just Dawn-portable — the same
 * `colorBrightnessContrastV1` module that runs server-side on Node also
 * runs in a V8 isolate, and the readback matches the CPU reference. Skips
 * with a warning when no adapter is available (e.g. CI runners without a
 * Vulkan/Swiftshader driver installed) rather than failing hard.
 */
test("WebGPU shader catalog runs the brightness/contrast module in-browser", async ({
  page
}, testInfo) => {
  const result = await page.evaluate(() =>
    window.runBrightnessShaderInBrowser({
      size: 4,
      source: [128, 128, 128],
      brightness: 0.2,
      contrast: 1.5
    })
  );

  if (!result.adapterFound) {
    testInfo.skip(
      true,
      `No WebGPU adapter (headless Chromium without Vulkan): ${result.error ?? "unknown"}`
    );
    return;
  }

  expect(result.ok).toBe(true);
  expect(result.outputPixel).toBeDefined();
  // Allow ±1 LSB tolerance (the shader runs in linear premultiplied space,
  // CPU reference works in straight; rounding noise can differ by one).
  expect(result.maxAbsError ?? 999).toBeLessThanOrEqual(1);
});

/**
 * Confirms the workflow-runner host actually has the Web Platform APIs we
 * expect to use for asset round-trips inside browser workflows: same-origin
 * fetch, Blob + `URL.createObjectURL`, IndexedDB, and SubtleCrypto. If a
 * deployment target ships a stripped runtime (some edge platforms do), this
 * fails early instead of inside a node's `process()`.
 */
test("standard Web Platform APIs are usable from harness code", async ({
  page
}) => {
  const result = await page.evaluate(() => window.runWebApisInBrowser());

  expect(result.error, result.error).toBeUndefined();
  expect(result.fetch).toBe(true);
  expect(result.blob).toBe(true);
  expect(result.objectUrl).toBe(true);
  expect(result.indexedDb).toBe(true);
  expect(result.cryptoSubtle).toBe(true);
});
