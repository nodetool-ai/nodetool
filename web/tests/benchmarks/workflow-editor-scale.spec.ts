import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { seedReturningUser, waitForAppReady } from "../smoke/pageLoadHelpers";

const GRAPH_SIZES = [50, 250, 1_000] as const;
const TINY_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%235b8cff'/%3E%3C/svg%3E";

const LOAD_BUDGET_MS: Record<(typeof GRAPH_SIZES)[number], number> = {
  50: 10_000,
  250: 15_000,
  1_000: 25_000
};

const makeGraph = (nodeCount: number) => ({
  nodes: Array.from({ length: nodeCount }, (_, index) => {
    const imageNode = index % 20 === 0;
    const sourceNode = index % 2 === 0;
    const streamingNode = sourceNode && index % 20 === 18;
    return {
      id: `scale-${index}`,
      type: sourceNode
        ? imageNode
          ? "nodetool.input.ImageInput"
          : streamingNode
            ? "nodetool.control.RepeatCount"
            : "nodetool.input.StringInput"
        : "nodetool.control.Reroute",
      data: {
        name: imageNode
          ? `image_${index}`
          : streamingNode
            ? `stream_${index}`
            : sourceNode
              ? `text_${index}`
              : `reroute_${index}`,
        ...(sourceNode
          ? streamingNode
            ? { count: 3 }
            : {
                value: imageNode
                  ? { type: "image", uri: TINY_IMAGE }
                  : `Value ${index}`
              }
          : {})
      },
      ui_properties: {
        position: {
          x: (index % 25) * 340,
          y: Math.floor(index / 25) * 220
        },
        width: 280
      }
    };
  }),
  edges: Array.from({ length: Math.floor(nodeCount / 2) }, (_, index) => ({
    id: `scale-edge-${index}`,
    source: `scale-${index * 2}`,
    sourceHandle: "output",
    target: `scale-${index * 2 + 1}`,
    targetHandle: "input_value"
  }))
});

const createWorkflow = async (
  request: APIRequestContext,
  nodeCount: number
): Promise<string> => {
  const response = await request.post("/api/workflows", {
    data: {
      name: `Editor scale ${nodeCount}`,
      access: "private",
      description: "Browser performance fixture",
      run_mode: "workflow",
      tags: ["benchmark"],
      graph: makeGraph(nodeCount)
    }
  });
  expect(response.ok(), await response.text()).toBe(true);
  const workflow = await response.json();
  return workflow.id;
};

const findBlankPanePoint = async (
  page: Page
): Promise<{ x: number; y: number }> =>
  page.evaluate(() => {
    const pane = document.querySelector(".react-flow__pane");
    if (!pane) {
      throw new Error("workflow pane did not render");
    }
    const bounds = pane.getBoundingClientRect();
    for (let y = bounds.top + 20; y < bounds.bottom - 20; y += 20) {
      for (let x = bounds.left + 20; x < bounds.right - 20; x += 20) {
        if (document.elementFromPoint(x, y) === pane) {
          return { x, y };
        }
      }
    }
    throw new Error("workflow pane has no blank point for a pan gesture");
  });

const measureInteractionToPaint = async (page: Page): Promise<number> => {
  const startPoint = await findBlankPanePoint(page);
  const samples: number[] = [];
  let previousTransform = await page
    .locator(".react-flow__viewport")
    .evaluate((viewport) => (viewport as HTMLElement).style.transform);

  for (let index = 0; index < 10; index += 1) {
    const direction = index % 2 === 0 ? 1 : -1;
    const startedAt = await page.evaluate(() => performance.now());
    await page.mouse.move(startPoint.x, startPoint.y);
    await page.mouse.down();
    await page.mouse.move(
      startPoint.x + 40 * direction,
      startPoint.y + 20 * direction,
      { steps: 2 }
    );
    await page.mouse.up();
    const elapsedMs = await page.evaluate(async (start) => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      return performance.now() - start;
    }, startedAt);
    const nextTransform = await page
      .locator(".react-flow__viewport")
      .evaluate((viewport) => (viewport as HTMLElement).style.transform);
    expect(nextTransform).not.toBe(previousTransform);
    previousTransform = nextTransform;
    samples.push(elapsedMs);
  }

  samples.sort((left, right) => left - right);
  return samples[Math.ceil(samples.length * 0.95) - 1] ?? 0;
};

