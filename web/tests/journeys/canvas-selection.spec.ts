/**
 * Journey: select, group and delete nodes on the canvas, then undo.
 *
 * A user reported that selecting, grouping and deleting nodes behaved
 * inconsistently. Three causes were found, and each test below pins one:
 * Shift+click replaced the selection instead of adding to it, a click on a
 * node's resize edge stopped undo from recording later edits, and a group
 * could be selected only by drawing a box around all of it.
 *
 * Runs against `wf-editor-journey`, the two-node `StringInput → Output`
 * fixture seeded by `screenshot-server.ts`.
 */

import { test, expect, FIXTURES } from "./fixtures";
import { EditorPage } from "./pages";

test.describe("Canvas selection", () => {
  test("group children follow a drag without a position transition", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.open(FIXTURES.editorGraph);
    await editor.clickNode("prompt_input");
    await page.keyboard.press("ControlOrMeta+g");
    await expect(editor.groups()).toHaveCount(1);
    await editor.clickPane();
    await editor.waitForNodeSettled("prompt_input");

    const label = await editor.groups().locator(".group-label").boundingBox();
    if (!label) {
      throw new Error("the group has no label to drag");
    }
    await page.mouse.move(label.x + 8, label.y + label.height / 2);
    await page.mouse.down();
    await page.mouse.move(label.x + 108, label.y + label.height / 2 + 80, { steps: 5 });
    await expect(editor.groups()).toHaveClass(/dragging/);
    await expect(editor.node("prompt_input")).not.toHaveCSS("transition-property", /transform|all/);
    await page.mouse.up();
    await expect(editor.node("prompt_input")).toHaveCSS("transition-property", /transform/);
  });

  test("Alt/Option drags a node out and Ctrl/Cmd keeps it grouped", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.open(FIXTURES.editorGraph);
    await editor.clickNode("prompt_input");
    await page.keyboard.press("ControlOrMeta+g");
    await expect(editor.groups()).toHaveCount(1);
    const header = editor.node("prompt_input").locator(".node-header");
    await expect(header).toHaveClass(/has-parent/);

    for (const key of ["Control", "Meta"] as const) {
      await editor.clickNode("prompt_input");
      await page.keyboard.down(key);
      await expect(editor.groups().locator(".group-node")).toHaveCSS("opacity", "1");
      await editor.dragNode("prompt_input", 20, 0);
      await page.keyboard.up(key);
      await expect(header).toHaveClass(/has-parent/);
    }

    await editor.clickNode("prompt_input");
    await page.keyboard.down("Alt");
    await expect(editor.groups().locator(".group-node")).toHaveCSS("opacity", "0.5");
    await editor.dragNode("prompt_input", 40, 0);
    await page.keyboard.up("Alt");
    await expect(header).not.toHaveClass(/has-parent/);
    await expect(editor.groups()).toHaveCount(1);
  });

  test("Shift+click adds a node to the selection and removes it again", async ({
    page
  }) => {
    const editor = new EditorPage(page);
    await editor.open(FIXTURES.editorGraph);

    await editor.clickNode("prompt_input");
    await editor.clickNode("result_output", ["Shift"]);
    await expect(editor.selectedNodes()).toHaveCount(2);

    await editor.clickNode("result_output", ["Shift"]);
    await expect(editor.selectedNodes()).toHaveCount(1);
    await expect(editor.node("prompt_input")).toHaveClass(/selected/);
  });

  test("each delete after a click on a resize edge is its own undo step", async ({
    page
  }) => {
    const editor = new EditorPage(page);
    await editor.open(FIXTURES.editorGraph);
    await editor.clickNode("prompt_input");
    await page.keyboard.press("ControlOrMeta+g");
    await expect(editor.groups()).toHaveCount(1);

    // A click without a drag: React Flow reports the start of a resize but
    // never its end, which used to leave undo paused while the group stayed
    // on the canvas.
    await editor.clickResizeEdge(editor.groups());
    await editor.clickNode("result_output");
    await page.keyboard.press("Delete");
    await expect(editor.node("result_output")).toHaveCount(0);
    await editor.clickNode("prompt_input");
    await page.keyboard.press("Delete");
    await expect(editor.node("prompt_input")).toHaveCount(0);

    // One undo brings back only the last deleted node.
    await page.keyboard.press("ControlOrMeta+z");
    await expect(editor.node("prompt_input")).toBeVisible();
    await expect(editor.node("result_output")).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+z");
    await expect(editor.node("result_output")).toBeVisible();
    await expect(editor.edges()).toHaveCount(1);
  });

  test("a click on a group's label selects the group", async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.open(FIXTURES.editorGraph);

    await editor.clickNode("prompt_input");
    await page.keyboard.press("ControlOrMeta+g");
    await expect(editor.groups()).toHaveCount(1);
    await editor.clickPane();
    await expect(editor.selectedNodes()).toHaveCount(0);

    await editor.clickGroupLabel();
    await expect(editor.groups()).toHaveClass(/selected/);
    await expect(editor.selectedNodes()).toHaveCount(1);

    // Shift+click on the label takes the group out of the selection again.
    await editor.clickGroupLabel(["Shift"]);
    await expect(editor.selectedNodes()).toHaveCount(0);

    // Deleting a selected group removes the frame and keeps its nodes.
    await editor.clickGroupLabel();
    await page.keyboard.press("Delete");
    await expect(editor.groups()).toHaveCount(0);
    await expect(editor.node("prompt_input")).toBeVisible();

    await page.keyboard.press("ControlOrMeta+z");
    await expect(editor.groups()).toHaveCount(1);
  });
});
