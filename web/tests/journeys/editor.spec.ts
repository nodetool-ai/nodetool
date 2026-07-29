/**
 * Journey: build and run a graph in the editor.
 *
 * The core loop of the product. A user opens a workflow, adds a node from the
 * node menu, runs the graph, and sees the result on the canvas. Every step here
 * is a thing that has no other coverage: the smoke suite only asserts the
 * editor route mounts, and the visual suite only asserts it looks unchanged —
 * both pass fine while Run does nothing.
 *
 * Runs against `wf-editor-journey`, a two-node `StringInput → Output` fixture
 * seeded by `screenshot-server.ts`. Both nodes are structural, so they execute
 * for real: the value the canvas shows after a run is genuinely the value that
 * travelled through the kernel, not a fake.
 */

import { test, expect, FIXTURES } from "./fixtures";
import { EditorPage } from "./pages";

test.describe("Editor", () => {
  test("loads a saved graph with its nodes and edges", async ({
    page,
    pageErrors
  }) => {
    const editor = new EditorPage(page);
    await editor.open(FIXTURES.editorGraph);

    await expect(editor.node("prompt_input")).toBeVisible();
    await expect(editor.node("result_output")).toBeVisible();
    await expect(editor.edges()).toHaveCount(1);

    expect(pageErrors, "editor loaded with page errors").toEqual([]);
  });

  test("adds a node from the node menu", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.open(FIXTURES.editorGraph);

    // Relative to a measured baseline rather than an absolute count: the suite
    // shares one in-memory backend, so an earlier test may already have added
    // a node to this graph.
    const before = await editor.nodes().count();

    await editor.addNode("Concat");

    await expect(editor.nodes()).toHaveCount(before + 1);
  });

  test("runs the graph and shows the result on the canvas", async ({
    page
  }) => {
    const editor = new EditorPage(page);
    await editor.open(FIXTURES.editorGraph);

    await editor.run();

    // The Output node renders the value it received. `echoSeedValue` is the
    // StringInput's seeded value, so seeing it here means the run actually
    // dispatched the input, traversed the edge, and streamed the output back.
    await editor.waitForCanvasText(FIXTURES.echoSeedValue);
  });
});
