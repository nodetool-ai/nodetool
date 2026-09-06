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

  /**
   * The output menu is a floating list: its rows sit anywhere from tens to
   * hundreds of pixels from the handle, and flip side near a viewport edge.
   * Placing the new node against the clicked row put it wherever the menu
   * happened to be — a Preview landed 225px right of the handle and 110px
   * above it, a Reroute somewhere else again. The node belongs against the
   * handle, with its input handle level with it.
   */
  test("places a node from the output menu level with the handle it came from", async ({
    page
  }) => {
    const editor = new EditorPage(page);
    await editor.open(FIXTURES.editorGraph);

    // The fixture's Output node sits directly right of the handle; move it
    // away so this test measures alignment, not the clearance rule below.
    await editor.dragNode("result_output", 0, 600);

    const handle = await editor.outputHandleCenter("prompt_input");
    const created = await editor.createFromOutputHandle(
      "prompt_input",
      "create-preview-node"
    );
    const geometry = await editor.nodeGeometry(created);

    expect(geometry.inputHandle).not.toBeNull();
    // Level with the source handle: the edge between them comes out flat.
    expect(Math.abs(geometry.inputHandle!.y - handle.y)).toBeLessThan(8);
    // Just to the right of it, not off in the direction the menu opened.
    expect(geometry.box.x - handle.x).toBeGreaterThan(0);
    expect(geometry.box.x - handle.x).toBeLessThan(120);
  });

  test("keeps a second node from the same handle clear of the first", async ({
    page
  }) => {
    const editor = new EditorPage(page);
    await editor.open(FIXTURES.editorGraph);

    const first = await editor.createFromOutputHandle(
      "prompt_input",
      "create-preview-node"
    );
    const second = await editor.createFromOutputHandle(
      "prompt_input",
      "create-preview-node"
    );

    const a = (await editor.nodeGeometry(first)).box;
    const b = (await editor.nodeGeometry(second)).box;
    const overlaps =
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;
    expect(overlaps).toBe(false);
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