const measureRepeatedUpdates = async (page: Page): Promise<number> => {
  const stringInputNode = page.locator('[data-id="scale-2"]');
  await stringInputNode.click({ force: true });
  await page.getByRole("button", { name: "Fit selection" }).click();
  const visibleInput = stringInputNode.getByRole("textbox").first();
  await expect(visibleInput).toBeVisible();
  await visibleInput.focus();

  return page.evaluate(async () => {
    const input = document.querySelector<HTMLTextAreaElement>(
      '[data-id="scale-2"] textarea'
    );
    if (!input || !input.checkVisibility()) {
      throw new Error("visible workflow input did not render");
    }
    const setNativeValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    if (!setNativeValue) {
      throw new Error("native input value setter is unavailable");
    }
    const start = performance.now();
    for (let index = 0; index < 30; index += 1) {
      setNativeValue.call(input, `stream ${index}`);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    if (input.value !== "stream 29") {
      throw new Error("repeated editor input updates did not apply");
    }
    input.blur();
    return performance.now() - start;
  });
};

const persistedNodeValue = async (
  request: APIRequestContext,
  workflowId: string,
  nodeId: string
): Promise<unknown> => {
  const response = await request.get(`/api/workflows/${workflowId}`);
  if (!response.ok()) {
    return undefined;
  }
  const workflow = await response.json();
  const node = workflow.graph.nodes.find(
    (candidate: { id?: string }) => candidate.id === nodeId
  );
  return node?.data?.value;
};

const measureExecutionUpdates = async (
  page: Page
): Promise<{ elapsedMs: number; mutationCount: number }> => {
  const runButton = page.getByRole("button", {
    name: "Run entire workflow"
  });
  await expect(runButton).toBeEnabled();

  await page.evaluate(() => {
    const editor = document.querySelector(".react-flow__nodes");
    const button = document.querySelector<HTMLButtonElement>(".composer-run");
    if (!editor || !button) {
      throw new Error("workflow execution controls did not render");
    }
    const state = {
      startedAt: performance.now(),
      nodeMutationCount: 0,
      sawActiveState: false
    };
    const nodeObserver = new MutationObserver((records) => {
      state.nodeMutationCount += records.length;
    });
    const controlObserver = new MutationObserver(() => {
      state.sawActiveState = true;
    });
    nodeObserver.observe(editor, {
      attributes: true,
      childList: true,
      subtree: true
    });
    controlObserver.observe(button, {
      attributes: true,
      childList: true,
      subtree: true
    });
    Object.assign(window, {
      __editorScaleExecution: { state, nodeObserver, controlObserver }
    });
  });

  await runButton.click();
  await page.waitForFunction(
    () => {
      const benchmark = (
        window as Window & {
          __editorScaleExecution?: {
            state: { sawActiveState: boolean };
          };
        }
      ).__editorScaleExecution;
      const button = document.querySelector<HTMLButtonElement>(".composer-run");
      return Boolean(
        benchmark?.state.sawActiveState &&
          button?.textContent?.toLowerCase().includes("run entire workflow")
      );
    },
    undefined,
    { timeout: 30_000 }
  );

  return page.evaluate(() => {
    const benchmark = (
      window as Window & {
        __editorScaleExecution?: {
          state: {
            startedAt: number;
            nodeMutationCount: number;
          };
          nodeObserver: MutationObserver;
          controlObserver: MutationObserver;
        };
      }
    ).__editorScaleExecution;
    if (!benchmark) {
      throw new Error("execution benchmark state is unavailable");
    }
    benchmark.nodeObserver.disconnect();
    benchmark.controlObserver.disconnect();
    return {
      elapsedMs: performance.now() - benchmark.state.startedAt,
      mutationCount: benchmark.state.nodeMutationCount
    };
  });
};

for (const nodeCount of GRAPH_SIZES) {
  test(`${nodeCount} nodes stay within editor interaction budgets`, async ({
    page,
    request
  }) => {
    const reset = await request.post("/api/test/reset");
    expect(reset.ok()).toBe(true);
    const workflowId = await createWorkflow(request, nodeCount);
    await seedReturningUser(page);

    const loadStart = Date.now();
    await page.goto(`/editor/${workflowId}`, { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await expect(page.locator(".react-flow__node")).toHaveCount(nodeCount);
    const imagePreviews = page.locator(".react-flow__node .image-property img");
    const expectedImageCount = Math.ceil(nodeCount / 20);
    await expect(imagePreviews).toHaveCount(expectedImageCount);
    await expect
      .poll(() =>
        imagePreviews.evaluateAll(
          (images) =>
            images.filter((image) => (image as HTMLImageElement).naturalWidth > 0)
              .length
        )
      )
      .toBe(expectedImageCount);
    const loadToRenderMs = Date.now() - loadStart;

    const interactionToPaintMs = await measureInteractionToPaint(page);
    const repeatedUpdatesMs = await measureRepeatedUpdates(page);
    await page.keyboard.press("Control+s");
    await expect
      .poll(() => persistedNodeValue(request, workflowId, "scale-2"), {
        timeout: 15_000
      })
      .toBe("stream 29");
    const executionUpdates = await measureExecutionUpdates(page);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await cdp.send("HeapProfiler.collectGarbage");
    const metrics = await cdp.send("Performance.getMetrics");
    const retainedHeapBytes =
      metrics.metrics.find((metric) => metric.name === "JSHeapUsedSize")?.value ?? 0;

    console.log(
      JSON.stringify({
        nodeCount,
        mediaNodeCount: Math.ceil(nodeCount / 20),
        streamingNodeCount: Math.ceil(Math.max(0, nodeCount - 18) / 20),
        loadToRenderMs,
        interactionToPaintMs: Number(interactionToPaintMs.toFixed(2)),
        repeatedUpdatesMs: Number(repeatedUpdatesMs.toFixed(2)),
        executionUpdatesMs: Number(executionUpdates.elapsedMs.toFixed(2)),
        executionMutationCount: executionUpdates.mutationCount,
        retainedHeapMb: Number((retainedHeapBytes / 1024 / 1024).toFixed(2))
      })
    );

    expect(loadToRenderMs).toBeLessThan(LOAD_BUDGET_MS[nodeCount]);
    expect(interactionToPaintMs).toBeLessThan(250);
    expect(repeatedUpdatesMs).toBeLessThan(2_000);
    expect(executionUpdates.mutationCount).toBeGreaterThan(0);
    expect(executionUpdates.elapsedMs).toBeLessThan(30_000);
    expect(retainedHeapBytes).toBeLessThan(512 * 1024 * 1024);
  });
}
